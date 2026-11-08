import { useCallback, useEffect, useMemo, useState } from 'react';
import { DEFAULT_PREFERENCES, useTheme } from '../context/ThemeContext';
import type { ThemeMode } from '../context/ThemeContext';
import { useDaemon } from '../hooks/useDaemon';
import type { AppEvent, EventLevel } from '../hooks/useEvents';
import type { OllamaStatus } from '../hooks/useOllamaData';
import {
  buildServeCommand,
  cleanupCache,
  fetchCacheReport,
  readStorageJson,
  revealCachePath,
  unloadModel,
  writeStorageJson
} from '../lib/legacy';
import type {
  CacheItem,
  CacheReport,
  CleanupResult,
  CleanupTarget,
  DaemonConfig,
  DaemonManager,
  OllamaModel,
  SystemMetrics
} from '../lib/legacy';
import {
  bytesToGb,
  clamp,
  formatBytes,
  formatClock,
  formatClockSeconds,
  formatPercent,
  formatRelative,
  shortModelName
} from '../lib/format';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Icon } from '../components/Icon';

const DAEMON_CONFIG_KEY = 'ollama_daemon_config_v1';
const ENV_KEY = 'ollama_ui3_env_v1';

const DEFAULT_DAEMON_CONFIG: DaemonConfig = {
  host: '0.0.0.0:11434',
  modelsPath: '~/.ollama/models',
  numParallel: 4,
  keepAlive: '15m',
  flashAttention: true
};

const KEEP_ALIVE_VALUES: DaemonConfig['keepAlive'][] = ['5m', '15m', '1h', 'forever'];
const CONTEXT_OPTIONS = [2048, 4096, 8192, 16384, 32768];

interface EnvVar {
  key: string;
  value: string;
}

export interface TelemetryScreenProps {
  status: OllamaStatus;
  version: string | null;
  models: OllamaModel[];
  events: AppEvent[];
  metrics: SystemMetrics | null;
  metricsError: string | null;
  metricsLoading: boolean;
  onRefreshMetrics: () => Promise<void>;
  pushEvent: (level: EventLevel, text: string) => void;
  onRefreshOllama: () => Promise<unknown>;
  notify: (message: string, tone?: 'info' | 'success' | 'warn' | 'error') => void;
}

function readDaemonConfig(): DaemonConfig {
  const raw = readStorageJson<unknown>(DAEMON_CONFIG_KEY, null);
  if (typeof raw !== 'object' || raw === null) return DEFAULT_DAEMON_CONFIG;
  const value = raw as Record<string, unknown>;
  return {
    host: typeof value.host === 'string' ? value.host : DEFAULT_DAEMON_CONFIG.host,
    modelsPath:
      typeof value.modelsPath === 'string' ? value.modelsPath : DEFAULT_DAEMON_CONFIG.modelsPath,
    numParallel:
      typeof value.numParallel === 'number' && Number.isFinite(value.numParallel)
        ? clamp(Math.round(value.numParallel), 1, 16)
        : DEFAULT_DAEMON_CONFIG.numParallel,
    keepAlive: KEEP_ALIVE_VALUES.includes(value.keepAlive as DaemonConfig['keepAlive'])
      ? (value.keepAlive as DaemonConfig['keepAlive'])
      : DEFAULT_DAEMON_CONFIG.keepAlive,
    flashAttention:
      typeof value.flashAttention === 'boolean'
        ? value.flashAttention
        : DEFAULT_DAEMON_CONFIG.flashAttention
  };
}

function readCustomEnv(): EnvVar[] {
  const raw = readStorageJson<unknown>(ENV_KEY, []);
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (item): item is EnvVar =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as EnvVar).key === 'string' &&
        typeof (item as EnvVar).value === 'string'
    )
    .slice(0, 12);
}

function quoteShellValue(value: string): string {
  if (!value) return "''";
  if (value.startsWith('~/')) {
    return `"$HOME/${value.slice(2).replace(/(["\\$`])/g, '\\$1')}"`;
  }
  if (/^[a-zA-Z0-9_./:@%+=,-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function cacheItemKind(kind: CacheItem['kind'], language: 'zh' | 'en'): string {
  const zh = language === 'zh';
  if (kind === 'temp') return zh ? '临时目录' : 'temp';
  if (kind === 'chunk') return zh ? '分块' : 'chunk';
  if (kind === 'partial') return zh ? '未完成' : 'partial';
  return zh ? '权重' : 'blob';
}

function GaugeCard({
  icon,
  label,
  value,
  suffix,
  note,
  percent,
  tone = 'sage'
}: {
  icon: string;
  label: string;
  value: string;
  suffix?: string;
  note: string;
  percent: number;
  tone?: 'sage' | 'apricot' | 'honey';
}) {
  return (
    <section className={`gauge-card gauge-${tone}`}>
      <div className="gauge-head">
        <span className="gauge-icon">
          <Icon name={icon} size={17} />
        </span>
        <span>{label}</span>
      </div>
      <div className="gauge-value">
        <b>{value}</b>
        {suffix && <span>{suffix}</span>}
      </div>
      <div className="gauge-bar">
        <i style={{ width: `${Math.max(2, Math.min(100, percent))}%` }} />
      </div>
      <p>{note}</p>
    </section>
  );
}

function SwitchRow({
  label,
  description,
  checked,
  onChange
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="settings-row">
      <div className="settings-copy">
        <b>{label}</b>
        {description && <p>{description}</p>}
      </div>
      <button
        type="button"
        className={`switch ${checked ? 'is-on' : ''}`}
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
      >
        <i />
      </button>
    </div>
  );
}

function managerLabel(
  manager: DaemonManager | undefined,
  labels: Record<DaemonManager, string>
): string {
  return manager ? labels[manager] : labels.unknown;
}

export function TelemetryScreen({
  status,
  version,
  models,
  events,
  metrics,
  metricsError,
  metricsLoading,
  onRefreshMetrics,
  pushEvent,
  onRefreshOllama,
  notify
}: TelemetryScreenProps) {
  const { c, language, themeMode, setThemeMode, setLanguage, preferences, setPreference } =
    useTheme();
  const daemon = useDaemon(language);
  const refreshMetrics = onRefreshMetrics;

  const [config, setConfig] = useState<DaemonConfig>(readDaemonConfig);
  const [customEnv, setCustomEnv] = useState<EnvVar[]>(readCustomEnv);
  const [cacheReport, setCacheReport] = useState<CacheReport | null>(null);
  const [cacheLoading, setCacheLoading] = useState(true);
  const [cacheError, setCacheError] = useState<string | null>(null);
  const [cleanupTargets, setCleanupTargets] = useState<Record<CleanupTarget, boolean>>({
    orphan: false,
    partial: true,
    temp: true
  });
  const [expandedCategory, setExpandedCategory] = useState<CleanupTarget | null>(null);
  const [cleanupOpen, setCleanupOpen] = useState(false);
  const [cleanupBusy, setCleanupBusy] = useState(false);
  const [lastCleanup, setLastCleanup] = useState<CleanupResult | null>(null);
  const [revealBusy, setRevealBusy] = useState<string | null>(null);
  const [confirmDaemon, setConfirmDaemon] = useState<'restart' | 'stop' | null>(null);
  const [unloadOpen, setUnloadOpen] = useState(false);
  const [unloading, setUnloading] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const refreshCache = useCallback(async () => {
    setCacheLoading(true);
    setCacheError(null);
    try {
      setCacheReport(await fetchCacheReport());
    } catch (caught) {
      setCacheError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setCacheLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshCache();
  }, [refreshCache]);

  const runningModels = useMemo(
    () => models.filter((model) => model.status === 'running'),
    [models]
  );

  const loadedVramBytes = useMemo(
    () => runningModels.reduce((sum, model) => sum + (model.sizeVramBytes ?? 0), 0),
    [runningModels]
  );

  const modelDiskGb = useMemo(() => models.reduce((sum, model) => sum + model.sizeGb, 0), [models]);

  const memoryTotal = metrics?.memory.totalBytes ?? 0;
  const memoryUsed = metrics?.memory.usedBytes ?? 0;
  const vramPercent = memoryTotal > 0 ? (loadedVramBytes / memoryTotal) * 100 : 0;
  const memoryPercent = memoryTotal > 0 ? (memoryUsed / memoryTotal) * 100 : 0;
  const cpuPercent = metrics
    ? clamp((metrics.cpu.load1 / Math.max(1, metrics.cpu.cores)) * 100, 0, 100)
    : 0;

  const vramNote = metrics
    ? `${c.telemetry.memoryTotal} · ${bytesToGb(memoryTotal)} GB`
    : c.telemetry.metricsUnavailable;
  const memoryNote = metrics
    ? `${formatBytes(metrics.memory.freeBytes)} ${language === 'zh' ? '空闲' : 'free'} · ${metrics.cpu.cores} ${c.telemetry.cpuCores.toLowerCase()}`
    : c.telemetry.metricsUnavailable;
  const cpuNote = metrics
    ? `load ${metrics.cpu.load1.toFixed(2)} / ${metrics.cpu.load5.toFixed(2)} · ${metrics.cpu.cores} ${c.telemetry.cpuCores.toLowerCase()}`
    : c.telemetry.metricsUnavailable;

  const daemonMeta = daemon.info
    ? c.telemetry.daemonMeta(
        managerLabel(daemon.info.manager, c.telemetry.manager),
        daemon.info.pid
      )
    : daemon.error
      ? daemon.error
      : c.telemetry.daemonDetecting;
  const daemonRunning = daemon.info?.running ?? status === 'online';
  const daemonTag = daemon.info
    ? daemonRunning
      ? c.telemetry.daemonRunning
      : c.telemetry.daemonStopped
    : status === 'offline'
      ? c.telemetry.daemonStopped
      : c.telemetry.daemonDetecting;

  const settingsCount = useMemo(() => {
    let count = 0;
    if (preferences.defaultKeepAlive !== DEFAULT_PREFERENCES.defaultKeepAlive) count += 1;
    if (preferences.defaultNumCtx !== DEFAULT_PREFERENCES.defaultNumCtx) count += 1;
    if (preferences.showThinking !== DEFAULT_PREFERENCES.showThinking) count += 1;
    if (preferences.reduceMotion !== DEFAULT_PREFERENCES.reduceMotion) count += 1;
    if (themeMode !== 'system') count += 1;
    if (language !== 'zh') count += 1;
    return count;
  }, [language, preferences, themeMode]);

  const command = useMemo(() => {
    const base = buildServeCommand(config);
    const extra = customEnv
      .filter((item) => /^[A-Z_][A-Z0-9_]*$/.test(item.key))
      .map((item) => `${item.key}=${quoteShellValue(item.value)}`)
      .join(' ');
    return extra ? base.replace(/ ollama serve$/, ` ${extra} ollama serve`) : base;
  }, [config, customEnv]);

  const copyText = async (text: string, message: string) => {
    try {
      await navigator.clipboard.writeText(text);
      notify(message, 'success');
    } catch {
      notify(c.toast.copyFailed, 'error');
    }
  };

  const handleDaemonControl = async (action: 'start' | 'restart' | 'stop') => {
    const reason = daemon.disabledReason(action);
    if (reason) {
      notify(reason, 'warn');
      return;
    }
    const label =
      action === 'start'
        ? c.telemetry.start
        : action === 'restart'
          ? c.telemetry.restart
          : c.telemetry.stop;
    const failure = await daemon.control(action);
    if (failure) {
      notify(`${c.telemetry.controlFailed}: ${failure}`, 'error');
      pushEvent('error', `${c.telemetry.controlFailed}: ${failure}`);
    } else {
      notify(c.telemetry.controlOk(label), 'success');
      pushEvent('success', c.telemetry.controlOk(label));
    }
    await Promise.all([onRefreshOllama(), refreshMetrics()]);
  };

  const requestDaemonControl = (action: 'start' | 'restart' | 'stop') => {
    if (action === 'start') {
      void handleDaemonControl(action);
      return;
    }
    setConfirmDaemon(action);
  };

  const handleReveal = async (targetPath: string) => {
    if (revealBusy) return;
    setRevealBusy(targetPath);
    setCacheError(null);
    try {
      await revealCachePath(targetPath);
    } catch (caught) {
      setCacheError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setRevealBusy(null);
    }
  };

  const handleUnload = async (model: OllamaModel) => {
    if (unloading) return;
    setUnloading(model.id);
    try {
      await unloadModel(model.fullTag, {
        kind: model.capabilities?.includes('embedding') ? 'embed' : 'generate'
      });
      await onRefreshOllama();
      notify(c.models.unloadDone(model.fullTag), 'success');
      pushEvent('info', c.models.unloadDone(model.fullTag));
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      notify(`${c.models.actionFailed}: ${message}`, 'error');
      pushEvent('error', `${c.models.actionFailed}: ${message}`);
    } finally {
      setUnloading(null);
      setUnloadOpen(false);
    }
  };

  const handleUnloadAll = async () => {
    if (runningModels.length === 0) return;
    setUnloadOpen(false);
    setUnloading('all');
    try {
      const results = await Promise.allSettled(
        runningModels.map((model) =>
          unloadModel(model.fullTag, {
            kind: model.capabilities?.includes('embedding') ? 'embed' : 'generate'
          })
        )
      );
      await onRefreshOllama();
      const failed = results.filter((result) => result.status === 'rejected').length;
      if (failed > 0) {
        notify(
          language === 'zh'
            ? `已卸载 ${results.length - failed} 个模型，${failed} 个失败`
            : `Unloaded ${results.length - failed} model(s); ${failed} failed`,
          'warn'
        );
      } else {
        notify(c.models.unloadAllDone, 'success');
        pushEvent('info', c.models.unloadAllDone);
      }
    } finally {
      setUnloading(null);
    }
  };

  const categories = useMemo(() => {
    if (!cacheReport) return [];
    return [
      {
        key: 'partial' as const,
        icon: 'downloading',
        label: c.telemetry.cacheCategoryPartial,
        bytes: cacheReport.blobs.partial.bytes + cacheReport.blobs.chunks.bytes,
        files: cacheReport.blobs.partial.files + cacheReport.blobs.chunks.files,
        items: [...cacheReport.blobs.partial.items, ...cacheReport.blobs.chunks.items].sort(
          (a, b) => b.bytes - a.bytes
        ),
        locked: cacheReport.activeDownloads,
        lockReason: c.telemetry.cacheLockedDownloads
      },
      {
        key: 'orphan' as const,
        icon: 'link_off',
        label: c.telemetry.cacheCategoryOrphan,
        bytes: cacheReport.blobs.orphan.bytes,
        files: cacheReport.blobs.orphan.files,
        items: cacheReport.blobs.orphan.items,
        locked: !cacheReport.scanComplete,
        lockReason: c.telemetry.cacheLockedOrphan
      },
      {
        key: 'temp' as const,
        icon: 'folder_delete',
        label: c.telemetry.cacheCategoryTemp,
        bytes: cacheReport.temp.bytes,
        files: cacheReport.temp.dirs,
        items: cacheReport.temp.items,
        locked: cacheReport.activeDownloads,
        lockReason: c.telemetry.cacheLockedDownloads
      }
    ];
  }, [cacheReport, c]);

  const selectedTargets = useMemo(
    () =>
      categories
        .filter((category) => cleanupTargets[category.key] && !category.locked)
        .map((category) => category.key),
    [categories, cleanupTargets]
  );

  const selectedBytes = useMemo(
    () =>
      categories
        .filter((category) => selectedTargets.includes(category.key))
        .reduce((sum, category) => sum + category.bytes, 0),
    [categories, selectedTargets]
  );

  const selectedQuarantineBytes =
    cacheReport && selectedTargets.includes('orphan') ? cacheReport.blobs.orphan.bytes : 0;

  const openCleanup = () => {
    if (selectedTargets.length === 0) {
      notify(c.telemetry.cleanupSelect, 'warn');
      return;
    }
    setCleanupOpen(true);
  };

  const handleCleanup = async () => {
    if (cleanupBusy || selectedTargets.length === 0) return;
    setCleanupBusy(true);
    setCacheError(null);
    try {
      const result = await cleanupCache(selectedTargets);
      setCacheReport(result.report);
      setLastCleanup(result);
      setCleanupOpen(false);
      const quarantined = result.quarantinedBytes ?? 0;
      const freed = Math.max(0, result.freedBytes - quarantined);
      notify(
        c.telemetry.cleanupDone(formatBytes(freed), formatBytes(quarantined)),
        result.errors.length > 0 ? 'warn' : 'success'
      );
      if (result.errors.length > 0) {
        setCacheError(c.telemetry.cleanupErrors(result.errors.length));
        pushEvent('warn', c.telemetry.cleanupErrors(result.errors.length));
      } else {
        pushEvent('success', c.telemetry.cleanupDone(formatBytes(freed), formatBytes(quarantined)));
      }
    } catch (caught) {
      setCacheError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setCleanupBusy(false);
    }
  };

  const handleSaveEnv = () => {
    writeStorageJson(DAEMON_CONFIG_KEY, config);
    writeStorageJson(ENV_KEY, customEnv);
    notify(c.telemetry.envSaved, 'success');
    pushEvent('info', c.telemetry.envSaved);
  };

  const updateCustomEnv = (index: number, patch: Partial<EnvVar>) => {
    setCustomEnv((current) =>
      current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item))
    );
  };

  const refreshAll = async () => {
    setRefreshing(true);
    try {
      await Promise.all([daemon.refresh(), refreshMetrics(), onRefreshOllama()]);
      notify(c.common.refresh + ' ✓', 'success');
    } finally {
      setRefreshing(false);
    }
  };

  const daemonActionLabel = confirmDaemon === 'restart' ? c.telemetry.restart : c.telemetry.stop;
  const confirmTitle =
    confirmDaemon === 'restart' ? c.telemetry.confirmRestartTitle : c.telemetry.confirmStopTitle;
  const confirmDesc =
    confirmDaemon === 'restart' ? c.telemetry.confirmRestartDesc : c.telemetry.confirmStopDesc;

  const activeDownloads = cacheReport?.activeDownloads ?? false;
  const scanComplete = cacheReport?.scanComplete ?? true;
  const modelsDir = cacheReport?.modelsDir ?? '—';
  const logStatus =
    status === 'online'
      ? c.telemetry.logNormal
      : status === 'offline'
        ? c.telemetry.logAbnormal
        : c.telemetry.logChecking;

  return (
    <div className="telemetry-page">
      <div className="telemetry-top">
        <div className="telemetry-main">
          <section className={`daemon-hero daemon-${daemonRunning ? 'online' : 'offline'}`}>
            <div className="daemon-glow" aria-hidden="true">
              <Icon name="memory" size={150} />
            </div>
            <div className="daemon-hero-head">
              <div className="daemon-title">
                <span className="daemon-status-dot" />
                <h2>{c.telemetry.daemonTitle}</h2>
                <span className="daemon-version">{version ? `v${version}` : '—'}</span>
                <span className="tag daemon-tag">{daemonTag}</span>
              </div>
              <span className="daemon-host">{c.telemetry.daemonHost}</span>
            </div>
            <p className="daemon-meta">{daemonMeta}</p>
            <div className="daemon-actions">
              {(['start', 'restart', 'stop'] as const).map((action) => {
                const reason = daemon.disabledReason(action);
                const spinning = daemon.busy === action;
                return (
                  <button
                    key={action}
                    type="button"
                    className={`daemon-action ${action === 'stop' ? 'is-stop' : ''} ${
                      action === 'start' ? 'is-primary' : ''
                    }`}
                    disabled={daemon.busy !== null}
                    title={reason ?? daemonActionLabelFor(action, c)}
                    onClick={() => requestDaemonControl(action)}
                  >
                    <Icon
                      name={
                        spinning
                          ? 'progress_activity'
                          : action === 'start'
                            ? 'play_arrow'
                            : action === 'restart'
                              ? 'restart_alt'
                              : 'stop'
                      }
                      size={17}
                      filled={action === 'start'}
                    />
                    {spinning
                      ? c.telemetry.working
                      : action === 'start'
                        ? c.telemetry.start
                        : action === 'restart'
                          ? c.telemetry.restart
                          : c.telemetry.stop}
                  </button>
                );
              })}
              <span className="spacer" />
              <button
                type="button"
                className="iconbtn hero-refresh"
                onClick={() => void refreshAll()}
                aria-label={c.common.refresh}
                title={c.common.refresh}
              >
                <Icon name={refreshing ? 'progress_activity' : 'refresh'} size={18} />
              </button>
            </div>
            {daemon.info && !daemon.info.controlEnabled && (
              <p className="daemon-note">
                <Icon name="lock" size={14} />
                {c.telemetry.controlOff} · {c.telemetry.controlOffHint}
              </p>
            )}
            {daemon.info && (
              <details className="daemon-manual">
                <summary>{c.telemetry.manualCommands}</summary>
                <div className="manual-rows">
                  {(['start', 'restart', 'stop'] as const).map((action) => {
                    const value =
                      action === 'start'
                        ? daemon.info?.startCommand
                        : action === 'restart'
                          ? daemon.info?.restartCommand
                          : daemon.info?.stopCommand;
                    return (
                      <div key={action} className="manual-row">
                        <code>{action}</code>
                        <span>{value ?? '—'}</span>
                        <button
                          type="button"
                          className="iconbtn small"
                          disabled={!value}
                          onClick={() => value && void copyText(value, c.toast.copied)}
                          aria-label={c.common.copy}
                        >
                          <Icon name="content_copy" size={15} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </details>
            )}
          </section>

          <div className="gauge-grid">
            <GaugeCard
              icon="memory"
              label={c.telemetry.gpuVram}
              value={bytesToGb(loadedVramBytes)}
              suffix={`/ ${memoryTotal > 0 ? bytesToGb(memoryTotal) : '—'} GB`}
              note={vramNote}
              percent={vramPercent}
              tone="sage"
            />
            <GaugeCard
              icon="database"
              label={c.telemetry.unifiedMemory}
              value={memoryTotal > 0 ? bytesToGb(memoryUsed) : '—'}
              suffix={`/ ${memoryTotal > 0 ? bytesToGb(memoryTotal) : '—'} GB`}
              note={memoryNote}
              percent={memoryPercent}
              tone="honey"
            />
            <GaugeCard
              icon="speed"
              label={c.telemetry.cpuLoad}
              value={metrics ? formatPercent(cpuPercent) : '—'}
              note={cpuNote}
              percent={cpuPercent}
              tone="sage"
            />
          </div>

          {metricsError && (
            <div className="inline-error">
              {c.telemetry.metricsUnavailable}: {metricsError}
              <button type="button" className="text-button" onClick={() => void refreshMetrics()}>
                {metricsLoading ? c.common.loading : c.telemetry.refreshMetrics}
              </button>
            </div>
          )}

          <section className="panel telemetry-system" id="telemetry-system">
            <div className="panel-head">
              <h3>{c.telemetry.systemInfo}</h3>
              <span className="tag tag-mist">{c.telemetry.readonly}</span>
            </div>
            <div className="info-grid">
              <div className="info-cell">
                <span>{c.telemetry.chip}</span>
                <b>{metrics?.gpu.name ?? '—'}</b>
              </div>
              <div className="info-cell">
                <span>{c.telemetry.modelCount}</span>
                <b>{models.length}</b>
              </div>
              <div className="info-cell">
                <span>{c.telemetry.unifiedMemory}</span>
                <b>{memoryTotal > 0 ? formatBytes(memoryTotal) : '—'}</b>
              </div>
              <div className="info-cell">
                <span>{c.telemetry.diskUsage}</span>
                <b>{modelDiskGb > 0 ? `${modelDiskGb.toFixed(1)} GB` : '—'}</b>
              </div>
              <div className="info-cell">
                <span>{c.telemetry.platform}</span>
                <b>{daemon.info?.platform ?? '—'}</b>
              </div>
              <div className="info-cell">
                <span>{c.telemetry.modelsDir}</span>
                <b className="path-value" title={modelsDir}>
                  {modelsDir}
                  {cacheReport && (
                    <button
                      type="button"
                      className="inline-icon"
                      onClick={() => void handleReveal(modelsDir)}
                      disabled={revealBusy !== null}
                      aria-label={c.telemetry.reveal}
                      title={c.telemetry.reveal}
                    >
                      <Icon name="folder_open" size={14} />
                    </button>
                  )}
                </b>
              </div>
              <div className="info-cell">
                <span>{c.telemetry.gpu}</span>
                <b>
                  {metrics?.gpu.available
                    ? (metrics.gpu.name ?? `GPU · ${metrics.gpu.utilizationPercent ?? '—'}%`)
                    : c.telemetry.gpuUnavailable}
                </b>
              </div>
              <div className="info-cell">
                <span>{c.telemetry.logs}</span>
                <b className={status === 'online' ? 'text-sage' : 'text-warn'}>{logStatus}</b>
              </div>
            </div>

            <div className="events-block">
              <div className="events-head">
                <h4>{c.telemetry.events}</h4>
                <span>{events.length}</span>
              </div>
              {events.length === 0 ? (
                <p className="events-empty">{c.telemetry.noEvents}</p>
              ) : (
                <ul className="event-list">
                  {events.slice(0, 5).map((event) => (
                    <li key={event.id} className={`event-${event.level}`}>
                      <span className="event-time">{formatClockSeconds(event.at)}</span>
                      <span className={`event-badge event-badge-${event.level}`}>
                        {event.level.toUpperCase()}
                      </span>
                      <span className="event-text">{event.text}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>

        <div className="telemetry-side">
          <section className="panel running-panel">
            <div className="panel-head">
              <h3>{c.telemetry.runningModels}</h3>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={runningModels.length === 0 || unloading !== null}
                onClick={() => setUnloadOpen(true)}
              >
                <Icon name="bedtime" size={15} />
                {c.telemetry.unloadAll}
              </button>
            </div>
            {runningModels.length === 0 ? (
              <div className="running-empty">
                <Icon name="memory" size={24} />
                <p>{c.telemetry.noRunning}</p>
              </div>
            ) : (
              <ul className="running-list">
                {runningModels.map((model) => (
                  <li key={model.id}>
                    <span className="running-dot" />
                    <div className="running-copy">
                      <b>{shortModelName(model.fullTag)}</b>
                      <span>
                        {c.telemetry.residentMeta(model.quantization, model.context)}
                        {model.lastUsed && model.lastUsed !== '—' ? ` · ${model.lastUsed}` : ''}
                      </span>
                    </div>
                    <span className="running-size">
                      {model.sizeVramBytes ? `${bytesToGb(model.sizeVramBytes)} GB` : model.size}
                    </span>
                    <button
                      type="button"
                      className="iconbtn small"
                      disabled={unloading !== null}
                      onClick={() => void handleUnload(model)}
                      aria-label={c.telemetry.unloadOne}
                      title={c.telemetry.unloadOne}
                    >
                      <Icon
                        name={unloading === model.id ? 'progress_activity' : 'eject'}
                        size={16}
                      />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="running-foot">
              <span>
                {c.telemetry.totalUsed(
                  formatBytes(loadedVramBytes),
                  memoryTotal > 0 ? Math.round(vramPercent) : undefined
                )}
              </span>
            </div>
          </section>

          <section className="panel settings-panel" id="telemetry-settings">
            <div className="panel-head">
              <h3>{c.telemetry.settings}</h3>
              <span className={`tag ${settingsCount > 0 ? 'tag-apricot' : 'tag-mist'}`}>
                {c.telemetry.settingsChanged(settingsCount)}
              </span>
            </div>
            <SwitchRow
              label={c.telemetry.autoUnload}
              description={c.telemetry.autoUnloadDesc}
              checked={preferences.defaultKeepAlive !== -1}
              onChange={(checked) => setPreference('defaultKeepAlive', checked ? '5m' : -1)}
            />
            <div className="settings-row">
              <div className="settings-copy">
                <b>{c.telemetry.defaultCtx}</b>
                <p>{c.telemetry.defaultCtxDesc}</p>
              </div>
              <select
                className="select compact"
                value={String(preferences.defaultNumCtx)}
                onChange={(event) => setPreference('defaultNumCtx', Number(event.target.value))}
                aria-label={c.telemetry.defaultCtx}
              >
                {!CONTEXT_OPTIONS.includes(preferences.defaultNumCtx) && (
                  <option value={preferences.defaultNumCtx}>{preferences.defaultNumCtx}</option>
                )}
                {CONTEXT_OPTIONS.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>
            <SwitchRow
              label={c.telemetry.reduceMotion}
              description={c.telemetry.reduceMotionDesc}
              checked={preferences.reduceMotion}
              onChange={(checked) => setPreference('reduceMotion', checked)}
            />
            <SwitchRow
              label={c.telemetry.showThinking}
              description={c.telemetry.showThinkingDesc}
              checked={preferences.showThinking}
              onChange={(checked) => setPreference('showThinking', checked)}
            />
            <div className="settings-segment">
              <div className="settings-copy">
                <b>{c.telemetry.themeMode}</b>
                <div className="segmented small">
                  {(['light', 'dark', 'system'] as ThemeMode[]).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      className={themeMode === mode ? 'is-active' : ''}
                      onClick={() => setThemeMode(mode)}
                    >
                      {c.theme[mode]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="settings-segment">
              <div className="settings-copy">
                <b>{c.telemetry.language}</b>
                <div className="segmented small">
                  <button
                    type="button"
                    className={language === 'zh' ? 'is-active' : ''}
                    onClick={() => setLanguage('zh')}
                  >
                    {c.theme.chinese}
                  </button>
                  <button
                    type="button"
                    className={language === 'en' ? 'is-active' : ''}
                    onClick={() => setLanguage('en')}
                  >
                    {c.theme.english}
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>

      <section className="panel env-panel" id="telemetry-env">
        <div className="panel-head">
          <div>
            <h3>{c.telemetry.envTitle}</h3>
            <p>{c.telemetry.envDesc}</p>
          </div>
          <div className="panel-head-actions">
            <span className="tag tag-mist">{c.telemetry.envLocalOnly}</span>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setCustomEnv((current) => [...current, { key: '', value: '' }])}
            >
              <Icon name="add" size={15} />
              {c.telemetry.addVar}
            </button>
            <button type="button" className="btn btn-sage btn-sm" onClick={handleSaveEnv}>
              <Icon name="save" size={15} />
              {c.telemetry.envSave}
            </button>
          </div>
        </div>
        <div className="env-grid">
          <label className="env-field">
            <span>
              <code>{c.telemetry.host}</code>
            </span>
            <input
              value={config.host}
              onChange={(event) => setConfig({ ...config, host: event.target.value })}
              spellCheck={false}
            />
          </label>
          <label className="env-field">
            <span>
              <code>{c.telemetry.modelsPath}</code>
            </span>
            <input
              value={config.modelsPath}
              onChange={(event) => setConfig({ ...config, modelsPath: event.target.value })}
              spellCheck={false}
            />
          </label>
          <label className="env-field">
            <span>
              <code>{c.telemetry.numParallel}</code>
            </span>
            <input
              type="number"
              min={1}
              max={16}
              value={config.numParallel}
              onChange={(event) =>
                setConfig({
                  ...config,
                  numParallel: clamp(Number(event.target.value) || 1, 1, 16)
                })
              }
            />
          </label>
          <label className="env-field">
            <span>
              <code>{c.telemetry.keepAlive}</code>
            </span>
            <select
              value={config.keepAlive}
              onChange={(event) =>
                setConfig({ ...config, keepAlive: event.target.value as DaemonConfig['keepAlive'] })
              }
            >
              {KEEP_ALIVE_VALUES.map((value) => (
                <option key={value} value={value}>
                  {value === 'forever' ? '-1' : value}
                </option>
              ))}
            </select>
          </label>
          <div className="env-field env-toggle">
            <span>
              <code>{c.telemetry.flashAttention}</code>
            </span>
            <button
              type="button"
              className={`switch ${config.flashAttention ? 'is-on' : ''}`}
              role="switch"
              aria-checked={config.flashAttention}
              onClick={() => setConfig({ ...config, flashAttention: !config.flashAttention })}
              aria-label={c.telemetry.flashAttention}
            >
              <i />
            </button>
            <b>{config.flashAttention ? '1' : '0'}</b>
          </div>
          {customEnv.map((item, index) => {
            const invalid = item.key.length > 0 && !/^[A-Z_][A-Z0-9_]*$/.test(item.key);
            return (
              <div key={index} className={`env-field env-custom ${invalid ? 'is-invalid' : ''}`}>
                <span>
                  <input
                    className="env-key"
                    value={item.key}
                    placeholder="VARIABLE_NAME"
                    onChange={(event) => updateCustomEnv(index, { key: event.target.value })}
                    spellCheck={false}
                    aria-label={c.telemetry.key}
                  />
                  <button
                    type="button"
                    className="inline-icon"
                    onClick={() => setCustomEnv((current) => current.filter((_, i) => i !== index))}
                    aria-label={c.telemetry.removeVar}
                    title={c.telemetry.removeVar}
                  >
                    <Icon name="close" size={14} />
                  </button>
                </span>
                <input
                  value={item.value}
                  placeholder={c.telemetry.value}
                  onChange={(event) => updateCustomEnv(index, { value: event.target.value })}
                  spellCheck={false}
                  aria-label={c.telemetry.value}
                />
                {invalid && <small>{c.telemetry.invalidVar}</small>}
              </div>
            );
          })}
        </div>
        <div className="env-command">
          <div className="env-command-head">
            <span>
              <Icon name="terminal" size={16} />
              {c.telemetry.generateCommand}
            </span>
            <button
              type="button"
              className="text-button"
              onClick={() => void copyText(command, c.toast.copied)}
            >
              <Icon name="content_copy" size={14} />
              {c.telemetry.copyCommand}
            </button>
          </div>
          <code>{command}</code>
          <p>{c.telemetry.envCommandHint}</p>
        </div>
        <p className="env-note">
          <Icon name="info" size={14} />
          {c.telemetry.envNote}
        </p>
      </section>

      <section className="panel cache-panel">
        <div className="panel-head">
          <div>
            <h3>{c.telemetry.cacheTitle}</h3>
            <p>{c.telemetry.cacheDesc}</p>
          </div>
          <div className="panel-head-actions">
            {cacheReport && (
              <span className="muted">
                {c.telemetry.scan} · {formatClock(cacheReport.scannedAt)}
              </span>
            )}
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => void refreshCache()}
              disabled={cacheLoading}
            >
              <Icon name={cacheLoading ? 'progress_activity' : 'refresh'} size={15} />
              {cacheLoading ? c.telemetry.scanning : c.telemetry.scan}
            </button>
          </div>
        </div>

        {cacheError && <div className="inline-error">{cacheError}</div>}

        {!cacheReport && cacheLoading ? (
          <div className="cache-loading">
            <Icon name="progress_activity" size={18} />
            {c.telemetry.scanning}
          </div>
        ) : cacheReport ? (
          <>
            <div className="cache-summary">
              <div className="cache-figure">
                <span>{c.telemetry.reclaimable}</span>
                <b>{formatBytes(cacheReport.reclaimableBytes)}</b>
              </div>
              <div className={`cache-health ${scanComplete ? 'is-ok' : 'is-warn'}`}>
                <Icon name={scanComplete ? 'verified' : 'warning'} size={16} />
                {scanComplete
                  ? `${cacheReport.manifestFiles} manifests`
                  : c.telemetry.cacheLockedOrphan}
              </div>
              {activeDownloads && (
                <div className="cache-health is-warn">
                  <Icon name="downloading" size={16} />
                  {c.telemetry.cacheLockedDownloads}
                </div>
              )}
            </div>

            <div className="cache-categories">
              {categories.map((category) => {
                const checked = cleanupTargets[category.key] && !category.locked;
                const expanded = expandedCategory === category.key;
                return (
                  <div
                    key={category.key}
                    className={`cache-category ${checked ? 'is-selected' : ''} ${
                      category.locked ? 'is-locked' : ''
                    }`}
                  >
                    <div className="cache-category-row">
                      <button
                        type="button"
                        className="cache-check"
                        disabled={category.locked}
                        aria-pressed={checked}
                        onClick={() =>
                          setCleanupTargets((current) => ({
                            ...current,
                            [category.key]: !current[category.key]
                          }))
                        }
                      >
                        <Icon
                          name={
                            category.locked
                              ? 'lock'
                              : checked
                                ? 'check_box'
                                : 'check_box_outline_blank'
                          }
                          size={19}
                        />
                        <span className="cache-category-icon">
                          <Icon name={category.icon} size={17} />
                        </span>
                        <span className="cache-category-copy">
                          <b>{category.label}</b>
                          <small>
                            {category.locked
                              ? category.lockReason
                              : category.key === 'temp'
                                ? c.telemetry.dirs(category.files)
                                : c.telemetry.files(category.files)}
                          </small>
                        </span>
                        <span className="cache-bytes">{formatBytes(category.bytes)}</span>
                      </button>
                      <button
                        type="button"
                        className="iconbtn small"
                        onClick={() => setExpandedCategory(expanded ? null : category.key)}
                        aria-expanded={expanded}
                        aria-label={c.common.details}
                      >
                        <Icon name={expanded ? 'expand_less' : 'expand_more'} size={17} />
                      </button>
                    </div>
                    {expanded && (
                      <div className="cache-items">
                        {category.items.length === 0 ? (
                          <p className="cache-item-empty">{c.telemetry.cacheEmpty}</p>
                        ) : (
                          <ul>
                            {category.items.slice(0, 20).map((item) => (
                              <li key={item.path}>
                                <span className="cache-kind">
                                  {cacheItemKind(item.kind, language)}
                                </span>
                                <div className="cache-item-copy">
                                  <b title={item.path}>{item.name}</b>
                                  <small>
                                    {formatRelative(item.modifiedAt, language)}
                                    {item.entries != null
                                      ? ` · ${c.telemetry.files(item.entries)}`
                                      : ''}
                                    {' · '}
                                    {item.path}
                                  </small>
                                </div>
                                <span>{formatBytes(item.bytes)}</span>
                                <button
                                  type="button"
                                  className="inline-icon"
                                  disabled={revealBusy !== null}
                                  onClick={() => void handleReveal(item.path)}
                                  aria-label={c.telemetry.reveal}
                                  title={c.telemetry.reveal}
                                >
                                  <Icon name="folder_open" size={14} />
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

            {cacheReport.reclaimableBytes === 0 && (
              <p className="cache-empty">{c.telemetry.cacheEmpty}</p>
            )}

            {lastCleanup?.quarantinePath && lastCleanup.quarantinedBytes > 0 && (
              <div className="quarantine-note">
                <Icon name="inventory_2" size={16} />
                <div>
                  <p>
                    {c.telemetry.cleanupDone(
                      formatBytes(0),
                      formatBytes(lastCleanup.quarantinedBytes)
                    )}
                  </p>
                  <code>{lastCleanup.quarantinePath}</code>
                </div>
                <button
                  type="button"
                  className="inline-icon"
                  disabled={revealBusy !== null}
                  onClick={() => void handleReveal(lastCleanup.quarantinePath!)}
                  aria-label={c.telemetry.reveal}
                  title={c.telemetry.reveal}
                >
                  <Icon name="folder_open" size={15} />
                </button>
              </div>
            )}

            <div className="cache-cleanup-foot">
              <span>
                {c.telemetry.cleanup} · <b>{formatBytes(selectedBytes)}</b>
                {selectedQuarantineBytes > 0 && (
                  <small>
                    {' '}
                    (
                    {language === 'zh'
                      ? `其中 ${formatBytes(selectedQuarantineBytes)} 移入回收站`
                      : `${formatBytes(selectedQuarantineBytes)} quarantined`}
                    )
                  </small>
                )}
              </span>
              <button
                type="button"
                className="btn btn-danger btn-sm"
                disabled={
                  cacheLoading || cleanupBusy || selectedTargets.length === 0 || selectedBytes === 0
                }
                onClick={openCleanup}
              >
                <Icon name="delete_sweep" size={16} />
                {c.telemetry.cleanup}
              </button>
            </div>
          </>
        ) : (
          <div className="cache-loading">
            <Icon name="error" size={18} />
            {c.telemetry.scanFailed}
            <button type="button" className="text-button" onClick={() => void refreshCache()}>
              {c.common.retry}
            </button>
          </div>
        )}
      </section>

      <ConfirmDialog
        open={confirmDaemon !== null}
        title={confirmTitle}
        description={confirmDesc}
        confirmLabel={daemonActionLabel}
        cancelLabel={c.common.cancel}
        danger
        busy={daemon.busy !== null}
        onConfirm={() => {
          const action = confirmDaemon;
          setConfirmDaemon(null);
          if (action) void handleDaemonControl(action);
        }}
        onCancel={() => setConfirmDaemon(null)}
      />

      <ConfirmDialog
        open={unloadOpen}
        title={c.telemetry.unloadAllTitle}
        description={c.telemetry.unloadAllDesc}
        confirmLabel={c.telemetry.unloadAll}
        cancelLabel={c.common.cancel}
        danger
        busy={unloading !== null}
        onConfirm={() => void handleUnloadAll()}
        onCancel={() => setUnloadOpen(false)}
      />

      <ConfirmDialog
        open={cleanupOpen}
        title={c.telemetry.cleanupTitle(formatBytes(selectedBytes))}
        description={c.telemetry.cleanupDesc}
        confirmLabel={cleanupBusy ? c.telemetry.scanning : c.telemetry.cleanup}
        cancelLabel={c.common.cancel}
        danger
        busy={cleanupBusy}
        onConfirm={() => void handleCleanup()}
        onCancel={() => setCleanupOpen(false)}
      />
    </div>
  );
}

function daemonActionLabelFor(
  action: 'start' | 'restart' | 'stop',
  c: ReturnType<typeof useTheme>['c']
): string {
  return action === 'start'
    ? c.telemetry.start
    : action === 'restart'
      ? c.telemetry.restart
      : c.telemetry.stop;
}
