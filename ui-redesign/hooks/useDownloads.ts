import { useCallback, useEffect, useRef, useState } from 'react';
import { cancelDownloadJob, listDownloadJobs } from '../lib/legacy';
import { errorMessage } from '../lib/format';
import type { DownloadJob } from '../lib/legacy';

export interface DownloadsData {
  jobs: DownloadJob[];
  error: string | null;
  loading: boolean;
  refresh: () => Promise<void>;
  cancel: (id: string) => Promise<void>;
}

const POLL_MS = 2000;

export function useDownloads(): DownloadsData {
  const [jobs, setJobs] = useState<DownloadJob[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const busyRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      const next = await listDownloadJobs();
      if (!mountedRef.current) return;
      setJobs(next);
      setError(null);
    } catch (caught) {
      if (!mountedRef.current) return;
      setError(errorMessage(caught));
    } finally {
      busyRef.current = false;
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  const cancel = useCallback(
    async (id: string) => {
      try {
        await cancelDownloadJob(id);
        await refresh();
      } catch (caught) {
        if (mountedRef.current) setError(errorMessage(caught));
      }
    },
    [refresh]
  );

  useEffect(() => {
    let stopped = false;
    let timer = 0;

    const tick = async () => {
      if (stopped) return;
      if (!document.hidden) await refresh();
      if (!stopped) timer = window.setTimeout(() => void tick(), POLL_MS);
    };

    void tick();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [refresh]);

  return { jobs, error, loading, refresh, cancel };
}
