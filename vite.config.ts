import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import { handleDownloadsRequest } from './server/downloads.ts';
import { handleCacheRequest } from './server/cache.ts';
import { handleExportRequest } from './server/exportGguf.ts';
import { handleMetricsRequest } from './server/metrics.ts';
import { handleDaemonControlRequest, handleDaemonRequest } from './server/daemon.ts';
import { GgufImportError, importGgufStream } from './server/importGguf.ts';
import { handleModelScopePullRequest, handleModelScopeSearchRequest } from './server/modelscope.ts';
import { createAuth } from './server/auth.ts';
import { createCsrfGuard, createHostGuard, parseAllowedHosts } from './server/security.ts';
import type { Middleware } from './server/security.ts';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const ollamaHost = (
    env.OLLAMA_HOST ||
    process.env.OLLAMA_HOST ||
    'http://127.0.0.1:11434'
  ).replace(/\/+$/, '');
  const proxyToken = (env.PROXY_TOKEN || process.env.PROXY_TOKEN || '').trim();

  const auth = createAuth({
    token: proxyToken,
    secureCookies: env.COOKIE_SECURE === '1' || process.env.COOKIE_SECURE === '1'
  });
  const hostGuard = createHostGuard({
    allowedHosts: parseAllowedHosts(env.ALLOWED_HOSTS || process.env.ALLOWED_HOSTS)
  });
  const csrfGuard = createCsrfGuard();

  const ggufImportPlugin = {
    name: 'ollama-gguf-import',
    configureServer(server: {
      config: { server: { host?: string | boolean } };
      middlewares: {
        use: {
          (handler: Middleware): void;
          (path: string, handler: Middleware): void;
        };
      };
    }) {
      const bindHost = server.config.server.host;
      const bindsNonLoopback =
        bindHost === true ||
        bindHost === '0.0.0.0' ||
        bindHost === '::' ||
        (typeof bindHost === 'string' && !['127.0.0.1', 'localhost', '::1'].includes(bindHost));
      if (bindsNonLoopback && !proxyToken && process.env.ALLOW_INSECURE_BIND !== '1') {
        throw new Error(
          '拒绝启动开发服务器：非回环绑定且未设置 PROXY_TOKEN。请设置 PROXY_TOKEN，或显式设置 ALLOW_INSECURE_BIND=1。'
        );
      }
      if (bindsNonLoopback && proxyToken && proxyToken.length < 32) {
        throw new Error('非回环绑定要求 PROXY_TOKEN 至少 32 个字符。');
      }

      server.middlewares.use(hostGuard);
      server.middlewares.use(csrfGuard);
      server.middlewares.use(auth.handleRoutes);
      server.middlewares.use(auth.guardNavigation);
      // 全局挂载：Vite 的路径挂载会剥离前缀，requireSession 需要完整 URL。
      server.middlewares.use(auth.requireSession);
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
    build: {
      rollupOptions: {
        // 经典界面保留在 `/`；UI3 以独立入口并行提供在 `/ui3/`。
        input: {
          main: path.resolve(import.meta.dirname, 'index.html'),
          ui3: path.resolve(import.meta.dirname, 'ui3/index.html')
        }
      }
    },
    server: {
      host: '127.0.0.1',
      port: 39471,
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
