import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DownloadTask } from '../types';
import {
  DOWNLOAD_TASK_KEY,
  loadDownloadTask,
  markInterrupted,
  parseDownloadTask
} from './downloadTask';

const task: DownloadTask = {
  id: 'task-1',
  modelName: 'qwen2.5:7b',
  quant: 'Q4_K_M',
  layerStatus: 'pulling',
  speed: '1 MB/s',
  remainingTime: '10s',
  progress: 42,
  downloadedGb: 1.2,
  totalGb: 4.7,
  targetPath: '~/.ollama/models',
  sha256: 'abc',
  isPaused: false,
  isActive: true
};

function installStorage() {
  const data = new Map<string, string>();
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => {
        data.set(key, value);
      },
      removeItem: (key: string) => {
        data.delete(key);
      }
    }
  });
  return data;
}

describe('parseDownloadTask', () => {
  it('normalizes a stored task', () => {
    expect(parseDownloadTask(task)).toMatchObject(task);
  });

  it('clamps progress and rejects missing identifiers', () => {
    expect(parseDownloadTask({ ...task, progress: 140 })?.progress).toBe(100);
    expect(parseDownloadTask({ modelName: 'x' })).toBeNull();
    expect(parseDownloadTask(null)).toBeNull();
  });
});

describe('markInterrupted', () => {
  it('pauses active tasks so they can be resumed after reload', () => {
    const interrupted = markInterrupted(task);
    expect(interrupted.isPaused).toBe(true);
    expect(interrupted.isInterrupted).toBe(true);
    expect(interrupted.speed).toBe('—');
  });

  it('leaves completed, failed and already-paused tasks untouched', () => {
    expect(markInterrupted({ ...task, isComplete: true })).toEqual({
      ...task,
      isComplete: true
    });
    expect(markInterrupted({ ...task, error: 'boom' }).error).toBe('boom');
    const paused = { ...task, isPaused: true };
    expect(markInterrupted(paused)).toBe(paused);
  });
});

describe('loadDownloadTask', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('restores and marks an interrupted active task', () => {
    const storage = installStorage();
    storage.set(DOWNLOAD_TASK_KEY, JSON.stringify(task));
    const restored = loadDownloadTask();
    expect(restored?.modelName).toBe('qwen2.5:7b');
    expect(restored?.isPaused).toBe(true);
  });

  it('returns null when nothing is stored', () => {
    installStorage();
    expect(loadDownloadTask()).toBeNull();
  });

  it('ignores cancelled tasks that are no longer active', () => {
    const storage = installStorage();
    storage.set(DOWNLOAD_TASK_KEY, JSON.stringify({ ...task, isActive: false }));
    expect(loadDownloadTask()).toBeNull();
  });
});
