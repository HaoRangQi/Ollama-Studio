import { useCallback, useEffect, useState } from 'react';
import { controlDaemon, fetchDaemonInfo } from '../api/daemon';
import type { DaemonAction, DaemonInfo } from '../api/daemon';
import { useAppTheme } from '../context/ThemeContext';

/** 与 `useOllama` 保持同一轮询节奏，两个来源的状态不会互相打架。 */
const DEFAULT_POLL_INTERVAL_MS = 5000;

/** 命令已发出但服务尚未就绪的等待时间，与遥测页原有节奏一致。 */
const SETTLE_DELAY_MS: Record<DaemonAction, number> = {
  start: 2500,
  restart: 1500,
  stop: 800
};

export interface UseDaemonControlResult {
  info: DaemonInfo | null;
  error: string | null;
  /** 正在执行的 action；null 表示空闲。 */
  busy: DaemonAction | null;
  refresh: () => Promise<void>;
  /** 执行失败时返回错误信息，由调用方决定用 toast 还是内联提示。 */
  control: (action: DaemonAction) => Promise<string | null>;
  /** 不可点的原因，用于按钮 title；null 表示可点。 */
  disabledReason: (action: DaemonAction) => string | null;
}

/**
 * 读取 Ollama 守护进程状态并执行启停。
 *
 * 判定集中在 `disabledReason`，调用方不需要自己拼 `controlEnabled && canExecute`。
 * 入口只有遥测页的"服务控制"面板：顶栏容易误触，且中断服务是需要确认的破坏性操作。
 */
export function useDaemonControl(
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS
): UseDaemonControlResult {
  const { language } = useAppTheme();
  const [info, setInfo] = useState<DaemonInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<DaemonAction | null>(null);

  const refresh = useCallback(async () => {
    try {
      setInfo(await fetchDaemonInfo());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void refresh();
    if (pollIntervalMs <= 0) return;

    let timer = 0;
    const schedule = () => {
      timer = window.setTimeout(() => {
        if (!document.hidden) void refresh().finally(schedule);
        else schedule();
      }, pollIntervalMs);
    };
    schedule();
    return () => window.clearTimeout(timer);
  }, [refresh, pollIntervalMs]);

  const control = useCallback(
    async (action: DaemonAction): Promise<string | null> => {
      // 重新读一次再判断：info 可能已被轮询刷新，但点击瞬间仍以最新状态为准。
      const latest = await fetchDaemonInfo().catch(() => null);
      if (latest) setInfo(latest);
      const current = latest ?? info;
      if (!current) return '无法读取服务状态，请重试。';
      if (!current.controlEnabled) {
        return language === 'zh'
          ? '自动控制未启用。设置 ALLOW_DAEMON_CONTROL=1 并重启本应用。'
          : 'Auto control is off. Set ALLOW_DAEMON_CONTROL=1 and restart this app.';
      }
      if (!current.executable[action]) {
        return language === 'zh'
          ? `当前安装方式不支持自动${action === 'start' ? '启动' : action === 'restart' ? '重启' : '停止'}，请到遥测页复制命令手动运行。`
          : `This install does not support automatic ${action}. Copy the command from Telemetry.`;
      }

      setBusy(action);
      try {
        await controlDaemon(action);
        await new Promise((resolve) => window.setTimeout(resolve, SETTLE_DELAY_MS[action]));
        await refresh();
        return null;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
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
      if (busy !== null) {
        return language === 'zh' ? '正在执行…' : 'Working…';
      }
      if (!info) return language === 'zh' ? '正在检测服务…' : 'Detecting…';
      if (!info.controlEnabled) {
        return language === 'zh'
          ? '需设置 ALLOW_DAEMON_CONTROL=1 并重启本应用后才能自动执行'
          : 'Set ALLOW_DAEMON_CONTROL=1 and restart this app to enable';
      }
      if (!info.executable[action]) {
        return language === 'zh'
          ? '当前安装方式需手动执行命令'
          : 'This install requires running the command manually';
      }
      return null;
    },
    [info, busy, language]
  );

  return { info, error, busy, refresh, control, disabledReason };
}
