import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import type { Middleware } from './security';

/**
 * 可选会话鉴权。
 *
 * PROXY_TOKEN 只用于登录时换取 HttpOnly 会话 Cookie，不再编译进前端 bundle。
 * 会话保存在内存中，进程重启后需重新登录；同时保留 Bearer / X-Proxy-Token，
 * 供 curl 等非浏览器客户端使用。
 */
const SESSION_COOKIE = 'ollama_studio_session';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 10;
const MAX_LOGIN_BODY = 8 * 1024;

const STATIC_EXTENSIONS = new Set([
  '.js',
  '.mjs',
  '.css',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.svg',
  '.ico',
  '.woff',
  '.woff2',
  '.ttf',
  '.map',
  '.json',
  '.txt',
  '.webmanifest'
]);

export interface AuthOptions {
  token: string;
  secureCookies?: boolean;
}

export interface Auth {
  enabled: boolean;
  /** 处理 /login、/api/auth/login、/api/auth/logout、/api/auth/status。 */
  handleRoutes: Middleware;
  /** 保护 /api 与 /ollama：未认证返回 401 JSON。 */
  requireSession: Middleware;
  /** 未认证的浏览器导航重定向到登录页；静态资源不受影响。 */
  guardNavigation: Middleware;
}

interface Session {
  expiresAt: number;
}

interface LoginAttempt {
  failures: number;
  resetAt: number;
}

function readHeader(request: IncomingMessage, name: string): string | undefined {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function requestPathname(request: IncomingMessage): string {
  // Express 在 `app.use('/api', ...)` 中会剥离前缀，originalUrl 才是完整路径。
  const raw =
    (request as IncomingMessage & { originalUrl?: string }).originalUrl ?? request.url ?? '/';
  try {
    return new URL(raw, 'http://localhost').pathname;
  } catch {
    return '/';
  }
}

function sendJson(response: ServerResponse, status: number, payload: unknown): void {
  response.statusCode = status;
  response.setHeader('content-type', 'application/json');
  response.setHeader('cache-control', 'no-store');
  response.end(JSON.stringify(payload));
}

function sendHtml(response: ServerResponse, status: number, html: string): void {
  response.statusCode = status;
  response.setHeader('content-type', 'text/html; charset=utf-8');
  response.setHeader('cache-control', 'no-store');
  response.setHeader('x-frame-options', 'DENY');
  response.setHeader(
    'content-security-policy',
    "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'"
  );
  response.end(html);
}

function redirect(response: ServerResponse, location: string): void {
  response.statusCode = 302;
  response.setHeader('location', location);
  response.setHeader('cache-control', 'no-store');
  response.end();
}

function parseCookies(header: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!header) return result;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index <= 0) continue;
    const name = part.slice(0, index).trim();
    const raw = part.slice(index + 1).trim();
    if (!name) continue;
    try {
      result[name] = decodeURIComponent(raw);
    } catch {
      result[name] = raw;
    }
  }
  return result;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 只允许站内绝对路径，避免登录后的开放重定向。 */
function safeNext(value: string | null | undefined): string {
  if (!value) return '/';
  if (!value.startsWith('/') || value.startsWith('//')) return '/';
  return value;
}

function isNavigationRequest(request: IncomingMessage, pathname: string): boolean {
  const method = (request.method ?? 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') return false;
  const accept = (readHeader(request, 'accept') ?? '').toLowerCase();
  if (!accept.includes('text/html')) return false;
  const extension = path.extname(pathname).toLowerCase();
  return !STATIC_EXTENSIONS.has(extension);
}

function isProtectedApi(pathname: string): boolean {
  return pathname === '/ollama' || pathname.startsWith('/ollama/') || pathname.startsWith('/api/');
}

function isPublicPath(pathname: string): boolean {
  return (
    pathname === '/healthz' ||
    pathname === '/login' ||
    pathname === '/api/auth/login' ||
    pathname === '/api/auth/logout' ||
    pathname === '/api/auth/status'
  );
}

async function readLoginBody(request: IncomingMessage): Promise<{ token: string; next: string }> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_LOGIN_BODY) throw new Error('登录请求体过大。');
    chunks.push(buffer);
  }

  const raw = Buffer.concat(chunks).toString('utf8');
  const contentType = (readHeader(request, 'content-type') ?? '').toLowerCase();
  if (contentType.includes('application/json')) {
    let parsed: unknown;
    try {
      parsed = raw.trim() ? JSON.parse(raw) : {};
    } catch {
      throw new Error('登录请求不是合法 JSON。');
    }
    const data =
      typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
    return {
      token: typeof data.token === 'string' ? data.token : '',
      next: typeof data.next === 'string' ? data.next : ''
    };
  }

  const params = new URLSearchParams(raw);
  return { token: params.get('token') ?? '', next: params.get('next') ?? '' };
}

function loginPage(options: { tokenRequired: boolean; next: string; error?: string }): string {
  const next = escapeHtml(safeNext(options.next));
  const error = options.error
    ? `<p class="error" role="alert">${escapeHtml(options.error)}</p>`
    : '';
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Ollama Studio · 登录</title>
  <style>
    :root { color-scheme: light dark; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #f6f4fb; color: #1d1b20; padding: 24px; }
    main { width: min(420px, 100%); background: #fff; border: 1px solid #e3dfea;
      border-radius: 20px; padding: 32px; box-shadow: 0 18px 50px rgba(40, 20, 80, .10); }
    h1 { margin: 0 0 8px; font-size: 22px; }
    p { margin: 0 0 20px; color: #625b71; font-size: 14px; line-height: 1.6; }
    label { display: block; font-size: 13px; font-weight: 600; margin-bottom: 8px; }
    input { width: 100%; padding: 12px 14px; border-radius: 12px; border: 1px solid #cfc8d9;
      font-size: 15px; background: #fbfaff; color: inherit; }
    input:focus { outline: 2px solid #7952ec; outline-offset: 1px; }
    button { width: 100%; margin-top: 16px; padding: 12px 16px; border: 0;
      border-radius: 12px; background: #7952ec; color: #fff; font-size: 15px;
      font-weight: 600; cursor: pointer; }
    button:hover { background: #6845d4; }
    .error { border-radius: 10px; background: #ffdad6; color: #8c1d18;
      padding: 10px 12px; font-size: 13px; }
    .hint { margin-top: 18px; font-size: 12px; color: #7a7483; }
    @media (prefers-color-scheme: dark) {
      body { background: #141218; color: #e6e0e9; }
      main { background: #211f26; border-color: #36343b; }
      p, .hint { color: #cac4d0; }
      input { background: #2b2930; border-color: #49454f; }
    }
  </style>
</head>
<body>
  <main>
    <h1>Ollama Studio</h1>
    <p>此服务器已启用访问令牌。请输入 <code>PROXY_TOKEN</code> 后继续。<br>
      This server requires an access token. Enter <code>PROXY_TOKEN</code> to continue.</p>
    ${error}
    <form method="post" action="/api/auth/login">
      <input type="hidden" name="next" value="${next}">
      <label for="token">访问令牌 / Access token</label>
      <input id="token" name="token" type="password" autocomplete="current-password"
        required autofocus ${options.tokenRequired ? '' : 'disabled'}>
      <button type="submit">登录 / Sign in</button>
    </form>
    <p class="hint">令牌只用于建立 HttpOnly 会话，不会写入前端脚本。会话在服务器重启后失效。<br>
      The token is exchanged for an HttpOnly session cookie and is never embedded in client JavaScript.</p>
  </main>
</body>
</html>`;
}

export function createAuth(options: AuthOptions): Auth {
  const token = options.token.trim();
  const enabled = token.length > 0;
  const expectedHash = createHash('sha256').update(token).digest();
  const sessions = new Map<string, Session>();
  const attempts = new Map<string, LoginAttempt>();

  function tokenMatches(input: string): boolean {
    if (!enabled || !input) return false;
    const actual = createHash('sha256').update(input).digest();
    return timingSafeEqual(actual, expectedHash);
  }

  function cookieHeader(sessionId: string): string {
    const secure = options.secureCookies ? '; Secure' : '';
    return `${SESSION_COOKIE}=${sessionId}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.floor(
      SESSION_TTL_MS / 1000
    )}${secure}`;
  }

  function clearCookieHeader(): string {
    return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;
  }

  function validSession(request: IncomingMessage): boolean {
    const sessionId = parseCookies(readHeader(request, 'cookie'))[SESSION_COOKIE];
    if (!sessionId) return false;
    const session = sessions.get(sessionId);
    if (!session) return false;
    if (session.expiresAt <= Date.now()) {
      sessions.delete(sessionId);
      return false;
    }
    // 滑动续期：活跃会话不会在使用中突然过期。
    session.expiresAt = Date.now() + SESSION_TTL_MS;
    return true;
  }

  function hasCredentials(request: IncomingMessage): boolean {
    if (validSession(request)) return true;
    const authorization = readHeader(request, 'authorization');
    if (authorization?.startsWith('Bearer ') && tokenMatches(authorization.slice(7).trim())) {
      return true;
    }
    const header = readHeader(request, 'x-proxy-token');
    return Boolean(header && tokenMatches(header.trim()));
  }

  function clientKey(request: IncomingMessage): string {
    return request.socket.remoteAddress ?? 'unknown';
  }

  function rateLimited(key: string): boolean {
    const attempt = attempts.get(key);
    if (!attempt) return false;
    if (attempt.resetAt <= Date.now()) {
      attempts.delete(key);
      return false;
    }
    return attempt.failures >= LOGIN_MAX_FAILURES;
  }

  function recordFailure(key: string): void {
    const now = Date.now();
    const attempt = attempts.get(key);
    if (!attempt || attempt.resetAt <= now) {
      attempts.set(key, { failures: 1, resetAt: now + LOGIN_WINDOW_MS });
      return;
    }
    attempt.failures += 1;
  }

  function wantsJson(request: IncomingMessage): boolean {
    const contentType = (readHeader(request, 'content-type') ?? '').toLowerCase();
    if (contentType.includes('application/json')) return true;
    const accept = (readHeader(request, 'accept') ?? '').toLowerCase();
    return accept.includes('application/json') && !accept.includes('text/html');
  }

  const handleRoutes: Middleware = (request, response, next) => {
    const pathname = requestPathname(request);
    const method = (request.method ?? 'GET').toUpperCase();

    if (method === 'GET' && pathname === '/login') {
      if (!enabled || validSession(request)) {
        redirect(response, '/');
        return;
      }
      const nextValue = safeNext(
        new URL(request.url ?? '/', 'http://localhost').searchParams.get('next')
      );
      sendHtml(response, 200, loginPage({ tokenRequired: enabled, next: nextValue }));
      return;
    }

    if (method === 'GET' && pathname === '/api/auth/status') {
      sendJson(response, 200, {
        required: enabled,
        authenticated: !enabled || hasCredentials(request)
      });
      return;
    }

    if (method === 'POST' && pathname === '/api/auth/logout') {
      const sessionId = parseCookies(readHeader(request, 'cookie'))[SESSION_COOKIE];
      if (sessionId) sessions.delete(sessionId);
      response.setHeader('set-cookie', clearCookieHeader());
      if (wantsJson(request)) {
        sendJson(response, 200, { ok: true });
      } else {
        redirect(response, '/login');
      }
      return;
    }

    if (method === 'POST' && pathname === '/api/auth/login') {
      void (async () => {
        if (!enabled) {
          if (wantsJson(request)) {
            sendJson(response, 200, { ok: true });
          } else {
            redirect(response, '/');
          }
          return;
        }

        const key = clientKey(request);
        if (rateLimited(key)) {
          response.setHeader('retry-after', String(Math.ceil(LOGIN_WINDOW_MS / 1000)));
          if (wantsJson(request)) {
            sendJson(response, 429, { error: '登录尝试过多，请稍后再试。' });
          } else {
            sendHtml(
              response,
              429,
              loginPage({ tokenRequired: true, next: '/', error: '登录尝试过多，请稍后再试。' })
            );
          }
          return;
        }

        let body: { token: string; next: string };
        try {
          body = await readLoginBody(request);
        } catch (error) {
          const message = error instanceof Error ? error.message : '无法读取登录请求。';
          if (wantsJson(request)) {
            sendJson(response, 400, { error: message });
          } else {
            sendHtml(response, 400, loginPage({ tokenRequired: true, next: '/', error: message }));
          }
          return;
        }

        if (!tokenMatches(body.token)) {
          recordFailure(key);
          if (wantsJson(request)) {
            sendJson(response, 401, { error: '访问令牌不正确。' });
          } else {
            sendHtml(
              response,
              401,
              loginPage({ tokenRequired: true, next: body.next, error: '访问令牌不正确。' })
            );
          }
          return;
        }

        attempts.delete(key);
        const sessionId = randomBytes(32).toString('hex');
        sessions.set(sessionId, { expiresAt: Date.now() + SESSION_TTL_MS });
        response.setHeader('set-cookie', cookieHeader(sessionId));
        if (wantsJson(request)) {
          sendJson(response, 200, { ok: true });
        } else {
          redirect(response, safeNext(body.next));
        }
      })().catch((error: unknown) => {
        if (response.writableEnded) return;
        const message = error instanceof Error ? error.message : String(error);
        sendJson(response, 500, { error: message });
      });
      return;
    }

    next();
  };

  const requireSession: Middleware = (request, response, next) => {
    if (!enabled) {
      next();
      return;
    }

    const pathname = requestPathname(request);
    if (isPublicPath(pathname) || hasCredentials(request) || !isProtectedApi(pathname)) {
      next();
      return;
    }

    sendJson(response, 401, { error: '未授权：请先登录。' });
  };

  const guardNavigation: Middleware = (request, response, next) => {
    if (!enabled) {
      next();
      return;
    }

    const pathname = requestPathname(request);
    if (isPublicPath(pathname) || hasCredentials(request)) {
      next();
      return;
    }

    // API 路径交给 requireSession 返回 401 JSON，不做 HTML 重定向。
    if (isProtectedApi(pathname)) {
      next();
      return;
    }

    if (!isNavigationRequest(request, pathname)) {
      next();
      return;
    }

    const raw = (request as IncomingMessage & { originalUrl?: string }).originalUrl ?? request.url;
    const search = new URL(raw ?? '/', 'http://localhost').search;
    redirect(response, `/login?next=${encodeURIComponent(safeNext(`${pathname}${search}`))}`);
  };

  return { enabled, handleRoutes, requireSession, guardNavigation };
}
