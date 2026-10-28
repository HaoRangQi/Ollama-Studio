import React, { useCallback, useState, useEffect, useRef } from 'react';
import { DaemonConfig, DaemonLog } from '../types';
import { INITIAL_DAEMON_CONFIG } from '../data/mockData';
import { useOllama } from '../hooks/useOllama';
import { OLLAMA_BASE, unloadModel } from '../api/ollama';
import { formatBytes } from '../api/ollamaMapper';
import { cleanupCache, fetchCacheReport, revealCachePath } from '../api/cache';
import type { CacheItem, CacheReport, CleanupResult, CleanupTarget } from '../api/cache';
import { fetchSystemMetrics } from '../api/metrics';
import type { SystemMetrics } from '../api/metrics';
import { controlDaemon, fetchDaemonInfo } from '../api/daemon';
import type { DaemonAction, DaemonInfo, DaemonManager } from '../api/daemon';
import { buildServeCommand } from '../lib/daemonConfig';
import { useAppTheme } from '../context/ThemeContext';

function formatCacheAge(timestamp: number, language: string): string {
  const zh = language === 'zh';
  const diff = Date.now() - timestamp;
  if (diff < 60_000) return zh ? '刚刚' : 'just now';
  if (diff < 3_600_000) {
    const minutes = Math.floor(diff / 60_000);
    return zh ? `${minutes} 分钟前` : `${minutes} min ago`;
  }
  if (diff < 86_400_000) {
    const hours = Math.floor(diff / 3_600_000);
    return zh ? `${hours} 小时前` : `${hours} h ago`;
  }
  return new Date(timestamp).toLocaleDateString(zh ? 'zh-CN' : 'en-US');
}

function cacheItemKindLabel(kind: CacheItem['kind'], language: string): string {
  const zh = language === 'zh';
  if (kind === 'temp') return zh ? '临时目录' : 'temp dir';
  if (kind === 'chunk') return zh ? '分块标记' : 'chunk';
  if (kind === 'partial') return zh ? '未完成' : 'partial';
  return zh ? '完整 blob' : 'blob';
}

const DAEMON_MANAGER_LABELS: Record<DaemonManager, string> = {
  'ollama-app': 'Ollama.app',
  launchd: 'launchd',
  brew: 'Homebrew',
  systemd: 'systemd',
  process: 'ollama serve',
  unknown: '—'
};

function daemonManagerHint(manager: DaemonManager, language: string): string {
  const zh = language === 'zh';
  if (manager === 'ollama-app') {
    return zh
      ? '由 Ollama.app 管理；重启会退出并重新打开应用，运行中的模型会卸载。'
      : 'Managed by Ollama.app; restarting quits and reopens the app and unloads models.';
  }
  if (manager === 'launchd') {
    return zh
      ? '由 launchd 管理；重启会中断运行中的模型与下载。'
      : 'Managed by launchd; restarting interrupts running models and downloads.';
  }
  if (manager === 'brew') {
    return zh
      ? '由 Homebrew services 管理；重启会中断运行中的模型与下载。'
      : 'Managed by Homebrew services; restarting interrupts running models and downloads.';
  }
  if (manager === 'systemd') {
    return zh
      ? '由 systemd 管理；命令包含 sudo，自动执行可能因权限失败。'
      : 'Managed by systemd; the command uses sudo and may fail without permission.';
  }
  if (manager === 'process') {
    return zh
      ? '检测到普通 ollama 进程，未发现服务管理器；请手动停止/启动 ollama serve。'
      : 'A standalone ollama process was found; stop/start ollama serve manually.';
  }
  return zh ? '未检测到 Ollama 进程或服务。' : 'No Ollama process or service detected.';
}

function gpuStatusLabel(metrics: SystemMetrics | null, language: string): string {
  const zh = language === 'zh';
  if (!metrics) return zh ? '读取中…' : 'loading…';
  const gpu = metrics.gpu;
  if (!gpu.available) {
    const reasons: Record<string, string> = {
      'unsupported-platform': zh ? '当前平台不支持' : 'unsupported platform',
      'command-failed': zh ? '读取失败' : 'read failed',
      'not-detected': zh ? '未检测到' : 'not detected',
      'utilization-unavailable': zh ? '利用率不可用' : 'utilization unavailable'
    };
    const reason = gpu.reason ? reasons[gpu.reason] : '';
    return zh
      ? `系统指标不可用${reason ? `（${reason}）` : ''}`
      : `system metric unavailable${reason ? ` (${reason})` : ''}`;
  }
  const name = gpu.name ?? 'GPU';
  return gpu.utilizationPercent === undefined
    ? `${name} · ${zh ? '利用率不可用' : 'utilization unavailable'}`
    : `${name} · ${gpu.utilizationPercent}%`;
}

export const TelemetryScreen: React.FC = () => {
  const { t, language } = useAppTheme();
  const ollama = useOllama();
  const [config, setConfig] = useState<DaemonConfig>(() => {
    try {
      const saved = window.localStorage.getItem('ollama_daemon_config_v1');
      if (saved) {
        return { ...INITIAL_DAEMON_CONFIG, ...(JSON.parse(saved) as DaemonConfig) };
      }
    } catch {
      // Fall back to defaults when localStorage is unavailable or malformed.
    }
    return INITIAL_DAEMON_CONFIG;
  });
  const [logs, setLogs] = useState<DaemonLog[]>([]);
  const [isStreaming, setIsStreaming] = useState(true);
  const [isRestarting, setIsRestarting] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [cacheReport, setCacheReport] = useState<CacheReport | null>(null);
  const [cacheLoading, setCacheLoading] = useState(true);
  const [cacheError, setCacheError] = useState<string | null>(null);
  const [cleanupOpen, setCleanupOpen] = useState(false);
  const [cleanupBusy, setCleanupBusy] = useState(false);
  const [cleanupTargets, setCleanupTargets] = useState<Record<CleanupTarget, boolean>>({
    orphan: false,
    partial: true,
    temp: true
  });
  const [lastCleanup, setLastCleanup] = useState<CleanupResult | null>(null);
  const [expandedCategory, setExpandedCategory] = useState<CleanupTarget | null>(null);
  const [revealBusyPath, setRevealBusyPath] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [metricsError, setMetricsError] = useState<string | null>(null);
  const [daemonInfo, setDaemonInfo] = useState<DaemonInfo | null>(null);
  const [daemonError, setDaemonError] = useState<string | null>(null);
  const [servicePanelOpen, setServicePanelOpen] = useState(false);
  const [isControllingDaemon, setIsControllingDaemon] = useState(false);
  const [isUnloadingAll, setIsUnloadingAll] = useState(false);

  const logConsoleRef = useRef<HTMLDivElement>(null);
  const lastLiveFingerprintRef = useRef('');
  const serveCommand = buildServeCommand(config);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  useEffect(() => {
    if (isStreaming && logConsoleRef.current) {
      logConsoleRef.current.scrollTop = logConsoleRef.current.scrollHeight;
    }
  }, [logs, isStreaming]);

  const refreshCache = async () => {
    setCacheLoading(true);
    setCacheError(null);
    try {
      setCacheReport(await fetchCacheReport());
    } catch (error) {
      setCacheError(error instanceof Error ? error.message : String(error));
    } finally {
      setCacheLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const report = await fetchCacheReport();
        if (!cancelled) setCacheReport(report);
      } catch (error) {
        if (!cancelled) setCacheError(error instanceof Error ? error.message : String(error));
      } finally {
        if (!cancelled) setCacheLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadMetrics = useCallback(async () => {
    try {
      setMetrics(await fetchSystemMetrics());
      setMetricsError(null);
    } catch (error) {
      setMetricsError(error instanceof Error ? error.message : String(error));
    }
  }, []);

  useEffect(() => {
    void loadMetrics();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void loadMetrics();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [loadMetrics]);

  const refreshDaemonInfo = useCallback(async () => {
    try {
      setDaemonInfo(await fetchDaemonInfo());
      setDaemonError(null);
    } catch (error) {
      setDaemonError(error instanceof Error ? error.message : String(error));
    }
  }, []);

  useEffect(() => {
    void refreshDaemonInfo();
  }, [refreshDaemonInfo]);

  // 被服务端锁定的项（下载进行中 / manifest 解析失败）不计入本次清理
  const selectedTargets = (Object.keys(cleanupTargets) as CleanupTarget[]).filter((key) => {
    if (!cleanupTargets[key]) return false;
    if (key === 'orphan' && cacheReport && !cacheReport.scanComplete) return false;
    if (key === 'partial' && cacheReport?.activeDownloads) return false;
    return true;
  });
  const selectedBytes = cacheReport
    ? selectedTargets.reduce((sum, key) => {
        if (key === 'orphan') return sum + cacheReport.blobs.orphan.bytes;
        if (key === 'partial') {
          return sum + cacheReport.blobs.partial.bytes + cacheReport.blobs.chunks.bytes;
        }
        return sum + cacheReport.temp.bytes;
      }, 0)
    : 0;
  const selectedQuarantineBytes =
    cacheReport && selectedTargets.includes('orphan') ? cacheReport.blobs.orphan.bytes : 0;

  const handleCleanup = async () => {
    if (cleanupBusy || selectedTargets.length === 0) return;
    if (selectedTargets.includes('orphan')) {
      const confirmed = window.confirm(
        language === 'zh'
          ? '未引用权重会先移入模型目录下的 .ollama-studio-trash 回收站，不会立即永久删除；确认继续？'
          : 'Unreferenced weights will be moved to .ollama-studio-trash under the models folder instead of being deleted permanently. Continue?'
      );
      if (!confirmed) return;
    }

    setCleanupBusy(true);
    setCacheError(null);
    try {
      const result = await cleanupCache(selectedTargets);
      setCacheReport(result.report);
      setLastCleanup(result);
      setCleanupOpen(false);

      const quarantined = result.quarantinedBytes ?? 0;
      const freed = Math.max(0, result.freedBytes - quarantined);
      const messages: string[] = [];
      if (quarantined > 0) {
        messages.push(
          language === 'zh'
            ? `已移入回收站 ${formatBytes(quarantined)}`
            : `Moved ${formatBytes(quarantined)} to quarantine`
        );
      }
      if (freed > 0) {
        messages.push(
          language === 'zh' ? `已释放 ${formatBytes(freed)}` : `Freed ${formatBytes(freed)}`
        );
      }
      showToast(
        messages.length > 0
          ? messages.join(language === 'zh' ? '，' : '; ')
          : language === 'zh'
            ? '清理完成'
            : 'Cleanup complete'
      );
      if (result.errors.length > 0) {
        setCacheError(result.errors[0]);
      }
    } catch (error) {
      setCacheError(error instanceof Error ? error.message : String(error));
    } finally {
      setCleanupBusy(false);
    }
  };

  const openCleanup = () => {
    if (cacheReport) {
      const candidates: Array<[CleanupTarget, number]> = [
        ['partial', cacheReport.blobs.partial.bytes + cacheReport.blobs.chunks.bytes],
        ['orphan', cacheReport.blobs.orphan.bytes],
        ['temp', cacheReport.temp.bytes]
      ];
      candidates.sort((a, b) => b[1] - a[1]);
      setExpandedCategory(candidates[0][1] > 0 ? candidates[0][0] : null);
    }
    setCleanupOpen(true);
  };

  const handleReveal = async (targetPath: string) => {
    if (revealBusyPath) return;
    setRevealBusyPath(targetPath);
    setCacheError(null);
    try {
      await revealCachePath(targetPath);
    } catch (error) {
      setCacheError(error instanceof Error ? error.message : String(error));
    } finally {
      setRevealBusyPath(null);
    }
  };

  useEffect(() => {
    if (!isStreaming) return;
    const fingerprint = [
      ollama.status,
      ollama.version ?? '',
      ollama.models.length,
      ollama.runningCount,
      ollama.error ?? ''
    ].join('|');
    if (fingerprint === lastLiveFingerprintRef.current) return;
    lastLiveFingerprintRef.current = fingerprint;

    const now = new Date();
    const timestamp = `${now.toISOString().slice(0, 10)} ${now.toLocaleTimeString()}.${now
      .getMilliseconds()
      .toString()
      .padStart(3, '0')}`;
    const text =
      ollama.status === 'online'
        ? language === 'zh'
          ? `已连接 Ollama ${ollama.version ?? ''} · 模型 ${ollama.models.length} 个 · 运行 ${ollama.runningCount} 个`
          : `Connected to Ollama ${ollama.version ?? ''} · ${ollama.models.length} models · ${ollama.runningCount} running`
        : ollama.status === 'offline'
          ? language === 'zh'
            ? `连接 Ollama 失败${ollama.error ? `: ${ollama.error}` : ''}`
            : `Failed to connect to Ollama${ollama.error ? `: ${ollama.error}` : ''}`
          : language === 'zh'
            ? '正在连接 Ollama…'
            : 'Connecting to Ollama…';
    const level: DaemonLog['level'] =
      ollama.status === 'online' ? 'success' : ollama.status === 'offline' ? 'warn' : 'info';

    setLogs((previous) => [
      ...previous.slice(-199),
      {
        id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        timestamp,
        module: 'system',
        text,
        level
      }
    ]);
  }, [
    isStreaming,
    language,
    ollama.status,
    ollama.version,
    ollama.models.length,
    ollama.runningCount,
    ollama.error
  ]);

  const handleRefreshDaemon = () => {
    setIsRestarting(true);
    void Promise.all([ollama.refresh(), loadMetrics(), refreshDaemonInfo()]).finally(() => {
      setIsRestarting(false);
      showToast(
        language === 'zh'
          ? '已刷新 Ollama 状态与系统指标'
          : 'Ollama status and system metrics refreshed'
      );
    });
  };

  const copyText = async (text: string, successMessage: string) => {
    if (!navigator.clipboard) {
      showToast(language === 'zh' ? '当前环境无法访问剪贴板' : 'Clipboard is unavailable');
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      showToast(successMessage);
    } catch {
      showToast(
        language === 'zh' ? '复制失败，请手动选择命令' : 'Copy failed; select the command manually'
      );
    }
  };

  const handleCopyCommand = (command: string | undefined, label: string) => {
    if (!command) {
      showToast(language === 'zh' ? '没有检测到可复制的命令' : 'No command is available to copy');
      return;
    }
    void copyText(command, language === 'zh' ? `已复制${label}命令` : `${label} command copied`);
  };

  const handleCopyServeCommand = () => {
    void copyText(
      serveCommand,
      language === 'zh'
        ? '已复制启动命令；不会写入系统环境，重启 Ollama 后生效'
        : 'Startup command copied; it is not written to the environment'
    );
  };

  const handleControlDaemon = async (action: DaemonAction) => {
    if (!daemonInfo?.controlEnabled || !daemonInfo.canExecute || isControllingDaemon) return;
    const label =
      action === 'restart'
        ? language === 'zh'
          ? '重启'
          : 'restart'
        : language === 'zh'
          ? '停止'
          : 'stop';
    const confirmed = window.confirm(
      language === 'zh'
        ? `将${label} Ollama 服务，运行中的模型和下载会中断。继续？`
        : `This will ${label} Ollama and interrupt running models and downloads. Continue?`
    );
    if (!confirmed) return;

    setIsControllingDaemon(true);
    try {
      await controlDaemon(action);
      showToast(
        language === 'zh'
          ? `已发送${label}命令，正在等待状态更新…`
          : `${label} command sent; waiting for status…`
      );
      await new Promise((resolve) => window.setTimeout(resolve, action === 'restart' ? 1500 : 800));
      await Promise.all([ollama.refresh(), refreshDaemonInfo(), loadMetrics()]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      showToast(
        language === 'zh' ? `服务控制失败：${message}` : `Service control failed: ${message}`
      );
    } finally {
      setIsControllingDaemon(false);
    }
  };

  const handleSaveEnv = () => {
    try {
      window.localStorage.setItem('ollama_daemon_config_v1', JSON.stringify(config));
    } catch {
      // localStorage may be unavailable; the in-memory config still works.
    }
    showToast(
      language === 'zh'
        ? '界面配置已保存；Ollama 环境变量需重启服务后生效'
        : 'UI config saved; Ollama environment variables take effect after a service restart'
    );
  };

  const handleCopyLogs = () => {
    const text = logs.map((l) => `[${l.timestamp}] [${l.module}] ${l.text}`).join('\n');
    navigator.clipboard?.writeText(text);
    showToast(t.telemetry.copyLogs);
  };

  const handleClearLogs = () => {
    setLogs([
      {
        id: 'log-clean',
        timestamp: new Date().toISOString().slice(0, 19).replace('T', ' '),
        module: 'system',
        text:
          language === 'zh'
            ? '控制台日志已被用户手动清空'
            : 'Console logs were cleared by the user',
        level: 'info'
      }
    ]);
    showToast(t.telemetry.clearConsole);
  };

  const totalModelGb = ollama.models.reduce((sum, model) => sum + model.sizeGb, 0);
  const runningModels = ollama.models.filter((model) => model.status === 'running');
  const loadedVramBytes = runningModels.reduce((sum, model) => sum + (model.sizeVramBytes ?? 0), 0);
  const topModels = [...ollama.models].sort((a, b) => b.sizeGb - a.sizeGb).slice(0, 4);
  const totalForBar = Math.max(totalModelGb, 1);
  const runningPercent = ollama.models.length
    ? (runningModels.length / ollama.models.length) * 100
    : 0;
  const diskUsedPercent =
    metrics && metrics.disk.totalBytes > 0
      ? Math.min(100, (metrics.disk.usedBytes / metrics.disk.totalBytes) * 100)
      : 0;

  const handleUnloadAll = async () => {
    if (runningModels.length === 0 || isUnloadingAll) return;
    const confirmed = window.confirm(
      language === 'zh'
        ? '将卸载所有运行中的模型，正在进行的推理会中断。继续？'
        : 'This will unload every running model and interrupt active inference. Continue?'
    );
    if (!confirmed) return;

    setIsUnloadingAll(true);
    try {
      const results = await Promise.allSettled(
        runningModels.map((running) =>
          unloadModel(running.fullTag, {
            kind: running.capabilities?.includes('embedding') ? 'embed' : 'generate'
          })
        )
      );
      await ollama.refresh();
      const failed = results.filter((result) => result.status === 'rejected').length;
      const succeeded = results.length - failed;
      showToast(
        failed > 0
          ? language === 'zh'
            ? `已卸载 ${succeeded} 个模型，${failed} 个失败`
            : `Unloaded ${succeeded} model(s); ${failed} failed`
          : language === 'zh'
            ? `已卸载 ${succeeded} 个运行中的模型`
            : `Unloaded ${succeeded} running model(s)`
      );
    } finally {
      setIsUnloadingAll(false);
    }
  };

  return (
    <div className="flex flex-col w-full p-6 lg:p-8 max-w-[1400px] mx-auto gap-6 animate-in fade-in duration-200">
      {/* Toast Alert */}
      {toastMessage && (
        <div
          className="fixed top-20 right-8 z-50 text-white px-5 py-2.5 rounded-full shadow-2xl flex items-center gap-2 text-[13px] font-medium border border-white/20 animate-in slide-in-from-top-4 duration-150"
          style={{ backgroundColor: 'var(--primary-accent)' }}
        >
          <span className="material-symbols-outlined text-[18px]">info</span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* 1. 顶部守护进程状态大横幅 */}
      <section className="relative overflow-hidden rounded-3xl bg-[var(--app-surface-high)] p-6 lg:p-8 shadow-xl border border-[var(--app-border)]">
        <div
          className="absolute -right-20 -top-20 w-80 h-80 rounded-full blur-3xl pointer-events-none opacity-20"
          style={{ backgroundColor: 'var(--primary-accent)' }}
        />
        <div className="absolute right-1/3 -bottom-16 w-60 h-60 rounded-full bg-[#ba4385]/15 blur-2xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="flex items-start sm:items-center gap-5">
            <div
              className="relative flex items-center justify-center w-16 h-16 rounded-2xl text-white shadow-lg shrink-0"
              style={{ backgroundColor: 'var(--primary-accent)' }}
            >
              <span className="material-symbols-outlined text-[34px]">neurology</span>
              <span className="absolute -bottom-1 -right-1 flex h-4 w-4">
                {ollama.status === 'online' && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#ffafd3] opacity-75" />
                )}
                <span
                  className={`relative inline-flex rounded-full h-4 w-4 ${
                    ollama.status === 'online'
                      ? 'bg-[#27c93f]'
                      : ollama.status === 'offline'
                        ? 'bg-[#ffb4ab]'
                        : 'bg-[#ffbd2e]'
                  }`}
                />
              </span>
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-headline text-[20px] lg:text-[24px] text-[var(--app-text)] font-bold tracking-tight">
                  {ollama.status === 'online'
                    ? language === 'zh'
                      ? 'Ollama 服务在线'
                      : 'Ollama service online'
                    : ollama.status === 'offline'
                      ? language === 'zh'
                        ? 'Ollama 未连接'
                        : 'Ollama offline'
                      : language === 'zh'
                        ? '正在连接 Ollama'
                        : 'Connecting to Ollama'}
                </span>
                <span className="bg-[var(--app-surface-highest)] text-[var(--app-text-muted)] font-code text-[11px] px-2.5 py-0.5 rounded-full border border-[var(--app-border)]">
                  v{ollama.version ?? '—'}
                </span>
                <span className="bg-[var(--app-surface)] text-[var(--app-text)] text-[11px] px-2.5 py-0.5 rounded-full flex items-center gap-1 font-semibold border border-[var(--app-border)]">
                  <span className="material-symbols-outlined text-[14px]">lan</span> {OLLAMA_BASE}
                </span>
                <span className="bg-[var(--app-surface)] text-[var(--app-text-muted)] text-[11px] px-2.5 py-0.5 rounded-full flex items-center gap-1 border border-[var(--app-border)]">
                  <span className="material-symbols-outlined text-[14px]">settings_suggest</span>
                  {daemonInfo ? DAEMON_MANAGER_LABELS[daemonInfo.manager] : '—'}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-4 text-[var(--app-text-muted)] text-[13px]">
                <div className="flex items-center gap-1.5">
                  <span
                    className="material-symbols-outlined text-[18px]"
                    style={{ color: 'var(--primary-accent)' }}
                  >
                    timelapse
                  </span>
                  <span>{language === 'zh' ? '模型数量:' : 'Models:'}</span>
                  <span className="font-code text-[var(--app-text)] font-bold">
                    {ollama.models.length}
                  </span>
                </div>
                <span className="hidden sm:inline text-[var(--app-text-muted)] opacity-60">•</span>
                <div className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[18px]">lan</span>
                  <span>{t.telemetry.socket}</span>
                  <span className="font-code" style={{ color: 'var(--primary-accent)' }}>
                    {OLLAMA_BASE}
                  </span>
                </div>
                <span className="hidden sm:inline text-[var(--app-text-muted)] opacity-60">•</span>
                <div className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[#ffafd3] text-[18px]">
                    stream
                  </span>
                  <span>{language === 'zh' ? '运行中模型:' : 'Running models:'}</span>
                  <span className="font-code text-[#ffafd3] font-bold">
                    {ollama.runningCount} / {ollama.models.length}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
            <button
              onClick={handleRefreshDaemon}
              disabled={isRestarting}
              className="group flex items-center gap-2 px-6 py-3 rounded-full text-white text-[13px] font-semibold transition-all active:scale-95 shadow-md cursor-pointer"
              style={{
                backgroundColor: 'var(--primary-accent)',
                boxShadow: '0 0 16px var(--primary-glow)'
              }}
            >
              <span
                className={`material-symbols-outlined text-[18px] transition-transform duration-500 ${
                  isRestarting ? 'animate-spin' : 'group-hover:rotate-180'
                }`}
              >
                sync
              </span>
              <span>
                {isRestarting
                  ? t.telemetry.restarting
                  : language === 'zh'
                    ? '刷新状态'
                    : 'Refresh status'}
              </span>
            </button>
            <button
              onClick={() => setServicePanelOpen((previous) => !previous)}
              aria-expanded={servicePanelOpen}
              className="flex items-center gap-2 px-6 py-3 rounded-full bg-[var(--app-surface-highest)] hover:bg-[var(--app-surface)] text-[var(--app-text-muted)] hover:text-[var(--app-text)] text-[13px] font-medium transition-all active:scale-95 cursor-pointer border border-[var(--app-border)]"
            >
              <span className="material-symbols-outlined text-[18px]">power_settings_new</span>
              <span>{language === 'zh' ? '服务控制' : 'Service control'}</span>
            </button>
          </div>
        </div>
      </section>

      {servicePanelOpen && (
        <section className="rounded-3xl bg-[var(--app-surface)] p-5 lg:p-6 shadow-md border border-[var(--app-border)]">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center text-white shrink-0"
                style={{ backgroundColor: 'var(--primary-accent)' }}
              >
                <span className="material-symbols-outlined text-[20px]">settings_suggest</span>
              </div>
              <div className="min-w-0">
                <h2 className="font-headline text-[16px] text-[var(--app-text)] font-bold">
                  {language === 'zh' ? '服务控制' : 'Service control'}
                </h2>
                <p className="text-[11px] text-[var(--app-text-muted)] leading-relaxed mt-0.5">
                  {daemonInfo
                    ? daemonManagerHint(daemonInfo.manager, language)
                    : (daemonError ??
                      (language === 'zh' ? '正在检测 Ollama 守护进程…' : 'Detecting Ollama…'))}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => void refreshDaemonInfo()}
                aria-label={language === 'zh' ? '重新检测' : 'Detect again'}
                className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--app-text-muted)] hover:text-[var(--app-text)] hover:bg-[var(--app-surface-highest)] transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">refresh</span>
              </button>
              <button
                onClick={() => setServicePanelOpen(false)}
                aria-label={language === 'zh' ? '关闭' : 'Close'}
                className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--app-text-muted)] hover:text-[var(--app-text)] hover:bg-[var(--app-surface-highest)] transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
            <div className="p-3.5 rounded-2xl bg-[var(--app-surface-high)] border border-[var(--app-border)] flex flex-col gap-1.5 text-[11px]">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[var(--app-text-muted)]">
                  {language === 'zh' ? '管理方式' : 'Manager'}
                </span>
                <span className="font-code text-[var(--app-text)]">
                  {daemonInfo ? DAEMON_MANAGER_LABELS[daemonInfo.manager] : '—'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-[var(--app-text-muted)]">
                  {language === 'zh' ? '进程状态' : 'Process'}
                </span>
                <span className="font-code text-[var(--app-text)]">
                  {daemonInfo ? (daemonInfo.running ? 'running' : 'stopped') : '—'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-[var(--app-text-muted)]">PID</span>
                <span className="font-code text-[var(--app-text)]">{daemonInfo?.pid ?? '—'}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-[var(--app-text-muted)]">
                  {language === 'zh' ? '自动执行' : 'Auto control'}
                </span>
                <span
                  className="font-code"
                  style={{
                    color: daemonInfo?.controlEnabled ? '#27c93f' : 'var(--app-text-muted)'
                  }}
                >
                  {daemonInfo?.controlEnabled ? 'enabled' : 'disabled'}
                </span>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-[var(--app-surface-high)] border border-[var(--app-border)] flex flex-col gap-2 text-[11px]">
              <div>
                <span className="text-[var(--app-text-muted)]">
                  {language === 'zh' ? '重启命令' : 'Restart command'}
                </span>
                <code className="block font-code text-[11px] text-[var(--app-text)] break-all mt-0.5">
                  {daemonInfo?.restartCommand ?? '—'}
                </code>
              </div>
              <div>
                <span className="text-[var(--app-text-muted)]">
                  {language === 'zh' ? '停止命令' : 'Stop command'}
                </span>
                <code className="block font-code text-[11px] text-[var(--app-text)] break-all mt-0.5">
                  {daemonInfo?.stopCommand ?? '—'}
                </code>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 mt-3">
            <button
              onClick={() =>
                handleCopyCommand(
                  daemonInfo?.restartCommand,
                  language === 'zh' ? '重启' : 'restart'
                )
              }
              disabled={!daemonInfo?.restartCommand}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-[var(--app-surface-highest)] text-[var(--app-text)] text-[12px] font-medium border border-[var(--app-border)] hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">content_copy</span>
              {language === 'zh' ? '复制重启命令' : 'Copy restart'}
            </button>
            <button
              onClick={() =>
                handleCopyCommand(daemonInfo?.stopCommand, language === 'zh' ? '停止' : 'stop')
              }
              disabled={!daemonInfo?.stopCommand}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-[var(--app-surface-highest)] text-[var(--app-text)] text-[12px] font-medium border border-[var(--app-border)] hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">content_copy</span>
              {language === 'zh' ? '复制停止命令' : 'Copy stop'}
            </button>
            {daemonInfo?.controlEnabled && daemonInfo.canExecute && (
              <>
                <button
                  onClick={() => void handleControlDaemon('restart')}
                  disabled={isControllingDaemon}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-full text-white text-[12px] font-semibold disabled:opacity-50 disabled:cursor-wait cursor-pointer"
                  style={{ backgroundColor: 'var(--primary-accent)' }}
                >
                  <span
                    className={`material-symbols-outlined text-[16px] ${
                      isControllingDaemon ? 'animate-spin' : ''
                    }`}
                  >
                    {isControllingDaemon ? 'progress_activity' : 'restart_alt'}
                  </span>
                  {language === 'zh' ? '执行重启' : 'Restart now'}
                </button>
                <button
                  onClick={() => void handleControlDaemon('stop')}
                  disabled={isControllingDaemon}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-[var(--app-danger-bg)] text-[var(--app-danger-text)] text-[12px] font-semibold border border-[var(--app-danger-border)] hover:bg-[var(--app-danger-bg-hover)] disabled:opacity-50 disabled:cursor-wait cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[16px]">power_settings_new</span>
                  {language === 'zh' ? '停止服务' : 'Stop now'}
                </button>
              </>
            )}
          </div>

          {daemonInfo && !daemonInfo.controlEnabled && (
            <p className="text-[11px] text-[var(--app-text-muted)] mt-2 leading-relaxed">
              {language === 'zh'
                ? '自动执行默认关闭。需要时设置 ALLOW_DAEMON_CONTROL=1 并重启本应用；命令只在本机执行。'
                : 'Automatic control is off by default. Set ALLOW_DAEMON_CONTROL=1 and restart this app; commands run locally only.'}
            </p>
          )}
          {daemonInfo?.controlEnabled && !daemonInfo.canExecute && (
            <p className="text-[11px] text-[#ffbd2e] mt-2 leading-relaxed">
              {language === 'zh'
                ? '当前管理方式不支持自动执行，请复制命令手动运行。'
                : 'This manager does not support automatic control; copy the command and run it manually.'}
            </p>
          )}
          {daemonError && (
            <p className="text-[11px] text-[var(--app-danger-text)] mt-2 break-all">
              {daemonError}
            </p>
          )}
        </section>
      )}

      {/* 2. 实时模型与存储概览 */}
      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* 本地模型 */}
        <div className="flex flex-col justify-between p-6 rounded-3xl bg-[var(--app-surface-high)] shadow-md border border-[var(--app-border)] hover:-translate-y-0.5 transition-transform">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2.5">
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center text-white"
                style={{ backgroundColor: 'var(--primary-accent)' }}
              >
                <span className="material-symbols-outlined text-[20px]">memory</span>
              </div>
              <div>
                <h3 className="font-headline text-[15px] text-[var(--app-text)] font-bold">
                  {language === 'zh' ? '本地模型' : 'Local models'}
                </h3>
                <p className="text-[11px] text-[var(--app-text-muted)]">GET /api/tags</p>
              </div>
            </div>
            <span
              className="text-[11px] font-bold px-2.5 py-0.5 rounded-full border border-[var(--app-border)]"
              style={{ color: 'var(--primary-accent)' }}
            >
              {ollama.models.length} {language === 'zh' ? '个' : 'models'}
            </span>
          </div>

          <div className="my-4 flex items-center justify-center">
            <div className="relative w-36 h-36 flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                <circle
                  className="text-[var(--app-surface-highest)]"
                  cx="50"
                  cy="50"
                  fill="transparent"
                  r="40"
                  stroke="currentColor"
                  strokeWidth="12"
                />
                <circle
                  style={{ color: 'var(--primary-accent)' }}
                  cx="50"
                  cy="50"
                  fill="transparent"
                  r="40"
                  stroke="currentColor"
                  strokeDasharray="251.2"
                  strokeDashoffset={251.2 - (runningPercent / 100) * 251.2}
                  strokeLinecap="round"
                  strokeWidth="12"
                />
              </svg>
              <div className="absolute flex flex-col items-center justify-center text-center">
                <span className="font-headline text-[24px] text-[var(--app-text)] font-bold leading-none">
                  {totalModelGb.toFixed(1)}
                  <span className="text-[12px] font-normal text-[var(--app-text-muted)]">GB</span>
                </span>
                <span className="text-[10px] text-[var(--app-text-muted)] mt-1">
                  {language === 'zh' ? '模型总大小' : 'Total model size'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-1.5 pt-1 text-[var(--app-text-muted)] text-[11px]">
            <div className="flex items-center justify-between">
              <span>{language === 'zh' ? '运行中' : 'Running'}</span>
              <span className="text-[var(--app-text)] font-code">{runningModels.length}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>{language === 'zh' ? '已加载显存' : 'Loaded VRAM'}</span>
              <span className="text-[var(--app-text)] font-code">
                {loadedVramBytes > 0 ? formatBytes(loadedVramBytes) : '—'}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span>{language === 'zh' ? '代理端点' : 'Proxy'}</span>
              <span className="text-[var(--app-text)] font-code truncate">{OLLAMA_BASE}</span>
            </div>
          </div>
        </div>

        {/* 运行中模型 */}
        <div className="flex flex-col justify-between p-6 rounded-3xl bg-[var(--app-surface-high)] shadow-md border border-[var(--app-border)] hover:-translate-y-0.5 transition-transform">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2.5">
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center text-white"
                style={{ backgroundColor: 'var(--primary-accent)' }}
              >
                <span className="material-symbols-outlined text-[20px]">speed</span>
              </div>
              <div>
                <h3 className="font-headline text-[15px] text-[var(--app-text)] font-bold">
                  {language === 'zh' ? '运行中模型' : 'Running models'}
                </h3>
                <p className="text-[11px] text-[var(--app-text-muted)]">GET /api/ps</p>
              </div>
            </div>
            <span
              className="text-[11px] font-bold px-2.5 py-0.5 rounded-full border border-[var(--app-border)]"
              style={{ color: 'var(--primary-accent)' }}
            >
              {runningModels.length}
            </span>
          </div>

          <div className="my-4 flex flex-col gap-2">
            <div className="flex items-baseline justify-between">
              <span
                className="font-headline text-[28px] font-bold"
                style={{ color: 'var(--primary-accent)' }}
              >
                {runningModels.length}
                <span className="text-[14px] text-[var(--app-text-muted)]"> models</span>
              </span>
              <span className="font-code text-[15px] text-[var(--app-text)] font-semibold">
                {loadedVramBytes > 0 ? formatBytes(loadedVramBytes) : '—'}{' '}
                <span className="text-[11px] text-[var(--app-text-muted)] font-normal">VRAM</span>
              </span>
            </div>

            <div className="h-16 flex items-end gap-1.5 px-2 py-1.5 bg-[var(--app-surface)] rounded-xl border border-[var(--app-border)]">
              {runningModels.length === 0 ? (
                <div className="w-full h-[8%] rounded-full bg-[var(--app-surface-highest)]" />
              ) : (
                runningModels.slice(0, 12).map((model) => {
                  const vram = model.sizeVramBytes ?? 0;
                  const height = Math.max(
                    12,
                    Math.min(100, (vram / Math.max(loadedVramBytes, 1)) * 100)
                  );
                  return (
                    <div
                      key={model.id}
                      className="flex-1 rounded-full"
                      style={{
                        height: `${height}%`,
                        backgroundColor: 'var(--primary-accent)',
                        opacity: 0.55 + height / 220
                      }}
                      title={`${model.fullTag} · ${formatBytes(vram)}`}
                    />
                  );
                })
              )}
            </div>

            <div className="flex flex-col gap-1 pt-1 text-[11px] text-[var(--app-text-muted)]">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate" title={gpuStatusLabel(metrics, language)}>
                  GPU · {gpuStatusLabel(metrics, language)}
                </span>
                <span className="font-code shrink-0">
                  {metrics
                    ? `${formatBytes(metrics.memory.freeBytes)} ${language === 'zh' ? '空闲' : 'free'}`
                    : '—'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="truncate">
                  CPU · {metrics ? metrics.cpu.load1.toFixed(2) : '—'} /{' '}
                  {metrics ? metrics.cpu.cores : '—'} {language === 'zh' ? '核' : 'cores'}
                </span>
                <span className="shrink-0">
                  ANE · {language === 'zh' ? '无公开指标' : 'no public metric'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between text-[var(--app-text-muted)] text-[11px] pt-1 border-t border-[var(--app-border)]">
            <span>{language === 'zh' ? '每 5 秒刷新' : 'Refreshes every 5s'}</span>
            <button
              onClick={() => void handleUnloadAll()}
              disabled={runningModels.length === 0 || isUnloadingAll}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[var(--app-text)] hover:text-[var(--primary-accent)] hover:bg-[var(--app-surface-highest)] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <span
                className={`material-symbols-outlined text-[15px] ${
                  isUnloadingAll ? 'animate-spin' : ''
                }`}
              >
                {isUnloadingAll ? 'progress_activity' : 'bedtime'}
              </span>
              <span>{language === 'zh' ? '全部卸载' : 'Unload all'}</span>
            </button>
          </div>
        </div>

        {/* 模型存储 */}
        <div className="flex flex-col justify-between p-6 rounded-3xl bg-[var(--app-surface-high)] shadow-md border border-[var(--app-border)] hover:-translate-y-0.5 transition-transform">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-[#ba4385]/30 text-[#ffafd3] flex items-center justify-center">
                <span className="material-symbols-outlined text-[20px]">hard_drive</span>
              </div>
              <div>
                <h3 className="font-headline text-[15px] text-[var(--app-text)] font-bold">
                  {language === 'zh' ? '模型存储' : 'Model storage'}
                </h3>
                <p className="text-[11px] text-[var(--app-text-muted)]">Ollama blobs</p>
              </div>
            </div>
            <span className="bg-[#27c93f]/20 text-[#27c93f] text-[11px] font-bold px-2.5 py-0.5 rounded-full border border-[#27c93f]/30">
              {language === 'zh' ? '只读' : 'Read-only'}
            </span>
          </div>

          <div className="my-4 flex flex-col gap-2">
            <div className="flex items-baseline justify-between">
              <div>
                <span className="font-headline text-[28px] text-[var(--app-text)] font-bold">
                  {totalModelGb.toFixed(1)}
                </span>
                <span className="text-[13px] text-[var(--app-text-muted)] ml-1">GB</span>
              </div>
              <span className="text-[11px] text-[var(--app-text-muted)]">
                {metrics
                  ? `${formatBytes(metrics.disk.freeBytes)} ${language === 'zh' ? '可用' : 'free'}`
                  : metricsError
                    ? language === 'zh'
                      ? '读取失败'
                      : 'read failed'
                    : language === 'zh'
                      ? '读取中…'
                      : 'loading…'}
              </span>
            </div>

            <div className="h-2.5 w-full bg-[var(--app-surface)] rounded-full overflow-hidden flex">
              {topModels.length === 0 ? (
                <div className="bg-[var(--app-surface-highest)] h-full w-full" />
              ) : (
                topModels.map((model, index) => (
                  <div
                    key={model.id}
                    className="h-full"
                    style={{
                      width: `${(model.sizeGb / totalForBar) * 100}%`,
                      backgroundColor:
                        index === 0
                          ? '#ba4385'
                          : index === 1
                            ? 'var(--primary-accent)'
                            : index === 2
                              ? '#948ea0'
                              : 'var(--app-surface-highest)'
                    }}
                  />
                ))
              )}
            </div>

            <div className="grid grid-cols-2 gap-1.5 pt-1 text-[11px] text-[var(--app-text-muted)]">
              {topModels.map((model, index) => (
                <div key={model.id} className="flex items-center gap-1.5 truncate">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{
                      backgroundColor:
                        index === 0
                          ? '#ba4385'
                          : index === 1
                            ? 'var(--primary-accent)'
                            : index === 2
                              ? '#948ea0'
                              : 'var(--app-surface-highest)'
                    }}
                  />
                  <span className="truncate" title={model.fullTag}>
                    {model.name} ({model.sizeGb.toFixed(1)}G)
                  </span>
                </div>
              ))}
            </div>

            <div className="pt-1 flex flex-col gap-1">
              <div className="h-1.5 w-full bg-[var(--app-surface)] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${diskUsedPercent}%`,
                    backgroundColor: 'var(--primary-accent)'
                  }}
                />
              </div>
              <div className="flex items-center justify-between text-[10px] text-[var(--app-text-muted)]">
                <span>{language === 'zh' ? '磁盘已用' : 'Disk used'}</span>
                <span className="font-code">
                  {metrics
                    ? `${formatBytes(metrics.disk.usedBytes)} / ${formatBytes(metrics.disk.totalBytes)}`
                    : '—'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between text-[var(--app-text-muted)] text-[11px] pt-1 border-t border-[var(--app-border)]">
            <span>
              {language === 'zh' ? '共' : 'Total'} {ollama.models.length}{' '}
              {language === 'zh' ? '个模型' : 'models'}
            </span>
            <span className="font-code" style={{ color: 'var(--primary-accent)' }}>
              /api/metrics
            </span>
          </div>
        </div>

        {/* 缓存清理 */}
        <div className="flex flex-col justify-between p-6 rounded-3xl bg-[var(--app-surface-high)] shadow-md border border-[var(--app-border)] hover:-translate-y-0.5 transition-transform">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2.5">
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center text-white"
                style={{ backgroundColor: 'var(--primary-accent)' }}
              >
                <span className="material-symbols-outlined text-[20px]">cleaning_services</span>
              </div>
              <div>
                <h3 className="font-headline text-[15px] text-[var(--app-text)] font-bold">
                  {language === 'zh' ? '缓存清理' : 'Cache cleanup'}
                </h3>
                <p className="text-[11px] text-[var(--app-text-muted)]">GET /api/cache</p>
              </div>
            </div>
            <button
              onClick={() => void refreshCache()}
              disabled={cacheLoading}
              aria-label={language === 'zh' ? '重新扫描' : 'Rescan'}
              className="w-7 h-7 rounded-full flex items-center justify-center text-[var(--app-text-muted)] hover:text-[var(--app-text)] hover:bg-[var(--app-surface-highest)] transition-colors cursor-pointer disabled:opacity-50"
            >
              <span
                className={`material-symbols-outlined text-[17px] ${cacheLoading ? 'animate-spin' : ''}`}
              >
                {cacheLoading ? 'progress_activity' : 'refresh'}
              </span>
            </button>
          </div>

          <div className="my-4 flex flex-col gap-2.5">
            <div className="flex items-baseline gap-2">
              <span className="font-headline text-[26px] text-[var(--app-text)] font-bold">
                {cacheReport ? formatBytes(cacheReport.reclaimableBytes) : '—'}
              </span>
              <span className="text-[11px] text-[var(--app-text-muted)]">
                {language === 'zh' ? '可回收' : 'reclaimable'}
              </span>
            </div>

            <div className="flex flex-col gap-1">
              {[
                {
                  key: 'partial',
                  label: language === 'zh' ? '未完成下载' : 'Unfinished downloads',
                  bytes:
                    (cacheReport?.blobs.partial.bytes ?? 0) + (cacheReport?.blobs.chunks.bytes ?? 0)
                },
                {
                  key: 'orphan',
                  label: language === 'zh' ? '未引用权重' : 'Unreferenced blobs',
                  bytes: cacheReport?.blobs.orphan.bytes ?? 0
                },
                {
                  key: 'temp',
                  label: language === 'zh' ? '临时文件' : 'Temp files',
                  bytes: cacheReport?.temp.bytes ?? 0
                }
              ].map((row) => (
                <div key={row.key} className="flex items-center justify-between text-[11px]">
                  <span className="text-[var(--app-text-muted)]">{row.label}</span>
                  <span className="font-code text-[var(--app-text)]">{formatBytes(row.bytes)}</span>
                </div>
              ))}
            </div>

            {cacheError && (
              <p className="text-[11px] text-[var(--app-danger-text)] break-all">{cacheError}</p>
            )}
            {cacheReport?.activeDownloads && (
              <p className="text-[11px] text-[#ffbd2e]">
                {language === 'zh'
                  ? '有下载进行中，未完成文件暂不可清理。'
                  : 'A download is running; unfinished files are locked.'}
              </p>
            )}
            {lastCleanup?.quarantinePath && lastCleanup.quarantinedBytes > 0 && (
              <div className="flex items-start gap-2 rounded-xl border border-dashed border-[var(--app-border)] bg-[var(--app-surface)] p-2.5 text-[10px] text-[var(--app-text-muted)]">
                <span className="material-symbols-outlined text-[15px] shrink-0 text-[#ffbd2e]">
                  inventory_2
                </span>
                <div className="min-w-0 flex-1">
                  <p className="leading-relaxed">
                    {language === 'zh'
                      ? `上次清理已将 ${formatBytes(lastCleanup.quarantinedBytes)} 移入回收站；确认模型正常后可手动删除该目录。`
                      : `${formatBytes(lastCleanup.quarantinedBytes)} was moved to quarantine; delete that folder manually once the models look correct.`}
                  </p>
                  <p
                    className="mt-0.5 break-all font-code text-[9px] opacity-80"
                    title={lastCleanup.quarantinePath}
                  >
                    {lastCleanup.quarantinePath}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleReveal(lastCleanup.quarantinePath!)}
                  disabled={revealBusyPath !== null}
                  aria-label={
                    language === 'zh' ? '在文件管理器中显示回收站' : 'Reveal quarantine folder'
                  }
                  title={
                    language === 'zh' ? '在文件管理器中显示回收站' : 'Reveal quarantine folder'
                  }
                  className="w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-[var(--app-text-muted)] hover:text-[var(--primary-accent)] hover:bg-[var(--app-surface-highest)] transition-colors cursor-pointer disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[14px]">folder_open</span>
                </button>
              </div>
            )}
          </div>

          <button
            onClick={openCleanup}
            disabled={!cacheReport || cacheReport.reclaimableBytes === 0 || cacheLoading}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-full font-semibold text-[13px] bg-[var(--app-surface)] text-[var(--app-text)] border border-[var(--app-border)] hover:border-[var(--primary-accent)] hover:text-[var(--primary-accent)] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className="material-symbols-outlined text-[18px]">delete_sweep</span>
            <span>{language === 'zh' ? '查看明细并清理' : 'Review details & clean'}</span>
          </button>
        </div>
      </section>

      {/* 3. 可视化环境变量与实时日志流水窗 */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* 左侧配置面板 (5 列) */}
        <section className="lg:col-span-5 flex flex-col justify-between rounded-3xl bg-[var(--app-surface)] p-6 lg:p-7 shadow-md border border-[var(--app-border)]">
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className="material-symbols-outlined text-[24px]"
                  style={{ color: 'var(--primary-accent)' }}
                >
                  tune
                </span>
                <h2 className="font-headline text-[18px] text-[var(--app-text)] font-bold">
                  {t.telemetry.envConfigTitle}
                </h2>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={handleCopyServeCommand}
                  title={
                    language === 'zh'
                      ? '复制 ollama serve 启动命令'
                      : 'Copy ollama serve startup command'
                  }
                  aria-label={language === 'zh' ? '复制启动命令' : 'Copy startup command'}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--app-text-muted)] hover:text-[var(--app-text)] hover:bg-[var(--app-surface-highest)] transition-colors cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[17px]">content_copy</span>
                </button>
                <button
                  onClick={handleSaveEnv}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-full text-white font-semibold text-[12px] shadow-sm active:scale-95 transition-all cursor-pointer"
                  style={{ backgroundColor: 'var(--primary-accent)' }}
                >
                  <span className="material-symbols-outlined text-[16px]">save</span>
                  <span>{t.telemetry.saveHotReload}</span>
                </button>
              </div>
            </div>

            <p className="text-[12px] text-[var(--app-text-muted)] leading-relaxed">
              {t.telemetry.envConfigDesc}
            </p>

            <div className="flex flex-col gap-4 mt-1">
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-semibold text-[var(--app-text-muted)]">
                  {t.telemetry.hostLabel}
                </label>
                <div className="relative flex items-center bg-[var(--app-surface-high)] rounded-2xl px-4 py-2.5 border border-[var(--app-border)]">
                  <span className="material-symbols-outlined text-[#948ea0] text-[18px] mr-2">
                    router
                  </span>
                  <input
                    type="text"
                    value={config.host}
                    onChange={(e) => setConfig({ ...config, host: e.target.value })}
                    className="bg-transparent border-none outline-none font-code text-[13px] text-[var(--app-text)] w-full"
                  />
                  <span className="bg-[var(--app-surface)] text-[var(--app-text-muted)] text-[10px] font-bold px-2 py-0.5 rounded-full ml-2 border border-[var(--app-border)] shrink-0">
                    {t.telemetry.hostGlobal}
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-semibold text-[var(--app-text-muted)]">
                  {t.telemetry.modelsPathLabel}
                </label>
                <div className="relative flex items-center bg-[var(--app-surface-high)] rounded-2xl px-4 py-2.5 border border-[var(--app-border)]">
                  <span className="material-symbols-outlined text-[#948ea0] text-[18px] mr-2">
                    folder_open
                  </span>
                  <input
                    type="text"
                    value={config.modelsPath}
                    onChange={(e) => setConfig({ ...config, modelsPath: e.target.value })}
                    className="bg-transparent border-none outline-none font-code text-[13px] text-[var(--app-text)] w-full"
                  />
                  <button
                    type="button"
                    disabled
                    title={
                      language === 'zh'
                        ? '网页端无法打开系统文件选择器'
                        : 'The browser cannot open the system file picker'
                    }
                    className="text-[11px] font-semibold flex items-center gap-0.5 ml-2 shrink-0 cursor-not-allowed opacity-60"
                    style={{ color: 'var(--primary-accent)' }}
                  >
                    <span className="material-symbols-outlined text-[16px]">drive_file_move</span>
                    <span>{t.telemetry.browse}</span>
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-2 p-4 bg-[var(--app-surface-high)] rounded-2xl border border-[var(--app-border)]">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] text-[var(--app-text)] font-medium">
                    {t.telemetry.parallelSlots}
                  </span>
                  <span
                    className="font-code text-[13px] font-bold"
                    style={{ color: 'var(--primary-accent)' }}
                  >
                    {config.numParallel}
                  </span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="16"
                  value={config.numParallel}
                  onChange={(e) => setConfig({ ...config, numParallel: parseInt(e.target.value) })}
                  className="w-full h-2 rounded-full cursor-pointer"
                  style={{ accentColor: 'var(--primary-accent)' }}
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[11px] font-semibold text-[var(--app-text-muted)]">
                  {t.telemetry.keepAliveLabel}
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {(['5m', '15m', '1h', 'forever'] as const).map((k) => {
                    const isChosen = config.keepAlive === k;
                    const label = k === 'forever' ? t.telemetry.keepAliveForever : k;
                    return (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setConfig({ ...config, keepAlive: k })}
                        className={`py-2 rounded-full text-[12px] font-medium transition-all cursor-pointer ${
                          isChosen
                            ? 'text-white font-bold shadow-md'
                            : 'bg-[var(--app-surface-high)] text-[var(--app-text-muted)] hover:bg-[var(--app-surface-highest)] border border-[var(--app-border)]'
                        }`}
                        style={isChosen ? { backgroundColor: 'var(--primary-accent)' } : {}}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-between p-3.5 bg-[var(--app-surface-high)] rounded-2xl border border-[var(--app-border)]">
                <div className="flex flex-col">
                  <span className="text-[12px] text-[var(--app-text)] font-medium">
                    {t.telemetry.flashAttnTitle}
                  </span>
                  <span className="text-[11px] text-[var(--app-text-muted)]">
                    {t.telemetry.flashAttnDesc}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setConfig({ ...config, flashAttention: !config.flashAttention })}
                  className={`w-12 h-7 flex items-center rounded-full p-1 cursor-pointer transition-colors ${
                    config.flashAttention
                      ? 'justify-end'
                      : 'justify-start bg-[var(--app-surface-highest)]'
                  }`}
                  style={config.flashAttention ? { backgroundColor: 'var(--primary-accent)' } : {}}
                >
                  <div className="w-5 h-5 rounded-full bg-white shadow-md" />
                </button>
              </div>

              <div className="flex flex-col gap-2 p-3.5 bg-[var(--app-surface-high)] rounded-2xl border border-[var(--app-border)]">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold text-[var(--app-text-muted)]">
                    {language === 'zh' ? '启动命令预览' : 'Startup command'}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyServeCommand}
                    className="flex items-center gap-1 text-[11px] font-semibold cursor-pointer"
                    style={{ color: 'var(--primary-accent)' }}
                  >
                    <span className="material-symbols-outlined text-[14px]">content_copy</span>
                    <span>{language === 'zh' ? '复制' : 'Copy'}</span>
                  </button>
                </div>
                <code className="font-code text-[10px] leading-relaxed text-[var(--app-text)] break-all">
                  {serveCommand}
                </code>
                <p className="text-[10px] text-[var(--app-text-muted)] leading-relaxed">
                  {language === 'zh'
                    ? '不会写入系统环境；这些变量只在 ollama serve 启动时读取，重启后生效。'
                    : 'Not written to the system environment; these variables are read when ollama serve starts.'}
                </p>
              </div>
            </div>
          </div>

          <div className="pt-4 text-center">
            <span className="text-[11px] text-[var(--app-text-muted)] font-code">
              {t.telemetry.envFileLocation}
            </span>
          </div>
        </section>

        {/* 右侧实时日志流水窗 (7 列) */}
        <section className="lg:col-span-7 flex flex-col justify-between rounded-3xl bg-[#0c0a12] p-6 lg:p-7 shadow-md border border-[var(--app-border)] text-white">
          <div className="flex items-center justify-between pb-3 border-b border-white/5">
            <div className="flex items-center gap-2">
              <span
                className="material-symbols-outlined text-[22px]"
                style={{ color: 'var(--primary-accent)' }}
              >
                terminal
              </span>
              <span className="font-headline text-[16px] text-white font-bold">
                {t.telemetry.liveLogsTitle}
              </span>
              <div className="flex items-center gap-1.5 ml-2 px-2.5 py-0.5 rounded-full bg-[#1c1a25] border border-white/5">
                <span className="w-2 h-2 rounded-full bg-[#27c93f] animate-pulse" />
                <span className="font-code text-[10px] text-[#27c93f] font-semibold">
                  {t.telemetry.liveBadge}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setIsStreaming(!isStreaming);
                  showToast(isStreaming ? t.telemetry.pauseListen : t.telemetry.resumeListen);
                }}
                className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-[#201e2a] hover:bg-[#2b2834] text-white text-[11px] font-medium transition-colors border border-white/5 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px] text-[#ffafd3]">
                  {isStreaming ? 'pause_circle' : 'play_circle'}
                </span>
                <span>{isStreaming ? t.telemetry.pauseListen : t.telemetry.resumeListen}</span>
              </button>
              <button
                onClick={handleCopyLogs}
                className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-[#201e2a] hover:bg-[#2b2834] text-white text-[11px] font-medium transition-colors border border-white/5 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">content_copy</span>
                <span>{t.telemetry.copyLogs}</span>
              </button>
              <button
                onClick={handleClearLogs}
                className="p-1.5 rounded-full bg-[#201e2a] hover:bg-[#2b2834] text-[#cac3d7] hover:text-white transition-colors cursor-pointer border border-white/5"
                title={t.telemetry.clearConsole}
              >
                <span className="material-symbols-outlined text-[16px]">delete_sweep</span>
              </button>
            </div>
          </div>

          <div
            ref={logConsoleRef}
            className="h-[460px] overflow-y-auto bg-[#07060a] p-4 rounded-2xl font-code text-[12px] flex flex-col gap-2 selection:bg-[#7952ec] selection:text-white border border-white/5 mt-3 leading-relaxed"
          >
            {logs.map((log) => {
              let color = 'text-[#cac3d7]';
              if (log.level === 'success') color = 'text-[#27c93f]';
              if (log.level === 'detail') color = 'text-[#cdbdff]';
              if (log.level === 'warn') color = 'text-[#ffbd2e]';
              if (log.module === 'gc') color = 'text-[#ffafd3]';

              return (
                <div
                  key={log.id}
                  className={`${color} break-all hover:bg-white/5 px-1 py-0.5 rounded transition-colors`}
                >
                  <span className="text-[#948ea0]">[{log.timestamp}]</span>{' '}
                  <span className="font-bold">[{log.module}]</span> <span>{log.text}</span>
                </div>
              );
            })}
          </div>

          <div className="pt-3 flex items-center justify-between text-[#948ea0] text-[11px]">
            <span>{t.telemetry.logFormatNote}</span>
          </div>
        </section>
      </div>

      {cleanupOpen && cacheReport && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={() => {
            if (!cleanupBusy) setCleanupOpen(false);
          }}
        >
          <div
            className="w-full max-w-xl max-h-[85vh] overflow-y-auto rounded-3xl bg-[var(--app-surface-high)] border border-[var(--app-border)] shadow-2xl p-6 flex flex-col gap-4"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-headline text-[17px] font-bold text-[var(--app-text)]">
                  {language === 'zh' ? '清理缓存' : 'Clean cache'}
                </h3>
                <div className="mt-1 flex items-start gap-1.5">
                  <p className="text-[11px] text-[var(--app-text-muted)] break-all">
                    {cacheReport.modelsDir}
                  </p>
                  <button
                    type="button"
                    onClick={() => void handleReveal(cacheReport.modelsDir)}
                    disabled={revealBusyPath !== null}
                    aria-label={
                      language === 'zh' ? '在文件管理器中显示模型目录' : 'Reveal models folder'
                    }
                    title={
                      language === 'zh' ? '在文件管理器中显示模型目录' : 'Reveal models folder'
                    }
                    className="w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-[var(--app-text-muted)] hover:text-[var(--primary-accent)] hover:bg-[var(--app-surface-highest)] transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-[15px]">folder_open</span>
                  </button>
                </div>
              </div>
              <button
                onClick={() => {
                  if (!cleanupBusy) setCleanupOpen(false);
                }}
                aria-label={language === 'zh' ? '关闭' : 'Close'}
                className="p-1 rounded-full text-[var(--app-text-muted)] hover:text-[var(--app-text)] hover:bg-[var(--app-surface-highest)] transition-colors cursor-pointer shrink-0"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <p className="text-[12px] text-[var(--app-text-muted)] leading-relaxed">
              {language === 'zh'
                ? '未完成下载与本应用临时目录会直接删除；扫描确认未被任何 manifest 引用的完整权重会先移入模型目录下的 .ollama-studio-trash 回收站，可手动移回 blobs/ 恢复。展开每一类可查看逐文件明细与完整路径。'
                : 'Unfinished downloads and this app’s temp folders are deleted directly. Complete weights that the scan finds unreferenced by any manifest are first moved to .ollama-studio-trash under the models folder, where they can be moved back to blobs/ to restore. Expand a category to inspect each file and its full path.'}
            </p>

            {!cacheReport.scanComplete && (
              <p className="rounded-xl border border-[#ffbd2e]/40 bg-[#ffbd2e]/10 px-3 py-2 text-[11px] leading-relaxed text-[#ffbd2e]">
                {language === 'zh'
                  ? 'manifest 目录存在损坏或悬空链接，未引用权重已锁定。请先修复或重新拉取相关模型，再执行清理。'
                  : 'The manifest store has broken or dangling links, so unreferenced weights are locked. Repair or re-pull the affected models before cleaning.'}
              </p>
            )}

            <div className="flex flex-col gap-2">
              {[
                {
                  key: 'partial' as const,
                  icon: 'downloading',
                  label: language === 'zh' ? '未完成下载' : 'Unfinished downloads',
                  detail:
                    language === 'zh'
                      ? `${cacheReport.blobs.partial.files} 个未完成文件 + ${cacheReport.blobs.chunks.files} 个分块标记`
                      : `${cacheReport.blobs.partial.files} partial files + ${cacheReport.blobs.chunks.files} chunks`,
                  explanation:
                    language === 'zh'
                      ? '下载中断后遗留的中间文件。删除不会影响已安装模型；下次拉取同一层时会重新下载。'
                      : 'Leftovers from interrupted downloads. Deleting them does not affect installed models; the layer is downloaded again on the next pull.',
                  bytes: cacheReport.blobs.partial.bytes + cacheReport.blobs.chunks.bytes,
                  files: cacheReport.blobs.partial.files + cacheReport.blobs.chunks.files,
                  items: [
                    ...cacheReport.blobs.partial.items,
                    ...cacheReport.blobs.chunks.items
                  ].sort((a, b) => b.bytes - a.bytes),
                  hidden: cacheReport.blobs.partial.hidden + cacheReport.blobs.chunks.hidden,
                  locked: cacheReport.activeDownloads,
                  lockReason: language === 'zh' ? '有下载任务进行中' : 'A download is running'
                },
                {
                  key: 'orphan' as const,
                  icon: 'link_off',
                  label:
                    language === 'zh' ? '未引用权重（高风险）' : 'Unreferenced blobs (high risk)',
                  detail:
                    language === 'zh'
                      ? `${cacheReport.blobs.orphan.files} 个完整 blob`
                      : `${cacheReport.blobs.orphan.files} complete blobs`,
                  explanation:
                    language === 'zh'
                      ? '扫描未发现任何 manifest 引用这些完整 blob。默认不勾选；勾选后会先移入 .ollama-studio-trash 回收站，而不是立即永久删除。'
                      : 'No manifest references these complete blobs in the scan. Off by default; if selected, they are moved to .ollama-studio-trash instead of being deleted immediately.',
                  bytes: cacheReport.blobs.orphan.bytes,
                  files: cacheReport.blobs.orphan.files,
                  items: cacheReport.blobs.orphan.items,
                  hidden: cacheReport.blobs.orphan.hidden,
                  locked: !cacheReport.scanComplete,
                  lockReason:
                    language === 'zh'
                      ? 'manifest 不完整或链接损坏，已锁定'
                      : 'Manifest store incomplete or broken; locked'
                },
                {
                  key: 'temp' as const,
                  icon: 'folder_delete',
                  label: language === 'zh' ? '临时文件' : 'Temp folders',
                  detail:
                    language === 'zh'
                      ? `${cacheReport.temp.dirs} 个目录`
                      : `${cacheReport.temp.dirs} folders`,
                  explanation:
                    language === 'zh'
                      ? '本应用下载 GGUF 或导入文件时创建的临时目录，任务结束后未清理的残留。'
                      : 'Temp folders created while downloading or importing GGUF files; leftovers that were not cleaned up.',
                  bytes: cacheReport.temp.bytes,
                  files: cacheReport.temp.dirs,
                  items: cacheReport.temp.items,
                  hidden: cacheReport.temp.hidden,
                  locked: false,
                  lockReason: ''
                }
              ].map((row) => {
                const checked = cleanupTargets[row.key] && !row.locked;
                const expanded = expandedCategory === row.key;
                return (
                  <div
                    key={row.key}
                    className={`rounded-2xl border transition-colors ${
                      checked
                        ? 'border-[var(--primary-accent)]'
                        : 'border-[var(--app-border)] bg-[var(--app-surface)]'
                    }`}
                    style={
                      checked
                        ? {
                            backgroundColor:
                              'color-mix(in srgb, var(--primary-accent) 12%, var(--app-surface))'
                          }
                        : undefined
                    }
                  >
                    <div className="flex items-center gap-1 pr-1.5">
                      <button
                        type="button"
                        disabled={row.locked || cleanupBusy}
                        aria-pressed={checked}
                        onClick={() =>
                          setCleanupTargets((previous) => ({
                            ...previous,
                            [row.key]: !previous[row.key]
                          }))
                        }
                        className={`flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left ${
                          row.locked ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                        }`}
                      >
                        <span
                          className="material-symbols-outlined text-[18px] shrink-0"
                          style={{
                            color: checked ? 'var(--primary-accent)' : 'var(--app-text-muted)'
                          }}
                        >
                          {checked ? 'check_box' : row.locked ? 'lock' : 'check_box_outline_blank'}
                        </span>
                        <span className="min-w-0 flex flex-1 flex-col">
                          <span className="text-[12px] font-semibold text-[var(--app-text)]">
                            {row.label}
                          </span>
                          <span className="text-[10px] text-[var(--app-text-muted)]">
                            {row.locked ? row.lockReason : row.detail}
                          </span>
                        </span>
                        <span className="font-code text-[11px] text-[var(--app-text)] shrink-0">
                          {formatBytes(row.bytes)}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setExpandedCategory(expanded ? null : row.key)}
                        aria-expanded={expanded}
                        aria-label={language === 'zh' ? '查看明细' : 'Show details'}
                        className="w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-[var(--app-text-muted)] hover:text-[var(--app-text)] hover:bg-[var(--app-surface-highest)] transition-colors cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[18px]">
                          {expanded ? 'expand_less' : 'expand_more'}
                        </span>
                      </button>
                    </div>

                    {expanded && (
                      <div className="border-t border-[var(--app-border)] px-3 py-2.5 flex flex-col gap-2">
                        <p className="text-[10px] leading-relaxed text-[var(--app-text-muted)]">
                          {row.explanation}
                        </p>
                        <div className="flex items-center justify-between gap-2 text-[10px] text-[var(--app-text-muted)]">
                          <span>
                            {language === 'zh'
                              ? `共 ${row.files} 项，按体积排序`
                              : `${row.files} items, sorted by size`}
                          </span>
                          {row.hidden > 0 && (
                            <span>
                              {language === 'zh'
                                ? `另有 ${row.hidden} 项未列出`
                                : `${row.hidden} more hidden`}
                            </span>
                          )}
                        </div>
                        {row.items.length === 0 ? (
                          <p className="py-2 text-[11px] text-[var(--app-text-muted)]">
                            {language === 'zh' ? '没有可显示的文件。' : 'No files to show.'}
                          </p>
                        ) : (
                          <ul className="max-h-52 overflow-y-auto rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)]">
                            {row.items.map((item) => (
                              <li
                                key={item.path}
                                className="flex items-center gap-2 border-b border-[var(--app-border)] px-2.5 py-1.5 last:border-b-0"
                              >
                                <span className="shrink-0 rounded-md bg-[var(--app-surface-highest)] px-1.5 py-0.5 text-[9px] font-semibold text-[var(--app-text-muted)]">
                                  {cacheItemKindLabel(item.kind, language)}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <p
                                    className="truncate font-code text-[10px] text-[var(--app-text)]"
                                    title={item.path}
                                  >
                                    {item.name}
                                  </p>
                                  <p
                                    className="truncate text-[9px] text-[var(--app-text-muted)]"
                                    title={item.path}
                                  >
                                    {formatCacheAge(item.modifiedAt, language)}
                                    {item.kind === 'temp' && item.entries != null
                                      ? language === 'zh'
                                        ? ` · ${item.entries} 个文件`
                                        : ` · ${item.entries} files`
                                      : ''}
                                    {' · '}
                                    {item.path}
                                  </p>
                                </div>
                                <span className="shrink-0 font-code text-[10px] text-[var(--app-text)]">
                                  {formatBytes(item.bytes)}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => void handleReveal(item.path)}
                                  disabled={revealBusyPath !== null}
                                  aria-label={
                                    language === 'zh'
                                      ? '在文件管理器中显示'
                                      : 'Reveal in file manager'
                                  }
                                  title={
                                    language === 'zh'
                                      ? '在文件管理器中显示'
                                      : 'Reveal in file manager'
                                  }
                                  className="w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-[var(--app-text-muted)] hover:text-[var(--primary-accent)] hover:bg-[var(--app-surface-highest)] transition-colors cursor-pointer disabled:opacity-50"
                                >
                                  <span className="material-symbols-outlined text-[14px]">
                                    folder_open
                                  </span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between gap-2 rounded-2xl border border-dashed border-[var(--app-border)] px-3 py-2">
              <span className="flex min-w-0 items-center gap-2 text-[10px] text-[var(--app-text-muted)]">
                <span className="material-symbols-outlined text-[15px]">verified_user</span>
                {language === 'zh'
                  ? '被 manifest 引用的权重（不会移入回收站）'
                  : 'Blobs referenced by manifests (not quarantined)'}
              </span>
              <span className="shrink-0 font-code text-[10px] text-[var(--app-text-muted)]">
                {cacheReport.blobs.referenced.files} ·{' '}
                {formatBytes(cacheReport.blobs.referenced.bytes)}
              </span>
            </div>

            {cacheError && (
              <p className="text-[11px] text-[var(--app-danger-text)] break-all">{cacheError}</p>
            )}

            <div className="flex items-center justify-between gap-3 border-t border-[var(--app-border)] pt-3">
              <span className="text-[12px] text-[var(--app-text-muted)]">
                {language === 'zh' ? '预计处理' : 'Will process'}{' '}
                <span className="font-code font-bold text-[var(--app-text)]">
                  {formatBytes(selectedBytes)}
                </span>
                {selectedQuarantineBytes > 0 && (
                  <span className="block text-[10px]">
                    {language === 'zh'
                      ? `其中 ${formatBytes(selectedQuarantineBytes)} 移入回收站`
                      : `${formatBytes(selectedQuarantineBytes)} goes to quarantine`}
                  </span>
                )}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCleanupOpen(false)}
                  disabled={cleanupBusy}
                  className="px-4 py-2 rounded-full text-[12px] font-semibold text-[var(--app-text)] bg-[var(--app-surface)] border border-[var(--app-border)] hover:bg-[var(--app-surface-highest)] transition-colors cursor-pointer disabled:opacity-50"
                >
                  {language === 'zh' ? '取消' : 'Cancel'}
                </button>
                <button
                  onClick={() => void handleCleanup()}
                  disabled={cleanupBusy || selectedTargets.length === 0 || selectedBytes === 0}
                  className="px-4 py-2 rounded-full text-[12px] font-semibold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    backgroundColor: 'var(--app-danger-solid)',
                    color: 'var(--app-danger-on-solid)'
                  }}
                >
                  {cleanupBusy
                    ? language === 'zh'
                      ? '清理中…'
                      : 'Cleaning…'
                    : language === 'zh'
                      ? '确认清理'
                      : 'Clean now'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
