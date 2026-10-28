import { proxyAuthHeaders } from './ollama';
import type { DownloadKind } from '../types';

export type DownloadJobStatus = 'running' | 'success' | 'error' | 'cancelled';

export interface ModelScopeTarget {
  namespace: string;
  name: string;
  file: string;
  revision?: string;
  model?: string;
}

export interface HuggingFaceTarget {
  repo: string;
  file?: string;
  quant?: string;
  revision?: string;
  model?: string;
}

export interface DownloadJob {
  id: string;
  kind: DownloadKind;
  model: string;
  status: DownloadJobStatus;
  layerStatus: string;
  completed: number;
  total: number;
  error?: string;
  /** 远程 GGUF 任务附带，用于暂停或刷新后重新发起。 */
  target?: ModelScopeTarget | HuggingFaceTarget;
  startedAt: number;
  updatedAt: number;
}

export type DownloadJobInput =
  | { kind: 'pull'; model: string }
  | {
      kind: 'modelscope';
      namespace: string;
      name: string;
      file: string;
      revision?: string;
      model?: string;
    }
  | {
      kind: 'huggingface';
      repo: string;
      file?: string;
      quant?: string;
      revision?: string;
      model?: string;
    };

async function readJobError(response: Response, fallback: string): Promise<string> {
  try {
    const data = (await response.json()) as { error?: string };
    if (data.error) return data.error;
  } catch {
    // Keep the fallback when the server returns non-JSON.
  }
  return fallback;
}

/**
 * 下载任务由服务端持有：请求只负责创建任务，进度通过轮询获取，
 * 因此刷新页面不会中断下载。
 */
export async function startDownloadJob(input: DownloadJobInput): Promise<DownloadJob> {
  let response: Response;
  try {
    response = await fetch('/api/downloads', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        ...proxyAuthHeaders()
      },
      body: JSON.stringify(input)
    });
  } catch (error) {
    throw new Error('无法连接本地服务，无法创建下载任务。', { cause: error });
  }

  if (!response.ok) {
    throw new Error(await readJobError(response, `创建下载任务失败（HTTP ${response.status}）`));
  }
  return (await response.json()) as DownloadJob;
}

export async function listDownloadJobs(): Promise<DownloadJob[]> {
  const response = await fetch('/api/downloads', {
    headers: { accept: 'application/json', ...proxyAuthHeaders() }
  });
  if (!response.ok) return [];
  const payload = (await response.json()) as { jobs?: DownloadJob[] };
  return Array.isArray(payload.jobs) ? payload.jobs : [];
}

/** 任务不存在或已被服务端清理时返回 null，便于调用方降级为“已中断”。 */
export async function getDownloadJob(id: string): Promise<DownloadJob | null> {
  const response = await fetch(`/api/downloads/${encodeURIComponent(id)}`, {
    headers: { accept: 'application/json', ...proxyAuthHeaders() }
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`读取下载进度失败（HTTP ${response.status}）`);
  return (await response.json()) as DownloadJob;
}

export async function cancelDownloadJob(id: string): Promise<void> {
  await fetch(`/api/downloads/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { accept: 'application/json', ...proxyAuthHeaders() }
  }).catch(() => undefined);
}
