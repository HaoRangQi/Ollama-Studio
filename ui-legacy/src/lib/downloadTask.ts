import type { DownloadSource, DownloadTask } from '../types';
import { readStorageJson, removeStorageKey, writeStorageJson } from './storage';

export const DOWNLOAD_TASK_KEY = 'ollama_download_task_v1';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 远程 GGUF 任务不能按 pull 重试，两者都要走服务端下载 + ollama create。 */
export function isGgufTask(task: DownloadTask): boolean {
  return task.kind === 'modelscope' || task.kind === 'huggingface' || isLegacyGgufTask(task);
}

/** 旧任务可能没有 kind：GGUF 文件名或已保存的 ModelScope source 说明它是远程 GGUF 任务。 */
export function isModelScopeTask(task: DownloadTask): boolean {
  if (task.kind === 'huggingface') return false;
  if (task.source && 'repo' in task.source) return false;
  if (task.kind === 'modelscope') return true;
  return isLegacyGgufTask(task) || Boolean(task.source && 'namespace' in task.source);
}

export function isHuggingFaceTask(task: DownloadTask): boolean {
  return task.kind === 'huggingface' || Boolean(task.source && 'repo' in task.source);
}

function isLegacyGgufTask(task: DownloadTask): boolean {
  if (task.kind) return task.kind !== 'pull';
  return /\.gguf$/i.test(task.targetPath);
}

function parseSource(value: unknown): DownloadSource | undefined {
  if (!isRecord(value)) return undefined;
  const { file, quant, modelName } = value;
  if (typeof file !== 'string' || typeof quant !== 'string' || typeof modelName !== 'string') {
    return undefined;
  }
  if (typeof value.repo === 'string') {
    return { repo: value.repo, file, quant, modelName };
  }
  const { namespace, name } = value;
  if (typeof namespace !== 'string' || typeof name !== 'string') {
    return undefined;
  }
  return { namespace, name, file, quant, modelName };
}

export function parseDownloadTask(value: unknown): DownloadTask | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== 'string' || typeof value.modelName !== 'string') {
    return null;
  }

  const numberOr = (key: string, fallback: number) =>
    typeof value[key] === 'number' && Number.isFinite(value[key])
      ? (value[key] as number)
      : fallback;
  const stringOr = (key: string, fallback: string) =>
    typeof value[key] === 'string' ? (value[key] as string) : fallback;

  const targetPath = stringOr('targetPath', '');
  // 旧任务没有 kind：targetPath 是 GGUF 文件名说明它原本走 ModelScope，
  // 不能按 pull 重试（会再次得到 pull model manifest: file does not exist）。
  const kind: DownloadTask['kind'] =
    value.kind === 'huggingface'
      ? 'huggingface'
      : value.kind === 'modelscope'
        ? 'modelscope'
        : value.kind === 'pull'
          ? 'pull'
          : /\.gguf$/i.test(targetPath)
            ? 'modelscope'
            : undefined;

  return {
    id: value.id,
    kind,
    modelName: value.modelName,
    quant: stringOr('quant', ''),
    layerStatus: stringOr('layerStatus', ''),
    speed: stringOr('speed', '—'),
    remainingTime: stringOr('remainingTime', '—'),
    progress: Math.min(100, Math.max(0, numberOr('progress', 0))),
    downloadedGb: Math.max(0, numberOr('downloadedGb', 0)),
    totalGb: Math.max(0, numberOr('totalGb', 0)),
    targetPath,
    sha256: stringOr('sha256', ''),
    isPaused: value.isPaused === true,
    isActive: value.isActive !== false,
    isComplete: value.isComplete === true,
    error: typeof value.error === 'string' ? value.error : undefined,
    source: parseSource(value.source)
  };
}

/**
 * A running stream cannot survive a page reload. Tasks that were active are
 * restored in a paused state so the user can explicitly resume the pull
 * (Ollama reuses already-downloaded blobs).
 */
export function markInterrupted(task: DownloadTask): DownloadTask {
  if (!task.isActive || task.isComplete || task.error) return task;
  if (task.isPaused) return task;
  return {
    ...task,
    isPaused: true,
    isInterrupted: true,
    speed: '—',
    remainingTime: '—',
    layerStatus: ''
  };
}

export function loadDownloadTask(): DownloadTask | null {
  const parsed = parseDownloadTask(readStorageJson<unknown>(DOWNLOAD_TASK_KEY, null));
  if (!parsed) return null;
  if (!parsed.isActive && !parsed.isComplete) return null;
  return markInterrupted(parsed);
}

export function saveDownloadTask(task: DownloadTask): boolean {
  return writeStorageJson(DOWNLOAD_TASK_KEY, task);
}

export function clearDownloadTask(): void {
  removeStorageKey(DOWNLOAD_TASK_KEY);
}
