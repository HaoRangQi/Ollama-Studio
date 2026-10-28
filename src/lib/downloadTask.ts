import type { DownloadTask } from '../types';
import { readStorageJson, removeStorageKey, writeStorageJson } from './storage';

export const DOWNLOAD_TASK_KEY = 'ollama_download_task_v1';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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

  return {
    id: value.id,
    modelName: value.modelName,
    quant: stringOr('quant', ''),
    layerStatus: stringOr('layerStatus', ''),
    speed: stringOr('speed', '—'),
    remainingTime: stringOr('remainingTime', '—'),
    progress: Math.min(100, Math.max(0, numberOr('progress', 0))),
    downloadedGb: Math.max(0, numberOr('downloadedGb', 0)),
    totalGb: Math.max(0, numberOr('totalGb', 0)),
    targetPath: stringOr('targetPath', ''),
    sha256: stringOr('sha256', ''),
    isPaused: value.isPaused === true,
    isActive: value.isActive !== false,
    isComplete: value.isComplete === true,
    error: typeof value.error === 'string' ? value.error : undefined
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
