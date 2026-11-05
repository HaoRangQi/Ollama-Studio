import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  OllamaError,
  loadModel,
  pullModel,
  streamChat,
  unloadModel,
  type OllamaChatChunk
} from './ollama';

function ndjsonResponse(lines: unknown[], chunkSize = 7): Response {
  const payload = `${lines.map((line) => JSON.stringify(line)).join('\n')}\n`;
  const bytes = new TextEncoder().encode(payload);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        controller.enqueue(bytes.slice(offset, offset + chunkSize));
      }
      controller.close();
    }
  });
  return new Response(stream, {
    status: 200,
    headers: { 'content-type': 'application/x-ndjson' }
  });
}

function mockFetch(response: Response | (() => Promise<Response>)) {
  const fetchMock = vi.fn(
    async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> =>
      response instanceof Response ? response : response()
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const doneChunk: OllamaChatChunk = {
  model: 'm',
  created_at: '2026-10-28T00:00:00Z',
  message: { role: 'assistant', content: '' },
  done: true,
  eval_count: 10,
  eval_duration: 1_000_000_000
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('streamChat', () => {
  it('parses NDJSON split across arbitrary chunk boundaries', async () => {
    const fetchMock = mockFetch(
      ndjsonResponse([
        { message: { role: 'assistant', content: 'he' }, done: false },
        { message: { role: 'assistant', content: 'llo' }, done: false },
        doneChunk
      ])
    );

    const chunks: OllamaChatChunk[] = [];
    const onDone = vi.fn();
    await streamChat(
      { model: 'm', messages: [{ role: 'user', content: 'hi' }], keep_alive: '5m' },
      { onChunk: (chunk) => chunks.push(chunk), onDone }
    );

    expect(chunks).toHaveLength(3);
    expect(chunks.map((chunk) => chunk.message.content).join('')).toBe('hello');
    expect(onDone).toHaveBeenCalledTimes(1);

    const [, init] = fetchMock.mock.calls[0] ?? [];
    const body = JSON.parse(String(init?.body));
    expect(body.stream).toBe(true);
    expect(body.keep_alive).toBe('5m');
  });

  it('throws OllamaError for an error object in the stream', async () => {
    mockFetch(ndjsonResponse([{ error: 'model not found' }]));
    await expect(
      streamChat({ model: 'missing', messages: [] }, { onChunk: () => undefined })
    ).rejects.toThrow(new OllamaError('model not found'));
  });

  it('throws OllamaError for malformed JSON lines', async () => {
    const response = new Response('not-json\n', { status: 200 });
    mockFetch(response);
    await expect(
      streamChat({ model: 'm', messages: [] }, { onChunk: () => undefined })
    ).rejects.toThrow(/无法解析 Ollama 流式响应/);
  });

  it('surfaces HTTP errors with the server message', async () => {
    mockFetch(
      new Response(JSON.stringify({ error: 'boom' }), {
        status: 500,
        headers: { 'content-type': 'application/json' }
      })
    );
    await expect(
      streamChat({ model: 'm', messages: [] }, { onChunk: () => undefined })
    ).rejects.toMatchObject({ message: 'boom', status: 500 });
  });

  it('rethrows AbortError without wrapping it', async () => {
    mockFetch(async () => {
      throw new DOMException('aborted', 'AbortError');
    });
    await expect(
      streamChat(
        { model: 'm', messages: [] },
        { onChunk: () => undefined },
        new AbortController().signal
      )
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('pullModel', () => {
  it('reports progress and calls onDone once on success', async () => {
    mockFetch(
      ndjsonResponse([
        { status: 'pulling manifest' },
        { status: 'downloading', digest: 'sha1', total: 100, completed: 50 },
        { status: 'success' }
      ])
    );

    const statuses: string[] = [];
    const onDone = vi.fn();
    await pullModel('m', {
      onProgress: (progress) => statuses.push(progress.status),
      onDone
    });

    expect(statuses).toEqual(['pulling manifest', 'downloading', 'success']);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('calls onDone after the stream ends without a success marker', async () => {
    mockFetch(ndjsonResponse([{ status: 'pulling manifest' }]));
    const onDone = vi.fn();
    await pullModel('m', { onProgress: () => undefined, onDone });
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});

describe('loadModel / unloadModel', () => {
  it('loads through /api/generate with keep_alive', async () => {
    const fetchMock = mockFetch(new Response(JSON.stringify({ done: true }), { status: 200 }));
    await loadModel('m:latest', -1);

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe('/ollama/api/generate');
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({
      model: 'm:latest',
      prompt: '',
      stream: false,
      keep_alive: -1
    });
  });

  it('uses /api/embed for embedding models', async () => {
    const fetchMock = mockFetch(new Response(JSON.stringify({ embeddings: [] }), { status: 200 }));
    await loadModel('embed:latest', '1h', { kind: 'embed' });

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe('/ollama/api/embed');
    expect(JSON.parse(String(init?.body))).toMatchObject({
      model: 'embed:latest',
      keep_alive: '1h'
    });
  });

  it('unloads by setting keep_alive to 0', async () => {
    const fetchMock = mockFetch(new Response(JSON.stringify({ done: true }), { status: 200 }));
    await unloadModel('m:latest');

    const [, init] = fetchMock.mock.calls[0] ?? [];
    expect(JSON.parse(String(init?.body)).keep_alive).toBe(0);
  });

  it('surfaces HTTP errors', async () => {
    mockFetch(new Response(JSON.stringify({ error: 'not found' }), { status: 404 }));
    await expect(loadModel('missing:latest')).rejects.toMatchObject({
      message: 'not found',
      status: 404
    });
  });
});
