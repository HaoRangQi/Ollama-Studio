import type { IncomingMessage, ServerResponse } from 'node:http';
import { describe, expect, it } from 'vitest';
import { createCsrfGuard, createHostGuard, isAllowedHostname, parseAllowedHosts } from './security';

interface MockResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  setHeader(name: string, value: string): void;
  end(chunk?: string): void;
}

function createResponse(): MockResponse {
  return {
    statusCode: 200,
    headers: {},
    body: '',
    setHeader(name: string, value: string) {
      this.headers[name.toLowerCase()] = value;
    },
    end(chunk?: string) {
      if (chunk) this.body += chunk;
    }
  };
}

function run(
  middleware: ReturnType<typeof createHostGuard> | ReturnType<typeof createCsrfGuard>,
  options: { method?: string; url?: string; headers?: Record<string, string> }
): { response: MockResponse; nextCalled: boolean } {
  const response = createResponse();
  let nextCalled = false;
  const request = {
    method: options.method ?? 'GET',
    url: options.url ?? '/',
    headers: options.headers ?? {},
    socket: { remoteAddress: '127.0.0.1' }
  } as unknown as IncomingMessage;

  middleware(request, response as unknown as ServerResponse, () => {
    nextCalled = true;
  });
  return { response, nextCalled };
}

describe('isAllowedHostname', () => {
  it('accepts localhost, IP literals, the machine hostname, and explicit hosts', () => {
    expect(isAllowedHostname('localhost')).toBe(true);
    expect(isAllowedHostname('studio.localhost')).toBe(true);
    expect(isAllowedHostname('127.0.0.1')).toBe(true);
    expect(isAllowedHostname('::1')).toBe(true);
    expect(isAllowedHostname('192.168.1.5')).toBe(true);
    expect(isAllowedHostname('studio.lan', ['studio.lan'])).toBe(true);
  });

  it('rejects arbitrary domains', () => {
    expect(isAllowedHostname('evil.example')).toBe(false);
    expect(isAllowedHostname('evil.example', ['studio.lan'])).toBe(false);
    expect(isAllowedHostname('')).toBe(false);
  });
});

describe('parseAllowedHosts', () => {
  it('splits, trims, lowercases, and drops empty entries', () => {
    expect(parseAllowedHosts(' Studio.LAN , ,other.local ')).toEqual(['studio.lan', 'other.local']);
    expect(parseAllowedHosts(undefined)).toEqual([]);
  });
});

describe('createHostGuard', () => {
  const guard = createHostGuard({ allowedHosts: ['studio.lan'] });

  it('allows loopback and LAN IP hosts', () => {
    expect(run(guard, { headers: { host: '127.0.0.1:3000' } }).nextCalled).toBe(true);
    expect(run(guard, { headers: { host: 'localhost:3000' } }).nextCalled).toBe(true);
    expect(run(guard, { headers: { host: '[::1]:3000' } }).nextCalled).toBe(true);
    expect(run(guard, { headers: { host: '192.168.1.5:3000' } }).nextCalled).toBe(true);
    expect(run(guard, { headers: { host: 'studio.lan:3000' } }).nextCalled).toBe(true);
  });

  it('rejects DNS-rebinding style hosts and missing Host headers', () => {
    const rebinding = run(guard, { headers: { host: 'evil.example' } });
    expect(rebinding.nextCalled).toBe(false);
    expect(rebinding.response.statusCode).toBe(403);

    const missing = run(guard, { headers: {} });
    expect(missing.nextCalled).toBe(false);
    expect(missing.response.statusCode).toBe(403);
  });
});

describe('createCsrfGuard', () => {
  const guard = createCsrfGuard();

  it('allows same-origin JSON writes', () => {
    const result = run(guard, {
      method: 'POST',
      url: '/api/cache/cleanup',
      headers: {
        host: '127.0.0.1:3000',
        origin: 'http://127.0.0.1:3000',
        'sec-fetch-site': 'same-origin',
        'content-type': 'application/json'
      }
    });
    expect(result.nextCalled).toBe(true);
  });

  it('allows non-browser clients without Origin', () => {
    const result = run(guard, {
      method: 'POST',
      url: '/ollama/api/pull',
      headers: {
        host: '127.0.0.1:3000',
        'content-type': 'application/json'
      }
    });
    expect(result.nextCalled).toBe(true);
  });

  it('rejects cross-site origins and Sec-Fetch-Site', () => {
    const crossOrigin = run(guard, {
      method: 'POST',
      url: '/api/cache/cleanup',
      headers: {
        host: '127.0.0.1:3000',
        origin: 'https://evil.example',
        'content-type': 'application/json'
      }
    });
    expect(crossOrigin.nextCalled).toBe(false);
    expect(crossOrigin.response.statusCode).toBe(403);

    const crossFetch = run(guard, {
      method: 'POST',
      url: '/api/cache/cleanup',
      headers: {
        host: '127.0.0.1:3000',
        'sec-fetch-site': 'cross-site',
        'content-type': 'application/json'
      }
    });
    expect(crossFetch.nextCalled).toBe(false);
    expect(crossFetch.response.statusCode).toBe(403);
  });

  it('rejects CORS-simple text/plain writes', () => {
    const result = run(guard, {
      method: 'POST',
      url: '/api/downloads',
      headers: {
        host: '127.0.0.1:3000',
        origin: 'http://127.0.0.1:3000',
        'content-type': 'text/plain'
      }
    });
    expect(result.nextCalled).toBe(false);
    expect(result.response.statusCode).toBe(415);
  });

  it('exempts the GGUF upload stream and the login form', () => {
    const upload = run(guard, {
      method: 'POST',
      url: '/api/import?filename=a.gguf',
      headers: {
        host: '127.0.0.1:3000',
        origin: 'http://127.0.0.1:3000',
        'content-type': 'application/octet-stream'
      }
    });
    expect(upload.nextCalled).toBe(true);

    const login = run(guard, {
      method: 'POST',
      url: '/api/auth/login',
      headers: {
        host: '127.0.0.1:3000',
        origin: 'http://127.0.0.1:3000',
        'content-type': 'application/x-www-form-urlencoded'
      }
    });
    expect(login.nextCalled).toBe(true);
  });

  it('does not block safe methods', () => {
    const result = run(guard, {
      headers: {
        host: '127.0.0.1:3000',
        origin: 'https://evil.example',
        'sec-fetch-site': 'cross-site'
      }
    });
    expect(result.nextCalled).toBe(true);
  });
});
