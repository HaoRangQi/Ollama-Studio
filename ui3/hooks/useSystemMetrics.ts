import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchSystemMetrics } from '../lib/legacy';
import type { SystemMetrics } from '../lib/legacy';

export interface SystemMetricsState {
  metrics: SystemMetrics | null;
  error: string | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

/** 系统指标轮询；默认 15 秒，页面隐藏时跳过。 */
export function useSystemMetrics(intervalMs = 15000): SystemMetricsState {
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const inflightRef = useRef(false);

  const refresh = useCallback(async () => {
    if (inflightRef.current) return;
    inflightRef.current = true;
    setLoading(true);
    try {
      setMetrics(await fetchSystemMetrics());
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      inflightRef.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    if (intervalMs <= 0) return;
    const timer = window.setInterval(() => {
      if (!document.hidden) void refresh();
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [refresh, intervalMs]);

  return { metrics, error, loading, refresh };
}
