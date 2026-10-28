import { useCallback, useEffect, useRef, useState } from 'react';
import { getConnection } from '../api/ollama';
import { mapOllamaModels } from '../api/ollamaMapper';
import { OllamaModel } from '../types';

export type OllamaStatus = 'connecting' | 'online' | 'offline';

export interface RefreshOptions {
  /** 后台轮询不切换到 connecting，避免离线时每轮闪烁。 */
  silent?: boolean;
}

export interface UseOllamaResult {
  status: OllamaStatus;
  version: string | null;
  models: OllamaModel[];
  runningCount: number;
  error: string | null;
  refresh: (options?: RefreshOptions) => Promise<OllamaModel[]>;
}

/** 默认轮询间隔；`useOllama(0)` 可关闭自动刷新。 */
const DEFAULT_POLL_INTERVAL_MS = 5000;

/**
 * Loads the real Ollama model list and running state.
 * The caller decides whether to fall back to demo data when status is offline.
 */
export function useOllama(pollIntervalMs = DEFAULT_POLL_INTERVAL_MS): UseOllamaResult {
  const [status, setStatus] = useState<OllamaStatus>('connecting');
  const [version, setVersion] = useState<string | null>(null);
  const [models, setModels] = useState<OllamaModel[]>([]);
  const [runningCount, setRunningCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const refreshInFlightRef = useRef<Promise<OllamaModel[]> | null>(null);

  const refresh = useCallback(async (options?: RefreshOptions): Promise<OllamaModel[]> => {
    if (!options?.silent) {
      setStatus((current) => (current === 'online' ? current : 'connecting'));
    }
    // 轮询与手动刷新可能重叠：共享同一个请求，避免堆叠。
    if (refreshInFlightRef.current) return refreshInFlightRef.current;

    const run = (async () => {
      try {
        const connection = await getConnection();
        const mapped = mapOllamaModels(connection.tags, connection.running);
        setVersion(connection.version);
        setModels(mapped);
        setRunningCount(connection.running.length);
        setStatus('online');
        setError(null);
        return mapped;
      } catch (err) {
        setStatus('offline');
        setError(err instanceof Error ? err.message : String(err));
        return [];
      }
    })();

    refreshInFlightRef.current = run;
    try {
      return await run;
    } finally {
      refreshInFlightRef.current = null;
    }
  }, []);

  useEffect(() => {
    void refresh();
    if (pollIntervalMs <= 0) return;
    const timer = window.setInterval(() => {
      void refresh({ silent: true });
    }, pollIntervalMs);
    return () => window.clearInterval(timer);
  }, [refresh, pollIntervalMs]);

  return { status, version, models, runningCount, error, refresh };
}
