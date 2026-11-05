import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { describe, expect, it, vi } from 'vitest';
import { createAuth } from './auth';

const TOKEN = 'test-token-0123456789abcdef0123456789abcdef';

interface MockResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  writableEnded: boolean;
  setHeader(name: string, value: string): void;
  end(chunk?: string): void;
}

function createResponse(): MockResponse {
  return {
    statusCode: 200,
    headers: {},
    body: '',
    writableEnded: false,
    setHeader(name: string, value: string) {
      this.headers[name.toLowerCase()] = value;
    },
    end(chunk?: string) {
      if (chunk) this.body += chunk;
      this.writableEnded = true;
    }
  };
}

function createRequest(options: {
  method?: string;
  url?: string;
  headers?: Record<string, string>;
  body?: string;
}): IncomingMessage {
  const request = Readable.from(options.body ? [Buffer.from(options.body)] : []);
  Object.assign(request, {
    method: options.method ?? 'GET',
    url: options.url ?? '/',
    headers: options.headers ?? {},
    socket: { remoteAddress: '127.0.0.1' }
  });
  return request as unknown as IncomingMessage;
}

type Middleware = (request: IncomingMessage, response: ServerResponse, next: () => void) => void;

function run(
  middleware: Middleware,
  options: { method?: string; url?: string; headers?: Record<string, string> }
): { response: MockResponse; nextCalled: boolean } {
  const response = createResponse();
  let nextCalled = false;
  middleware(createRequest(options), response as unknown as ServerResponse, () => {
    nextCalled = true;
  });
  return { response, nextCalled };
}

async function dispatch(
  controller: ReturnType<typeof createAuth>,
  options: { method?: string; url?: string; headers?: Record<string, string>; body?: string }
): Promise<{ response: MockResponse; nextCalled: boolean }> {
  const response = createResponse();
  let nextCalled = false;
  controller.handleRoutes(createRequest(options), response as unknown as ServerResponse, () => {
    nextCalled = true;
  });
  await vi.waitFor(() => {
    if (!response.writableEnded && !nextCalled) throw new Error('pending');
  });
  return { response, nextCalled };
}

describe('createAuth', () => {
  it('is disabled when no token is configured', () => {
    const auth = createAuth({ token: '' });
    expect(auth.enabled).toBe(false);
    const result = run(auth.requireSession, { headers: {} });
    expect(result.nextCalled).toBe(true);
  });

  it('reports status and exchanges the token for an HttpOnly session cookie', async () => {
    const auth = createAuth({ token: TOKEN });

    const status = await dispatch(auth, {
      method: 'GET',
      url: '/api/auth/status',
      headers: { host: '127.0.0.1:3000' }
    });
    expect(status.response.statusCode).toBe(200);
    expect(JSON.parse(status.response.body)).toEqual({ required: true, authenticated: false });

    const login = await dispatch(auth, {
      method: 'POST',
      url: '/api/auth/login',
      headers: {
        host: '127.0.0.1:3000',
        'content-type': 'application/json'
      },
      body: JSON.stringify({ token: TOKEN })
    });
    expect(login.response.statusCode).toBe(200);

    const cookie = login.response.headers['set-cookie'];
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).not.toContain('Secure');

    const session = cookie.split(';')[0];
    expect(run(auth.requireSession, { headers: { cookie: session } }).nextCalled).toBe(true);
  });

  it('marks cookies Secure when configured', async () => {
    const auth = createAuth({ token: TOKEN, secureCookies: true });
    const login = await dispatch(auth, {
      method: 'POST',
      url: '/api/auth/login',
      headers: { host: '127.0.0.1:3000', 'content-type': 'application/json' },
      body: JSON.stringify({ token: TOKEN })
    });
    expect(login.response.headers['set-cookie']).toContain('Secure');
  });

  it('rejects wrong tokens and accepts Bearer tokens for scripts', async () => {
    const auth = createAuth({ token: TOKEN });

    const wrong = await dispatch(auth, {
      method: 'POST',
      url: '/api/auth/login',
      headers: { host: '127.0.0.1:3000', 'content-type': 'application/json' },
      body: JSON.stringify({ token: 'wrong' })
    });
    expect(wrong.response.statusCode).toBe(401);

    expect(
      run(auth.requireSession, {
        headers: { authorization: `Bearer ${TOKEN}` }
      }).nextCalled
    ).toBe(true);

    const unauthorized = run(auth.requireSession, {
      headers: {},
      url: '/api/cache'
    });
    expect(unauthorized.nextCalled).toBe(false);
    expect(unauthorized.response.statusCode).toBe(401);
  });

  it('redirects unauthenticated browser navigation to the login page', () => {
    const auth = createAuth({ token: TOKEN });

    const navigation = run(auth.guardNavigation, {
      headers: { accept: 'text/html', host: '127.0.0.1:3000' }
    });
    expect(navigation.nextCalled).toBe(false);
    expect(navigation.response.statusCode).toBe(302);
    expect(navigation.response.headers.location).toBe('/login?next=%2F');

    const authenticated = run(auth.guardNavigation, {
      headers: { accept: 'text/html', authorization: `Bearer ${TOKEN}` }
    });
    expect(authenticated.nextCalled).toBe(true);
  });

  it('does not intercept assets, API calls, or non-HTML requests', () => {
    const auth = createAuth({ token: TOKEN });

    const asset = run(auth.guardNavigation, {
      headers: { accept: 'text/html', host: '127.0.0.1:3000' },
      url: '/assets/index.js'
    });
    expect(asset.nextCalled).toBe(true);

    const api = run(auth.guardNavigation, {
      headers: { accept: 'text/html', host: '127.0.0.1:3000' },
      url: '/api/version'
    });
    expect(api.nextCalled).toBe(true);

    const fetch = run(auth.guardNavigation, {
      headers: { accept: '*/*', host: '127.0.0.1:3000' }
    });
    expect(fetch.nextCalled).toBe(true);
  });

  it('renders the login page and only redirects to local paths', async () => {
    const auth = createAuth({ token: TOKEN });

    const page = await dispatch(auth, {
      method: 'GET',
      url: '/login',
      headers: { accept: 'text/html', host: '127.0.0.1:3000' }
    });
    expect(page.response.statusCode).toBe(200);
    expect(page.response.body).toContain('<form method="post" action="/api/auth/login">');

    const login = await dispatch(auth, {
      method: 'POST',
      url: '/api/auth/login',
      headers: {
        host: '127.0.0.1:3000',
        'content-type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({ token: TOKEN, next: 'https://evil.example' }).toString()
    });
    expect(login.response.statusCode).toBe(302);
    expect(login.response.headers.location).toBe('/');
  });

  it('rate limits repeated failures', async () => {
    const auth = createAuth({ token: TOKEN });
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const failed = await dispatch(auth, {
        method: 'POST',
        url: '/api/auth/login',
        headers: { host: '127.0.0.1:3000', 'content-type': 'application/json' },
        body: JSON.stringify({ token: 'wrong' })
      });
      expect(failed.response.statusCode).toBe(401);
    }

    const blocked = await dispatch(auth, {
      method: 'POST',
      url: '/api/auth/login',
      headers: { host: '127.0.0.1:3000', 'content-type': 'application/json' },
      body: JSON.stringify({ token: TOKEN })
    });
    expect(blocked.response.statusCode).toBe(429);
  });

  it('clears the session cookie on logout', async () => {
    const auth = createAuth({ token: TOKEN });
    const logout = await dispatch(auth, {
      method: 'POST',
      url: '/api/auth/logout',
      headers: { host: '127.0.0.1:3000', accept: 'application/json' }
    });
    expect(logout.response.statusCode).toBe(200);
    expect(logout.response.headers['set-cookie']).toContain('Max-Age=0');
  });
});
