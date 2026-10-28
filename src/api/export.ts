import { proxyAuthHeaders } from './ollama';

export interface ExportFile {
  kind: 'model' | 'projector';
  name: string;
  path: string;
  bytes: number;
}

export interface ExportResult {
  model: string;
  directory: string;
  files: ExportFile[];
  totalBytes: number;
}

async function readError(response: Response, fallback: string): Promise<string> {
  try {
    const data = (await response.json()) as { error?: string };
    if (data.error) return data.error;
  } catch {
    // Keep the fallback when the server returns non-JSON.
  }
  return fallback;
}

/** 让本地服务把 Ollama blob 导出为 GGUF；只导出当前已安装的量化。 */
export async function exportModelGguf(model: string): Promise<ExportResult> {
  let response: Response;
  try {
    response = await fetch('/api/export', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        ...proxyAuthHeaders()
      },
      body: JSON.stringify({ model })
    });
  } catch (error) {
    throw new Error('无法连接本地服务，无法导出模型。', { cause: error });
  }
  if (!response.ok) {
    throw new Error(await readError(response, `导出失败（HTTP ${response.status}）`));
  }
  return (await response.json()) as ExportResult;
}
