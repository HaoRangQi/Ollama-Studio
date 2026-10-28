const RAW_BASE = (import.meta.env as Record<string, string | undefined> | undefined)
  ?.VITE_OLLAMA_BASE_URL;
const RAW_PROXY_TOKEN = (import.meta.env as Record<string, string | undefined> | undefined)
  ?.VITE_PROXY_TOKEN;

/**
 * All requests go through the local proxy by default (`/ollama`).
 * Set VITE_OLLAMA_BASE_URL only when the browser can reach Ollama directly.
 */
export const OLLAMA_BASE = (RAW_BASE && RAW_BASE.trim()) || '/ollama';

/**
 * Optional shared secret for the proxy. When PROXY_TOKEN is configured on the
 * server, the same value must be provided as VITE_PROXY_TOKEN at build time.
 */
export function proxyAuthHeaders(): Record<string, string> {
  const token = RAW_PROXY_TOKEN?.trim();
  return token ? { authorization: `Bearer ${token}` } : {};
}

export interface OllamaTagDetails {
  parent_model?: string;
  format?: string;
  family?: string;
  families?: string[] | null;
  parameter_size?: string;
  quantization_level?: string;
  context_length?: number;
  embedding_length?: number;
  runner?: string;
}

export interface OllamaTag {
  name: string;
  model: string;
  modified_at: string;
  size: number;
  digest: string;
  details?: OllamaTagDetails;
  capabilities?: string[];
}

export interface OllamaRunning {
  name: string;
  model: string;
  size: number;
  digest: string;
  details?: OllamaTagDetails;
  expires_at: string;
  size_vram: number;
}

export interface OllamaTagsResponse {
  models: OllamaTag[];
}

export interface OllamaPsResponse {
  models: OllamaRunning[];
}

export interface OllamaVersionResponse {
  version: string;
}

export interface OllamaConnection {
  version: string;
  tags: OllamaTag[];
  running: OllamaRunning[];
}

export type OllamaRole = 'system' | 'user' | 'assistant';

export interface OllamaChatMessage {
  role: OllamaRole;
  content: string;
  images?: string[];
  thinking?: string;
}

export interface OllamaChatRequest {
  model: string;
  messages: OllamaChatMessage[];
  stream?: boolean;
  think?: boolean | 'low' | 'medium' | 'high';
  format?: 'json' | Record<string, unknown>;
  keep_alive?: string | number;
  options?: Record<string, number | string | boolean>;
}

export interface OllamaChatChunk {
  model: string;
  created_at: string;
  message: {
    role: 'assistant';
    content: string;
    thinking?: string;
  };
  done: boolean;
  done_reason?: string;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
  error?: string;
}

export interface OllamaPullProgress {
  status: string;
  digest?: string;
  total?: number;
  completed?: number;
  error?: string;
}

export interface PullStreamHandlers {
  onProgress: (progress: OllamaPullProgress) => void;
  onDone?: () => void;
}

export class OllamaError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'OllamaError';
    this.status = status;
  }
}

async function readErrorMessage(response: Response): Promise<string> {
  const text = await response.text().catch(() => '');
  if (!text) return `Ollama 请求失败（HTTP ${response.status}）`;
  try {
    const data = JSON.parse(text) as { error?: string; message?: string };
    return data.error || data.message || text;
  } catch {
    return text;
  }
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${OLLAMA_BASE}${path}`, {
      ...init,
      headers: {
        accept: 'application/json',
        ...proxyAuthHeaders(),
        ...(init?.headers ?? {})
      }
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new OllamaError('无法连接 Ollama。请确认 Ollama 已启动，且代理地址正确。');
  }

  if (!response.ok) {
    throw new OllamaError(await readErrorMessage(response), response.status);
  }

  const body = await response.text();
  if (!body.trim()) return undefined as T;
  try {
    return JSON.parse(body) as T;
  } catch {
    throw new OllamaError(`无法解析 Ollama 响应：${body.slice(0, 200)}`);
  }
}

export async function getVersion(): Promise<string> {
  const data = await requestJson<OllamaVersionResponse>('/api/version');
  return data.version;
}

export async function getTags(): Promise<OllamaTag[]> {
  const data = await requestJson<OllamaTagsResponse>('/api/tags');
  return data.models ?? [];
}

export async function getRunning(): Promise<OllamaRunning[]> {
  const data = await requestJson<OllamaPsResponse>('/api/ps');
  return data.models ?? [];
}

export async function getConnection(): Promise<OllamaConnection> {
  const [version, tags, running] = await Promise.all([getVersion(), getTags(), getRunning()]);
  return { version, tags, running };
}

async function readNdjson<T extends { error?: string }>(
  response: Response,
  onChunk: (chunk: T) => void
): Promise<void> {
  if (!response.body) {
    throw new OllamaError('Ollama 返回了空响应体。');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const consumeLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    let chunk: T;
    try {
      chunk = JSON.parse(trimmed) as T;
    } catch {
      throw new OllamaError(`无法解析 Ollama 流式响应：${trimmed.slice(0, 200)}`);
    }

    if (chunk.error) throw new OllamaError(chunk.error);
    onChunk(chunk);
  };

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) consumeLine(line);
    }

    buffer += decoder.decode();
    if (buffer.trim()) consumeLine(buffer);
  } finally {
    reader.releaseLock();
  }
}

export async function deleteModel(name: string): Promise<void> {
  await requestJson<{ status?: string }>('/api/delete', {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name })
  });
}

export async function copyModel(source: string, destination: string): Promise<void> {
  await requestJson<{ status?: string }>('/api/copy', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ source, destination })
  });
}

export interface CreateModelRequest {
  model: string;
  from: string;
  system?: string;
  parameters?: Record<string, number | string | boolean | string[]>;
}

export async function createModel(request: CreateModelRequest): Promise<void> {
  await requestJson<{ status?: string }>('/api/create', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...request, stream: false })
  });
}

export interface KeepAliveOptions {
  /** Embedding models do not implement /api/generate. */
  kind?: 'generate' | 'embed';
}

/**
 * Loads a model into memory (or refreshes its keep_alive timer).
 * `keepAlive: -1` keeps it resident until explicitly unloaded.
 */
export async function loadModel(
  name: string,
  keepAlive: string | number = -1,
  options: KeepAliveOptions = {}
): Promise<void> {
  if (options.kind === 'embed') {
    await requestJson<{ embeddings?: number[][] }>('/api/embed', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: name,
        input: 'warmup',
        keep_alive: keepAlive
      })
    });
    return;
  }

  await requestJson<{ done?: boolean }>('/api/generate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: name,
      prompt: '',
      stream: false,
      keep_alive: keepAlive
    })
  });
}

/** Unloads a model immediately by setting keep_alive to 0. */
export async function unloadModel(name: string, options: KeepAliveOptions = {}): Promise<void> {
  await loadModel(name, 0, options);
}

export interface ImportGgufResult {
  model: string;
}

/**
 * Uploads a local GGUF file to the same-origin import endpoint, which streams
 * it to a temp file and registers it with Ollama via /api/create.
 */
export async function importGguf(file: File, modelName?: string): Promise<ImportGgufResult> {
  const params = new URLSearchParams({ filename: file.name });
  if (modelName?.trim()) params.set('name', modelName.trim());

  let response: Response;
  try {
    response = await fetch(`/api/import?${params.toString()}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/octet-stream',
        ...proxyAuthHeaders()
      },
      body: file
    });
  } catch {
    throw new OllamaError('无法连接 GGUF 导入服务。请确认开发/生产服务器正在运行。');
  }

  if (!response.ok) {
    throw new OllamaError(await readErrorMessage(response), response.status);
  }

  const body = await response.text();
  if (!body.trim()) {
    throw new OllamaError('GGUF 导入服务返回空响应。');
  }

  try {
    const result = JSON.parse(body) as ImportGgufResult;
    if (!result.model) throw new Error('missing model');
    return result;
  } catch {
    throw new OllamaError(`无法解析 GGUF 导入响应：${body.slice(0, 200)}`);
  }
}

export interface ChatStreamHandlers {
  onChunk: (chunk: OllamaChatChunk) => void;
  onDone?: (chunk: OllamaChatChunk) => void;
}

/**
 * Calls POST /api/chat with stream=true and parses Ollama's NDJSON response.
 * The caller owns the AbortController and should pass its signal for cancellation.
 */
export async function streamChat(
  request: OllamaChatRequest,
  handlers: ChatStreamHandlers,
  signal?: AbortSignal
): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${OLLAMA_BASE}/api/chat`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/x-ndjson',
        ...proxyAuthHeaders()
      },
      body: JSON.stringify({ ...request, stream: true }),
      signal
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new OllamaError('无法连接 Ollama。请确认 Ollama 已启动，且代理地址正确。');
  }

  if (!response.ok) {
    throw new OllamaError(await readErrorMessage(response), response.status);
  }
  await readNdjson<OllamaChatChunk>(response, (chunk) => {
    handlers.onChunk(chunk);
    if (chunk.done) handlers.onDone?.(chunk);
  });
}

/**
 * Calls POST /api/pull with stream=true and reports per-layer progress.
 * The caller owns the AbortController; aborting cancels the HTTP request.
 */
export async function pullModel(
  name: string,
  handlers: PullStreamHandlers,
  signal?: AbortSignal
): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${OLLAMA_BASE}/api/pull`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/x-ndjson',
        ...proxyAuthHeaders()
      },
      body: JSON.stringify({ name, stream: true }),
      signal
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new OllamaError('无法连接 Ollama。请确认 Ollama 已启动，且代理地址正确。');
  }

  if (!response.ok) {
    throw new OllamaError(await readErrorMessage(response), response.status);
  }

  let completed = false;
  await readNdjson<OllamaPullProgress>(response, (progress) => {
    handlers.onProgress(progress);
    if (progress.status === 'success') {
      completed = true;
      handlers.onDone?.();
    }
  });

  if (!completed) handlers.onDone?.();
}
