import 'dotenv/config';
import express, { type RequestHandler } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GgufImportError, importGgufStream } from './server/importGguf';
import { handleDownloadsRequest } from './server/downloads';
import { handleCacheRequest } from './server/cache';
import { handleExportRequest } from './server/exportGguf';
import { handleMetricsRequest } from './server/metrics';
import { handleDaemonControlRequest, handleDaemonRequest } from './server/daemon';
import { handleModelScopePullRequest, handleModelScopeSearchRequest } from './server/modelscope';

const app = express();
const rootDir = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(rootDir, 'dist');
const ollamaHost = (process.env.OLLAMA_HOST || 'http://127.0.0.1:11434').replace(/\/+$/, '');
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '127.0.0.1';
const proxyToken = (process.env.PROXY_TOKEN || '').trim();
const isLoopback = host === '127.0.0.1' || host === 'localhost' || host === '::1';

function readProxyToken(request: express.Request): string | undefined {
  const authorization = request.headers.authorization;
  if (authorization?.startsWith('Bearer ')) {
    return authorization.slice('Bearer '.length).trim();
  }
  const header = request.headers['x-proxy-token'];
  return Array.isArray(header) ? header[0] : header;
}

/**
 * Optional shared-secret gate. It is disabled unless PROXY_TOKEN is set;
 * the default localhost-only binding remains the primary protection.
 */
const requireProxyToken: RequestHandler = (request, response, next) => {
  if (!proxyToken) {
    next();
    return;
  }
  if (readProxyToken(request) === proxyToken) {
    next();
    return;
  }
  response.status(401).json({ error: '未授权：缺少或错误的代理令牌。' });
};

app.use(
  [
    '/ollama',
    '/api/import',
    '/api/modelscope',
    '/api/downloads',
    '/api/cache',
    '/api/export',
    '/api/metrics',
    '/api/daemon'
  ],
  requireProxyToken
);

const HOP_BY_HOP = new Set([
  'host',
  'connection',
  'content-length',
  'accept-encoding',
  'transfer-encoding',
  'keep-alive',
  'upgrade',
  'proxy-authorization',
  'proxy-authenticate',
  'te',
  'trailer'
]);

app.get('/healthz', (_request, response) => {
  response.json({ ok: true, ollamaHost, authRequired: Boolean(proxyToken) });
});

/**
 * Read-only proxy for the public Ollama model library search page.
 * The frontend parses the returned HTML into model cards.
 */
app.get('/api/catalog/search', async (request, response) => {
  const query = typeof request.query.q === 'string' ? request.query.q.trim() : '';
  if (!query) {
    response.status(400).json({ error: '缺少搜索关键字' });
    return;
  }

  try {
    const upstream = await fetch(`https://ollama.com/search?q=${encodeURIComponent(query)}`, {
      headers: {
        accept: 'text/html',
        'user-agent': 'Mozilla/5.0 (compatible; OllamaStudio/0.1)'
      },
      signal: AbortSignal.timeout(12000)
    });

    if (!upstream.ok) {
      response.status(502).json({ error: `模型库返回 HTTP ${upstream.status}` });
      return;
    }

    const html = await upstream.text();
    response.type('text/html').setHeader('cache-control', 'no-store').send(html);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    response.status(502).json({ error: `无法连接 ollama.com：${message}` });
  }
});

/**
 * Read-only proxy for the Hugging Face model search API.
 * Only `/api/models...` is allowed; the target origin is fixed.
 */
app.get('/api/hf/*', async (request, response) => {
  const suffix = request.originalUrl.replace(/^\/api\/hf/, '');
  const target = new URL(suffix, 'https://huggingface.co');

  if (target.origin !== 'https://huggingface.co' || !target.pathname.startsWith('/api/models')) {
    response.status(400).json({ error: '不支持的 Hugging Face 路径' });
    return;
  }

  try {
    const upstream = await fetch(target, {
      headers: {
        accept: 'application/json',
        'user-agent': 'Mozilla/5.0 (compatible; OllamaStudio/0.1)'
      },
      signal: AbortSignal.timeout(15000)
    });

    if (!upstream.ok) {
      response.status(502).json({ error: `Hugging Face 返回 HTTP ${upstream.status}` });
      return;
    }

    const data = await upstream.json();
    response.setHeader('cache-control', 'no-store').json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    response.status(502).json({ error: `无法连接 huggingface.co：${message}` });
  }
});

/**
 * Stream a browser GGUF upload to a temp file and register it with Ollama.
 * This route intentionally has no JSON body parser: the request body is the
 * raw file stream. The temp file is removed by importGgufStream.
 */
app.post('/api/import', async (request, response) => {
  const url = new URL(request.originalUrl, 'http://localhost');
  try {
    const result = await importGgufStream(request, {
      filename: url.searchParams.get('filename') ?? '',
      model: url.searchParams.get('name') ?? undefined,
      ollamaHost
    });
    response.json(result);
  } catch (error) {
    const status = error instanceof GgufImportError ? error.status : 502;
    const message = error instanceof Error ? error.message : String(error);
    response.status(status).json({ error: message });
  }
});

/**
 * Searches ModelScope for GGUF repositories. The handler normalizes the
 * upstream payload so the client only deals with a stable shape.
 */
app.get('/api/modelscope/search', (request, response) => {
  void handleModelScopeSearchRequest(request, response);
});

/**
 * Downloads a GGUF from ModelScope and registers it with Ollama.
 * Streams NDJSON progress; the raw body is parsed by the shared handler.
 */
app.post('/api/modelscope/pull', (request, response) => {
  void handleModelScopePullRequest(request, response, ollamaHost);
});

/**
 * 后台下载任务：下载在服务端继续，浏览器刷新后重新接上即可。
 * `POST` 创建/复用任务，`GET` 列表或单个任务，`DELETE` 取消。
 */
app.use('/api/downloads', (request, response) => {
  void handleDownloadsRequest(request, response, ollamaHost);
});

/** 缓存扫描与清理：只回收未引用 blob、未完成下载与本应用临时目录。 */
app.use('/api/cache', (request, response) => {
  void handleCacheRequest(request, response);
});

/** 把已安装模型的 Ollama blob 导出为 GGUF（只读模型存储，写入用户目录）。 */
app.post('/api/export', (request, response) => {
  void handleExportRequest(request, response);
});

/** 磁盘、内存、CPU 与（macOS 可用的）GPU 指标。 */
app.get('/api/metrics', (request, response) => {
  void handleMetricsRequest(request, response);
});

/** 守护进程检测与可选控制；控制默认关闭，需 ALLOW_DAEMON_CONTROL=1。 */
app.use('/api/daemon/control', (request, response) => {
  void handleDaemonControlRequest(request, response);
});
app.use('/api/daemon', (request, response) => {
  void handleDaemonRequest(request, response);
});

/**
 * Minimal streaming reverse proxy for Ollama.
 * The frontend always calls relative `/ollama/*`, so the same code works in
 * Vite dev (proxy in vite.config.ts) and in this production server.
 */
app.all('/ollama/*', async (request, response) => {
  const controller = new AbortController();
  const abort = () => controller.abort();
  request.on('aborted', abort);
  response.on('close', () => {
    if (!response.writableEnded) abort();
  });

  try {
    const targetPath = request.originalUrl.replace(/^\/ollama/, '');
    const targetUrl = `${ollamaHost}${targetPath}`;
    const headers = new Headers();

    for (const [key, value] of Object.entries(request.headers)) {
      if (!value || HOP_BY_HOP.has(key.toLowerCase())) continue;
      headers.set(key, Array.isArray(value) ? value.join(', ') : value);
    }

    let body: Buffer | undefined;
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      const chunks: Buffer[] = [];
      for await (const chunk of request) {
        chunks.push(Buffer.from(chunk));
      }
      body = chunks.length > 0 ? Buffer.concat(chunks) : undefined;
    }

    const upstream = await fetch(targetUrl, {
      method: request.method,
      headers,
      body,
      signal: controller.signal
    } as RequestInit & { duplex?: 'half' });

    response.status(upstream.status);
    const contentType = upstream.headers.get('content-type');
    if (contentType) response.setHeader('content-type', contentType);
    response.setHeader('cache-control', 'no-store');
    response.setHeader('x-accel-buffering', 'no');
    response.flushHeaders();

    if (!upstream.body) {
      response.end();
      return;
    }

    const reader = upstream.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) response.write(Buffer.from(value));
    }
    response.end();
  } catch (error) {
    if (controller.signal.aborted) {
      response.end();
      return;
    }

    const message = error instanceof Error ? error.message : String(error);
    if (response.headersSent) {
      response.end();
      return;
    }
    response.status(502).json({
      error: `无法连接 Ollama（${ollamaHost}）：${message}`
    });
  }
});

app.use(express.static(distDir));

// SPA fallback for the single-page app. Express 4 path syntax.
app.get('*', (_request, response) => {
  response.sendFile(path.join(distDir, 'index.html'));
});

const server = app.listen(port, host, () => {
  console.log(`Ollama Studio server: http://${host}:${port}`);
  console.log(`Ollama upstream: ${ollamaHost}`);
  console.log(`Proxy auth: ${proxyToken ? 'enabled (PROXY_TOKEN)' : 'disabled'}`);
  if (!isLoopback && !proxyToken) {
    console.warn(
      '[security] HOST is not loopback and PROXY_TOKEN is unset. ' +
        'Anyone who can reach this port can call /ollama/* and /api/import.'
    );
  }
});

const shutdown = () => {
  server.close(() => process.exit(0));
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
