import { useCallback, useEffect, useState } from 'react';
import type { Language } from '../copy';
import { controlDaemon, fetchDaemonInfo } from '../lib/legacy';
import type { DaemonAction, DaemonInfo } from '../lib/legacy';

const DEFAULT_POLL_MS = 5000;

const SETTLE_MS: Record<DaemonAction, number> = {
  start: 2500,
  restart: 1500,
  stop: 800
};

export interface DaemonState {
  info: DaemonInfo | null;
  error: string | null;
  busy: DaemonAction | null;
  refresh: () => Promise<void>;
  control: (action: DaemonAction) => Promise<string | null>;
  disabledReason: (action: DaemonAction) => string | null;
}

/** 读取并可选控制 Ollama 守护进程；控制能力仍由服务端 ALLOW_DAEMON_CONTROL 决定。 */
export function useDaemon(language: Language, pollMs = DEFAULT_POLL_MS): DaemonState {
  const [info, setInfo] = useState<DaemonInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<DaemonAction | null>(null);

  const refresh = useCallback(async () => {
    try {
      setInfo(await fetchDaemonInfo());
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }, []);

  useEffect(() => {
    void refresh();
    if (pollMs <= 0) return;
    let timer = 0;
    const schedule = () => {
      timer = window.setTimeout(() => {
        if (!document.hidden) void refresh().finally(schedule);
        else schedule();
      }, pollMs);
    };
    schedule();
    return () => window.clearTimeout(timer);
  }, [refresh, pollMs]);

  const control = useCallback(
    async (action: DaemonAction): Promise<string | null> => {
      const latest = await fetchDaemonInfo().catch(() => null);
      if (latest) setInfo(latest);
      const current = latest ?? info;
      if (!current) {
        return language === 'zh' ? '无法读取服务状态，请重试。' : 'Could not read service state.';
      }
      if (!current.controlEnabled) {
        return language === 'zh'
          ? '自动控制未启用。设置 ALLOW_DAEMON_CONTROL=1 并重启本应用。'
          : 'Auto control is off. Set ALLOW_DAEMON_CONTROL=1 and restart this app.';
      }
      if (!current.executable?.[action]) {
        return language === 'zh'
          ? '当前安装方式不支持自动执行，请复制命令手动运行。'
          : 'This install does not support automatic control. Copy the command and run it manually.';
      }

      setBusy(action);
      try {
        await controlDaemon(action);
        await new Promise((resolve) => window.setTimeout(resolve, SETTLE_MS[action]));
        await refresh();
        return null;
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : String(caught);
        await refresh();
        return message;
      } finally {
        setBusy(null);
      }
    },
    [info, language, refresh]
  );

  const disabledReason = useCallback(
    (action: DaemonAction): string | null => {
      const zh = language === 'zh';
      if (busy !== null) return zh ? '正在执行…' : 'Working…';
      if (!info) return zh ? '正在检测服务…' : 'Detecting…';
      if (!info.controlEnabled) {
        return zh
          ? '需设置 ALLOW_DAEMON_CONTROL=1 并重启本应用'
          : 'Set ALLOW_DAEMON_CONTROL=1 and restart this app';
      }
      if (!info.executable?.[action]) {
        return zh ? '当前安装方式需手动执行命令' : 'Run the command manually for this install';
      }
      return null;
    },
    [busy, info, language]
  );

  return { info, error, busy, refresh, control, disabledReason };
}
