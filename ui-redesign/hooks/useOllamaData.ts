import { useCallback, useEffect, useRef, useState } from 'react';
import type { Lang } from '../copy';
import { getConnection, mapOllamaModels } from '../lib/legacy';
import { errorMessage } from '../lib/format';
import type { OllamaModel, OllamaRunning } from '../lib/legacy';

export type ConnectionState = 'connecting' | 'online' | 'offline';

export interface OllamaData {
  status: ConnectionState;
  version: string | null;
  models: OllamaModel[];
  running: OllamaRunning[];
  error: string | null;
  lastUpdated: number | null;
  refresh: () => Promise<OllamaModel[]>;
}

export function useOllamaData(lang: Lang, pollMs: number): OllamaData {
  const [status, setStatus] = useState<ConnectionState>('connecting');
  const [version, setVersion] = useState<string | null>(null);
  const [models, setModels] = useState<OllamaModel[]>([]);
  const [running, setRunning] = useState<OllamaRunning[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const busyRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(
    async (silent: boolean) => {
      if (busyRef.current) return [];
      busyRef.current = true;
      if (!silent) setStatus((previous) => (previous === 'online' ? previous : 'connecting'));
      try {
        const connection = await getConnection();
        if (!mountedRef.current) return [];
        const mapped = mapOllamaModels(connection.tags, connection.running, lang);
        setVersion(connection.version);
        setModels(mapped);
        setRunning(connection.running);
        setStatus('online');
        setError(null);
        setLastUpdated(Date.now());
        return mapped;
      } catch (caught) {
        if (!mountedRef.current) return [];
        setStatus('offline');
        setError(errorMessage(caught) || null);
        return [];
      } finally {
        busyRef.current = false;
      }
    },
    [lang]
  );

  const refresh = useCallback(async () => load(false), [load]);

  useEffect(() => {
    let stopped = false;
    let timer = 0;

    const tick = async (silent: boolean) => {
      if (stopped) return;
      if (document.hidden && silent) {
        timer = window.setTimeout(() => void tick(true), pollMs);
        return;
      }
      await load(silent);
      if (!stopped) timer = window.setTimeout(() => void tick(true), pollMs);
    };

    void tick(false);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [load, pollMs]);

  return { status, version, models, running, error, lastUpdated, refresh };
}
