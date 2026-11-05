import type { IncomingMessage, ServerResponse } from 'node:http';
import { isIP } from 'node:net';
import os from 'node:os';

/**
 * 与运行时无关的 HTTP 安全中间件，生产服务器和 Vite 开发服务器共用。
 *
 * - Host 校验：阻止 DNS rebinding 让恶意域名变成同源。
 * - CSRF 校验：拒绝跨站写请求，并要求 JSON 端点使用 application/json。
 *
 * 两者都只依赖 Node 的 IncomingMessage/ServerResponse，因此既能挂到
 * Express，也能挂到 Vite 的 connect 中间件链。
 */
export type NextFunction = (error?: unknown) => void;
export type Middleware = (
  request: IncomingMessage,
  response: ServerResponse,
  next: NextFunction
) => void;

export interface SecurityOptions {
  /** 额外允许访问的主机名；支持精确匹配和 `.example.com` 后缀匹配。 */
  allowedHosts?: string[];
}

/** 解析 ALLOWED_HOSTS 环境变量（逗号分隔）。 */
export function parseAllowedHosts(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const LOGIN_PATH = '/api/auth/login';
const LOGOUT_PATH = '/api/auth/logout';

function readHeader(request: IncomingMessage, name: string): string | undefined {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function sendJson(response: ServerResponse, status: number, payload: unknown): void {
  response.statusCode = status;
  response.setHeader('content-type', 'application/json');
  response.setHeader('cache-control', 'no-store');
  response.end(JSON.stringify(payload));
}

/** 解析 Host 头中的主机名（不含端口，IPv6 保留方括号）。 */
export function parseHostHeader(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(`http://${value}`).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function normalizeExtraHost(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return '';
  if (trimmed.startsWith('.')) return trimmed;
  return parseHostHeader(trimmed) ?? trimmed;
}

/**
 * 允许 loopback、任意 IP 字面量、本机主机名，以及显式配置的额外主机。
 * 不允许任意域名，因此 DNS rebinding 的 Host 会被拒绝。
 */
export function isAllowedHostname(hostname: string, extraHosts: string[] = []): boolean {
  const normalized = hostname.toLowerCase();
  if (normalized === 'localhost' || normalized.endsWith('.localhost')) return true;

  const bare = normalized.replace(/^\[|\]$/g, '');
  if (isIP(bare) !== 0) return true;
  if (normalized === os.hostname().toLowerCase()) return true;

  return extraHosts.some((entry) => {
    const allowed = normalizeExtraHost(entry);
    if (!allowed) return false;
    if (allowed.startsWith('.')) return normalized.endsWith(allowed);
    return allowed === normalized;
  });
}

export function createHostGuard(options: SecurityOptions = {}): Middleware {
  const extraHosts = options.allowedHosts ?? [];
  return (request, response, next) => {
    const hostname = parseHostHeader(readHeader(request, 'host'));
    if (!hostname || !isAllowedHostname(hostname, extraHosts)) {
      sendJson(response, 403, { error: '不受信任的 Host。' });
      return;
    }
    next();
  };
}

function requestPathname(request: IncomingMessage): string {
  try {
    return new URL(request.url ?? '/', 'http://localhost').pathname;
  } catch {
    return '/';
  }
}

/**
 * 非安全方法必须来自同源页面：
 * - `Sec-Fetch-Site` 只接受 same-origin / none；
 * - `Origin` 存在时其 host 必须与请求 Host 完全一致；
 * - 除 file 上传外，POST/PUT/PATCH 必须是 application/json。
 *
 * 浏览器无法在跨站简单请求里伪造 application/json，也不能在不触发预检的
 * 情况下自定义 Content-Type，因此这套检查覆盖传统 CSRF。
 */
export function createCsrfGuard(): Middleware {
  return (request, response, next) => {
    const method = (request.method ?? 'GET').toUpperCase();
    if (SAFE_METHODS.has(method)) {
      next();
      return;
    }

    const pathname = requestPathname(request);
    const fetchSite = readHeader(request, 'sec-fetch-site');
    if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') {
      sendJson(response, 403, { error: '跨站请求已拒绝。' });
      return;
    }

    if (!checkOrigin(request, response)) return;

    // 登录/退出表单不使用 JSON，单独豁免 Content-Type 检查。
    if (pathname === LOGIN_PATH || pathname === LOGOUT_PATH) {
      next();
      return;
    }

    if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
      // GGUF 上传是原始文件流，不做 JSON 限制；其余写接口必须声明 JSON。
      const isUpload = pathname === '/api/import';
      const contentType = (readHeader(request, 'content-type') ?? '').toLowerCase();
      if (!isUpload && !contentType.startsWith('application/json')) {
        sendJson(response, 415, { error: '请求必须使用 application/json。' });
        return;
      }
    }

    next();
  };
}

function checkOrigin(request: IncomingMessage, response: ServerResponse): boolean {
  const origin = readHeader(request, 'origin');
  if (!origin) return true;

  let originHost: string;
  try {
    originHost = new URL(origin).host.toLowerCase();
  } catch {
    sendJson(response, 403, { error: '无效的 Origin。' });
    return false;
  }

  const requestHost = readHeader(request, 'host')?.toLowerCase();
  if (!requestHost || originHost !== requestHost) {
    sendJson(response, 403, { error: '跨站请求已拒绝。' });
    return false;
  }
  return true;
}
