import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import { handleDownloadsRequest } from './server/downloads.ts';
import { handleCacheRequest } from './server/cache.ts';
import { handleExportRequest } from './server/exportGguf.ts';
import { handleMetricsRequest } from './server/metrics.ts';
import { handleDaemonControlRequest, handleDaemonRequest } from './server/daemon.ts';
import { GgufImportError, importGgufStream } from './server/importGguf.ts';
import { handleModelScopePullRequest, handleModelScopeSearchRequest } from './server/modelscope.ts';

type Middleware = (request: IncomingMessage, response: ServerResponse, next: () => void) => void;

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const ollamaHost = (
    env.OLLAMA_HOST ||
    process.env.OLLAMA_HOST ||
    'http://127.0.0.1:11434'
  ).replace(/\/+$/, '');
  const proxyToken = (env.PROXY_TOKEN || process.env.PROXY_TOKEN || '').trim();

  const readToken = (request: IncomingMessage): string | undefined => {
    const authorization = request.headers.authorization;
    if (authorization?.startsWith('Bearer ')) {
      return authorization.slice('Bearer '.length).trim();
    }
    const header = request.headers['x-proxy-token'];
    return Array.isArray(header) ? header[0] : header;
  };

  const requireToken: Middleware = (request, response, next) => {
    if (!proxyToken || readToken(request) === proxyToken) {
      next();
      return;
    }
    response.statusCode = 401;
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ error: '未授权：缺少或错误的代理令牌。' }));
  };

  const ggufImportPlugin = {
    name: 'ollama-gguf-import',
    configureServer(server: { middlewares: { use: (path: string, handler: Middleware) => void } }) {
      server.middlewares.use('/ollama', requireToken);
      server.middlewares.use('/api/import', requireToken);
      server.middlewares.use('/api/modelscope', requireToken);
      server.middlewares.use('/api/downloads', requireToken);
      server.middlewares.use('/api/cache', requireToken);
      server.middlewares.use('/api/export', requireToken);
      server.middlewares.use('/api/metrics', requireToken);
      server.middlewares.use('/api/daemon', requireToken);
      server.middlewares.use('/api/cache', (request, response) => {
        void handleCacheRequest(request, response);
      });
      server.middlewares.use('/api/downloads', (request, response) => {
        void handleDownloadsRequest(request, response, ollamaHost);
      });
      server.middlewares.use('/api/export', (request, response) => {
        void handleExportRequest(request, response);
      });
      server.middlewares.use('/api/metrics', (request, response) => {
        void handleMetricsRequest(request, response);
      });
      server.middlewares.use('/api/daemon/control', (request, response) => {
        void handleDaemonControlRequest(request, response);
      });
      server.middlewares.use('/api/daemon', (request, response) => {
        void handleDaemonRequest(request, response);
      });
      server.middlewares.use('/api/modelscope/search', (request, response, next) => {
        if (request.method !== 'GET') {
          next();
          return;
        }
        void handleModelScopeSearchRequest(request, response);
      });
      server.middlewares.use('/api/modelscope/pull', (request, response, next) => {
        if (request.method !== 'POST') {
          next();
          return;
        }
        void handleModelScopePullRequest(request, response, ollamaHost);
      });
      server.middlewares.use('/api/import', (request, response, next) => {
        if (request.method !== 'POST') {
          next();
          return;
        }

        const url = new URL(request.url ?? '', 'http://localhost');
        void importGgufStream(request, {
          filename: url.searchParams.get('filename') ?? '',
          model: url.searchParams.get('name') ?? undefined,
          ollamaHost
        })
          .then((result) => {
            response.statusCode = 200;
            response.setHeader('content-type', 'application/json');
            response.end(JSON.stringify(result));
          })
          .catch((error: unknown) => {
            if (response.writableEnded) return;
            const status = error instanceof GgufImportError ? error.status : 502;
            const message = error instanceof Error ? error.message : String(error);
            response.statusCode = status;
            response.setHeader('content-type', 'application/json');
            response.end(JSON.stringify({ error: message }));
          });
      });
    }
  };

  return {
    plugins: [react(), tailwindcss(), ggufImportPlugin],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.')
      }
    },
    server: {
      host: '127.0.0.1',
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      proxy: {
        '/ollama': {
          target: ollamaHost,
          changeOrigin: true,
          rewrite: (requestPath) => requestPath.replace(/^\/ollama/, '')
        },
        '/api/catalog': {
          target: 'https://ollama.com',
          changeOrigin: true,
          rewrite: (requestPath) => requestPath.replace(/^\/api\/catalog/, '')
        },
        '/api/hf': {
          target: 'https://huggingface.co',
          changeOrigin: true,
          rewrite: (requestPath) => requestPath.replace(/^\/api\/hf/, '')
        }
      }
    }
  };
});
