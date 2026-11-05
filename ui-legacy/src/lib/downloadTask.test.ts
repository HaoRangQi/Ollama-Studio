import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DownloadTask } from '../types';
import {
  DOWNLOAD_TASK_KEY,
  isHuggingFaceTask,
  isModelScopeTask,
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

  it('infers ModelScope for legacy tasks whose target is a GGUF file', () => {
    expect(
      parseDownloadTask({ ...task, kind: undefined, targetPath: 'sub/model.gguf' })?.kind
    ).toBe('modelscope');
    expect(parseDownloadTask({ ...task, kind: undefined })?.kind).toBeUndefined();
  });

  it('keeps a valid ModelScope retry source and drops malformed ones', () => {
    const source = {
      namespace: 'unsloth',
      name: 'Qwen3.5-0.8B-GGUF',
      file: 'Q4_K_M/Qwen3.5-0.8B-Q4_K_M.gguf',
      quant: 'Q4_K_M',
      modelName: 'unsloth/Qwen3.5-0.8B-GGUF'
    };
    expect(parseDownloadTask({ ...task, kind: 'modelscope', source })?.source).toEqual(source);
    expect(parseDownloadTask({ ...task, source: { namespace: 1 } })?.source).toBeUndefined();
  });

  it('keeps a Hugging Face source and does not confuse it with ModelScope', () => {
    const source = {
      repo: 'saidutta69/MiniCPM-V-4.7-1B-heretic',
      file: 'MiniCPM-V-4.7-1B-heretic-Q4_K_M.gguf',
      quant: 'Q4_K_M',
      modelName: 'saidutta69/MiniCPM-V-4.7-1B-heretic:Q4_K_M'
    };
    const parsed = parseDownloadTask({ ...task, kind: 'huggingface', source });
    expect(parsed?.source).toEqual(source);
    expect(parsed && isHuggingFaceTask(parsed)).toBe(true);
    expect(parsed && isModelScopeTask(parsed)).toBe(false);
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

  it('restores a failed task and its retry source', () => {
    const storage = installStorage();
    storage.set(
      DOWNLOAD_TASK_KEY,
      JSON.stringify({
        ...task,
        kind: 'modelscope',
        error: 'pull model manifest: file does not exist',
        source: {
          namespace: 'unsloth',
          name: 'Qwen3.5-0.8B-GGUF',
          file: 'Q4_K_M/Qwen3.5-0.8B-Q4_K_M.gguf',
          quant: 'Q4_K_M',
          modelName: 'unsloth/Qwen3.5-0.8B-GGUF'
        }
      })
    );
    const restored = loadDownloadTask();
    expect(restored?.error).toContain('manifest');
    expect(restored?.isPaused).toBe(false);
    expect(restored?.source?.file).toBe('Q4_K_M/Qwen3.5-0.8B-Q4_K_M.gguf');
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
