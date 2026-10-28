import { useCallback, useEffect, useState } from 'react';
import { getConnection } from '../api/ollama';
import { mapOllamaModels } from '../api/ollamaMapper';
import { OllamaModel } from '../types';

export type OllamaStatus = 'connecting' | 'online' | 'offline';

export interface UseOllamaResult {
  status: OllamaStatus;
  version: string | null;
  models: OllamaModel[];
  runningCount: number;
  error: string | null;
  refresh: () => Promise<OllamaModel[]>;
}

/**
 * Loads the real Ollama model list and running state.
 * The caller decides whether to fall back to demo data when status is offline.
 */
export function useOllama(): UseOllamaResult {
  const [status, setStatus] = useState<OllamaStatus>('connecting');
  const [version, setVersion] = useState<string | null>(null);
  const [models, setModels] = useState<OllamaModel[]>([]);
  const [runningCount, setRunningCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<OllamaModel[]> => {
    setStatus((current) => (current === 'online' ? current : 'connecting'));
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
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { status, version, models, runningCount, error, refresh };
}
