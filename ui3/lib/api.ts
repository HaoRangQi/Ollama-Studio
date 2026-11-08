import { OLLAMA_BASE, OllamaError } from './legacy';
import type { OllamaChatChunk, OllamaChatRequest } from './legacy';

async function errorMessage(response: Response): Promise<string> {
  const text = await response.text().catch(() => '');
  if (!text.trim()) return `Ollama 请求失败（HTTP ${response.status}）`;
  try {
    const parsed = JSON.parse(text) as { error?: string; message?: string };
    return parsed.error || parsed.message || text;
  } catch {
    return text;
  }
}

async function postJson<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${OLLAMA_BASE}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json'
      },
      body: JSON.stringify(body),
      signal
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new OllamaError('无法连接 Ollama。请确认守护进程已启动。');
  }
  if (!response.ok) {
    throw new OllamaError(await errorMessage(response), response.status);
  }
  const text = await response.text();
  if (!text.trim()) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new OllamaError(`无法解析 Ollama 响应：${text.slice(0, 200)}`);
  }
}

export interface ShowModelResponse {
  modelfile?: string;
  parameters?: string;
  template?: string;
  capabilities?: string[];
  details?: {
    family?: string;
    parameter_size?: string;
    quantization_level?: string;
    context_length?: number;
  };
  model_info?: Record<string, unknown>;
}

/** 读取 Ollama 中真实的 Modelfile 与模型详情。 */
export async function showModel(name: string, signal?: AbortSignal): Promise<ShowModelResponse> {
  return postJson<ShowModelResponse>('/api/show', { model: name }, signal);
}

/**
 * 用完整 Modelfile 文本创建模型。
 * 现有 `src/api/ollama.createModel` 只支持结构化字段，实验室需要保留
 * SYSTEM/TEMPLATE/ADAPTER 等任意指令，因此直接调用 Ollama 的 create。
 */
export async function createModelFromModelfile(model: string, modelfile: string): Promise<void> {
  await postJson<{ status?: string }>('/api/create', { model, modelfile, stream: false });
}

/** 非流式对话：用于关闭“流式输出”时的单次请求。 */
export async function chatOnce(
  request: OllamaChatRequest,
  signal?: AbortSignal
): Promise<OllamaChatChunk> {
  return postJson<OllamaChatChunk>('/api/chat', { ...request, stream: false }, signal);
}
