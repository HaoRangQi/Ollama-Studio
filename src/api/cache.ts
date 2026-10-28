import { proxyAuthHeaders } from './ollama';

export type CleanupTarget = 'orphan' | 'partial' | 'temp';

export interface CacheItem {
  name: string;
  path: string;
  bytes: number;
  modifiedAt: number;
  kind: 'blob' | 'partial' | 'chunk' | 'temp';
  /** 仅 temp：目录内文件数。 */
  entries?: number;
}

export interface CacheCategory {
  files: number;
  bytes: number;
  items: CacheItem[];
  hidden: number;
}

export interface CacheReport {
  modelsDir: string;
  blobs: {
    referenced: CacheCategory;
    orphan: CacheCategory;
    partial: CacheCategory;
    chunks: CacheCategory;
  };
  temp: {
    dirs: number;
    bytes: number;
    path: string;
    items: CacheItem[];
    hidden: number;
  };
  reclaimableBytes: number;
  scanComplete: boolean;
  activeDownloads: boolean;
  skippedRecent: number;
  scannedAt: number;
}

export interface CleanupResult {
  freedBytes: number;
  removed: Record<CleanupTarget, number>;
  skippedRecent: number;
  errors: string[];
  report: CacheReport;
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

/** 扫描 Ollama 模型目录与本应用临时目录，返回可回收空间。 */
export async function fetchCacheReport(): Promise<CacheReport> {
  let response: Response;
  try {
    response = await fetch('/api/cache', {
      headers: { accept: 'application/json', ...proxyAuthHeaders() }
    });
  } catch (error) {
    throw new Error('无法连接本地服务，无法读取缓存信息。', { cause: error });
  }
  if (!response.ok) {
    throw new Error(await readError(response, `缓存扫描失败（HTTP ${response.status}）`));
  }
  return (await response.json()) as CacheReport;
}

/** 删除选中的可回收项；服务端会重新扫描后再删，返回清理后的报告。 */
export async function cleanupCache(targets: CleanupTarget[]): Promise<CleanupResult> {
  let response: Response;
  try {
    response = await fetch('/api/cache/cleanup', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        ...proxyAuthHeaders()
      },
      body: JSON.stringify({ targets })
    });
  } catch (error) {
    throw new Error('无法连接本地服务，无法执行清理。', { cause: error });
  }
  if (!response.ok) {
    throw new Error(await readError(response, `清理失败（HTTP ${response.status}）`));
  }
  return (await response.json()) as CleanupResult;
}

/** 在系统文件管理器中显示路径；仅允许模型目录或本应用临时目录。 */
export async function revealCachePath(path: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch('/api/cache/reveal', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        ...proxyAuthHeaders()
      },
      body: JSON.stringify({ path })
    });
  } catch (error) {
    throw new Error('无法连接本地服务，无法打开文件夹。', { cause: error });
  }
  if (!response.ok) {
    throw new Error(await readError(response, `无法打开文件夹（HTTP ${response.status}）`));
  }
}
