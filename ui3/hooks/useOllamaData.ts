import { useCallback, useEffect, useRef, useState } from 'react';
import type { Language } from '../copy';
import { getConnection, mapOllamaModels } from '../lib/legacy';
import type { OllamaModel } from '../lib/legacy';

export type OllamaStatus = 'connecting' | 'online' | 'offline';

export interface OllamaData {
  status: OllamaStatus;
  version: string | null;
  models: OllamaModel[];
  runningCount: number;
  error: string | null;
  refresh: (silent?: boolean) => Promise<OllamaModel[]>;
}

const DEFAULT_INTERVAL_MS = 5000;

/**
 * UI3 自己的 Ollama 数据轮询，避免依赖经典界面的 ThemeContext。
 * 默认每 5 秒静默刷新，和侧栏/遥测的状态节奏保持一致。
 */
export function useOllamaData(language: Language, intervalMs = DEFAULT_INTERVAL_MS): OllamaData {
  const [status, setStatus] = useState<OllamaStatus>('connecting');
  const [version, setVersion] = useState<string | null>(null);
  const [models, setModels] = useState<OllamaModel[]>([]);
  const [runningCount, setRunningCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const inflightRef = useRef<Promise<OllamaModel[]> | null>(null);

  const refresh = useCallback(
    async (silent = false): Promise<OllamaModel[]> => {
      if (!silent) setStatus((current) => (current === 'online' ? current : 'connecting'));
      if (inflightRef.current) return inflightRef.current;

      const run = (async () => {
        try {
          const connection = await getConnection();
          const mapped = mapOllamaModels(connection.tags, connection.running, language);
          setVersion(connection.version);
          setModels(mapped);
          setRunningCount(connection.running.length);
          setStatus('online');
          setError(null);
          return mapped;
        } catch (caught) {
          const message = caught instanceof Error ? caught.message : String(caught);
          setStatus('offline');
          setError(message);
          return [];
        }
      })();

      inflightRef.current = run;
      try {
        return await run;
      } finally {
        inflightRef.current = null;
      }
    },
    [language]
  );

  useEffect(() => {
    void refresh();
    if (intervalMs <= 0) return;
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      void refresh(true);
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [refresh, intervalMs]);

  return { status, version, models, runningCount, error, refresh };
}
