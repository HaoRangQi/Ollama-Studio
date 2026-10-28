import React, { useState, useEffect, useRef } from 'react';
import { DaemonConfig, DaemonLog } from '../types';
import { INITIAL_DAEMON_CONFIG } from '../data/mockData';
import { useOllama } from '../hooks/useOllama';
import { OLLAMA_BASE } from '../api/ollama';
import { formatBytes } from '../api/ollamaMapper';
import { useAppTheme } from '../context/ThemeContext';

export const TelemetryScreen: React.FC = () => {
  const { t, language } = useAppTheme();
  const ollama = useOllama();
  const refreshOllama = ollama.refresh;
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

  const logConsoleRef = useRef<HTMLDivElement>(null);
  const lastLiveFingerprintRef = useRef('');

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  useEffect(() => {
    if (isStreaming && logConsoleRef.current) {
      logConsoleRef.current.scrollTop = logConsoleRef.current.scrollHeight;
    }
  }, [logs, isStreaming]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void refreshOllama();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [refreshOllama]);
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

  const handleRestartDaemon = () => {
    setIsRestarting(true);
    void ollama.refresh().finally(() => {
      setIsRestarting(false);
      showToast(
        language === 'zh'
          ? '已刷新 Ollama 状态；重启服务请在系统菜单操作'
          : 'Ollama status refreshed; restart the service from the system menu'
      );
    });
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
              onClick={handleRestartDaemon}
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
              onClick={() =>
                showToast(
                  language === 'zh'
                    ? '网页端不执行服务停止；请在系统菜单或终端控制 Ollama'
                    : 'The browser does not stop Ollama; use the system menu or terminal'
                )
              }
              className="flex items-center gap-2 px-6 py-3 rounded-full bg-[var(--app-surface-highest)] hover:bg-[#93000a] text-[var(--app-text-muted)] hover:text-white text-[13px] font-medium transition-all active:scale-95 cursor-pointer border border-[var(--app-border)]"
            >
              <span className="material-symbols-outlined text-[18px]">power_settings_new</span>
              <span>{language === 'zh' ? '服务控制说明' : 'Service control'}</span>
            </button>
          </div>
        </div>
      </section>

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
          </div>

          <div className="flex items-center justify-between text-[var(--app-text-muted)] text-[11px] pt-1 border-t border-[var(--app-border)]">
            <span>
              {language === 'zh'
                ? 'Ollama 不提供 GPU/ANE 利用率'
                : 'GPU/ANE load is not exposed by Ollama'}
            </span>
            <span className="font-code">{ollama.version ?? '—'}</span>
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
                {language === 'zh' ? '可用空间未知' : 'Free space unknown'}
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
          </div>

          <div className="flex items-center justify-between text-[var(--app-text-muted)] text-[11px] pt-1 border-t border-[var(--app-border)]">
            <span>
              {language === 'zh' ? '共' : 'Total'} {ollama.models.length}{' '}
              {language === 'zh' ? '个模型' : 'models'}
            </span>
            <span className="font-code" style={{ color: 'var(--primary-accent)' }}>
              /api/tags
            </span>
          </div>
        </div>

        {/* 缓存维护 */}
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
                  {language === 'zh' ? '缓存与维护' : 'Cache & maintenance'}
                </h3>
                <p className="text-[11px] text-[var(--app-text-muted)]">Ollama managed</p>
              </div>
            </div>
            <span className="bg-[#ffbd2e]/20 text-[#ffbd2e] text-[11px] font-bold px-2.5 py-0.5 rounded-full border border-[#ffbd2e]/30">
              {language === 'zh' ? '只读' : 'Read-only'}
            </span>
          </div>

          <div className="my-4 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="font-headline text-[24px] text-[#ffafd3] font-bold">—</span>
              <span className="text-[11px] text-[var(--app-text-muted)]">
                {language === 'zh' ? '无可用清理 API' : 'No cleanup API'}
              </span>
            </div>
            <p className="text-[12px] text-[var(--app-text-muted)] leading-relaxed">
              {language === 'zh'
                ? 'Ollama 自动管理 blob 缓存；网页端不执行磁盘清理、服务停止或重启，避免破坏正在进行的推理。'
                : 'Ollama manages its blob cache automatically. The browser does not clean disks, stop, or restart the service, to avoid interrupting inference.'}
            </p>
          </div>

          <button
            disabled
            className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-full font-semibold text-[13px] bg-[var(--app-surface)] text-[var(--app-text-muted)] cursor-not-allowed border border-[var(--app-border)]"
          >
            <span className="material-symbols-outlined text-[18px]">lock</span>
            <span>{language === 'zh' ? '只读状态' : 'Read-only'}</span>
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
              <button
                onClick={handleSaveEnv}
                className="flex items-center gap-1.5 px-4 py-2 rounded-full text-white font-semibold text-[12px] shadow-sm active:scale-95 transition-all cursor-pointer"
                style={{ backgroundColor: 'var(--primary-accent)' }}
              >
                <span className="material-symbols-outlined text-[16px]">save</span>
                <span>{t.telemetry.saveHotReload}</span>
              </button>
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
    </div>
  );
};
