import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from '../lib/format';
import {
  cleanupCache,
  controlDaemon,
  fetchCacheReport,
  fetchDaemonInfo,
  fetchSystemMetrics
} from '../lib/legacy';
import type {
  CacheReport,
  CleanupResult,
  CleanupTarget,
  DaemonAction,
  DaemonInfo,
  SystemMetrics
} from '../lib/legacy';

export interface MetricSample {
  at: number;
  cpuLoad: number;
  gpuPercent: number | null;
  memoryUsed: number;
}

export interface RuntimeErrors {
  metrics: string | null;
  daemon: string | null;
  cache: string | null;
}

export interface RuntimeLoading {
  metrics: boolean;
  daemon: boolean;
  cache: boolean;
}

export interface RuntimeData {
  metrics: SystemMetrics | null;
  daemon: DaemonInfo | null;
  cache: CacheReport | null;
  samples: MetricSample[];
  errors: RuntimeErrors;
  loading: RuntimeLoading;
  refreshReadings: () => Promise<void>;
  refreshCache: () => Promise<void>;
  cleanCache: (targets: CleanupTarget[]) => Promise<CleanupResult>;
  control: (action: DaemonAction) => Promise<void>;
}

const MAX_SAMPLES = 30;

export function useRuntimeData(pollMs: number): RuntimeData {
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [daemon, setDaemon] = useState<DaemonInfo | null>(null);
  const [cache, setCache] = useState<CacheReport | null>(null);
  const [samples, setSamples] = useState<MetricSample[]>([]);
  const [errors, setErrors] = useState<RuntimeErrors>({ metrics: null, daemon: null, cache: null });
  const [loading, setLoading] = useState<RuntimeLoading>({
    metrics: true,
    daemon: true,
    cache: true
  });
  const pollBusyRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refreshMetrics = useCallback(async (silent: boolean) => {
    if (!silent) setLoading((previous) => ({ ...previous, metrics: true }));
    try {
      const next = await fetchSystemMetrics();
      if (!mountedRef.current) return;
      setMetrics(next);
      setErrors((previous) => ({ ...previous, metrics: null }));
      setSamples((previous) => {
        const last = previous[previous.length - 1];
        if (last && last.at === next.collectedAt) return previous;
        const sample: MetricSample = {
          at: next.collectedAt,
          cpuLoad: next.cpu.load1,
          gpuPercent: next.gpu.available ? (next.gpu.utilizationPercent ?? null) : null,
          memoryUsed: next.memory.usedBytes
        };
        return [...previous, sample].slice(-MAX_SAMPLES);
      });
    } catch (caught) {
      if (!mountedRef.current) return;
      setErrors((previous) => ({ ...previous, metrics: errorMessage(caught) }));
    } finally {
      if (mountedRef.current) setLoading((previous) => ({ ...previous, metrics: false }));
    }
  }, []);

  const refreshDaemon = useCallback(async (silent: boolean) => {
    if (!silent) setLoading((previous) => ({ ...previous, daemon: true }));
    try {
      const next = await fetchDaemonInfo();
      if (!mountedRef.current) return;
      setDaemon(next);
      setErrors((previous) => ({ ...previous, daemon: null }));
    } catch (caught) {
      if (!mountedRef.current) return;
      setErrors((previous) => ({ ...previous, daemon: errorMessage(caught) }));
    } finally {
      if (mountedRef.current) setLoading((previous) => ({ ...previous, daemon: false }));
    }
  }, []);

  const refreshCache = useCallback(async () => {
    setLoading((previous) => ({ ...previous, cache: true }));
    try {
      const next = await fetchCacheReport();
      if (!mountedRef.current) return;
      setCache(next);
      setErrors((previous) => ({ ...previous, cache: null }));
    } catch (caught) {
      if (!mountedRef.current) return;
      setErrors((previous) => ({ ...previous, cache: errorMessage(caught) }));
    } finally {
      if (mountedRef.current) setLoading((previous) => ({ ...previous, cache: false }));
    }
  }, []);

  const refreshReadings = useCallback(async () => {
    await Promise.all([refreshMetrics(false), refreshDaemon(false)]);
  }, [refreshMetrics, refreshDaemon]);

  const cleanCache = useCallback(async (targets: CleanupTarget[]) => {
    const result = await cleanupCache(targets);
    if (mountedRef.current) {
      setCache(result.report);
      setErrors((previous) => ({ ...previous, cache: null }));
    }
    return result;
  }, []);

  const control = useCallback(
    async (action: DaemonAction) => {
      await controlDaemon(action);
      await new Promise((resolve) => window.setTimeout(resolve, 1200));
      await Promise.all([refreshDaemon(true), refreshMetrics(true)]);
    },
    [refreshDaemon, refreshMetrics]
  );

  useEffect(() => {
    let stopped = false;
    let timer = 0;

    const tick = async (silent: boolean) => {
      if (stopped) return;
      if (document.hidden && silent) {
        timer = window.setTimeout(() => void tick(true), pollMs);
        return;
      }
      if (!pollBusyRef.current) {
        pollBusyRef.current = true;
        try {
          await Promise.all([refreshMetrics(silent), refreshDaemon(silent)]);
        } finally {
          pollBusyRef.current = false;
        }
      }
      if (!stopped) timer = window.setTimeout(() => void tick(true), pollMs);
    };

    void tick(false);
    void refreshCache();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [pollMs, refreshMetrics, refreshDaemon, refreshCache]);

  return {
    metrics,
    daemon,
    cache,
    samples,
    errors,
    loading,
    refreshReadings,
    refreshCache,
    cleanCache,
    control
  };
}
