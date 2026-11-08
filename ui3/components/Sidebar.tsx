import { useTheme } from '../context/ThemeContext';
import { SCREEN_ICON } from '../navigation';
import type { Screen } from '../navigation';
import { bytesToGb, formatPercent, shortModelName } from '../lib/format';
import type { DownloadRecord } from '../hooks/useDownloads';
import type { OllamaStatus } from '../hooks/useOllamaData';
import { BrandMark, Icon } from './Icon';

export interface SidebarProps {
  screen: Screen;
  onNavigate: (screen: Screen) => void;
  modelCount: number;
  runningCount: number;
  loadedVramBytes: number;
  memoryTotalBytes: number;
  gpuName?: string;
  status: OllamaStatus;
  version: string | null;
  records: DownloadRecord[];
  onTelemetryAnchor?: (anchor: 'env' | 'settings') => void;
}

export function Sidebar({
  screen,
  onNavigate,
  modelCount,
  runningCount,
  loadedVramBytes,
  memoryTotalBytes,
  gpuName,
  status,
  version,
  records,
  onTelemetryAnchor
}: SidebarProps) {
  const { c } = useTheme();

  const queue = records
    .filter((record) => record.status === 'running' || record.status === 'paused')
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === 'running' ? -1 : 1;
      return b.updatedAt - a.updatedAt;
    })
    .slice(0, 2);

  const activeDownloads = records.filter(
    (record) => record.status === 'running' || record.status === 'paused'
  ).length;

  const percent = memoryTotalBytes > 0 ? (loadedVramBytes / memoryTotalBytes) * 100 : 0;
  const navItems: Array<{ screen: Screen; label: string; count?: number }> = [
    { screen: 'chat', label: c.nav.chat },
    { screen: 'models', label: c.nav.models, count: modelCount },
    { screen: 'pull', label: c.nav.pull, count: activeDownloads },
    { screen: 'modelfile', label: c.nav.lab },
    { screen: 'telemetry', label: c.nav.telemetry }
  ];

  return (
    <aside className="sidebar">
      <div className="brand">
        <BrandMark />
        <div className="brand-text">
          <h1>
            Ollama <span>Studio</span>
          </h1>
          <small>{c.app.tagline}</small>
        </div>
      </div>

      <div className="nav-label">{c.app.workbench}</div>
      <nav className="nav" aria-label={c.app.workbench}>
        {navItems.map((item) => (
          <button
            key={item.screen}
            type="button"
            className={`nav-link ${screen === item.screen ? 'is-active' : ''}`}
            onClick={() => onNavigate(item.screen)}
            aria-current={screen === item.screen ? 'page' : undefined}
          >
            <Icon name={SCREEN_ICON[item.screen]} size={20} filled={screen === item.screen} />
            <span>{item.label}</span>
            {typeof item.count === 'number' && item.count > 0 && (
              <span className="nav-badge">{item.count}</span>
            )}
          </button>
        ))}
      </nav>

      {screen === 'telemetry' && onTelemetryAnchor && (
        <div className="sidebar-quick">
          <div className="nav-label">{c.sidebar.shortcuts}</div>
          <button type="button" className="quick-link" onClick={() => onTelemetryAnchor('env')}>
            <Icon name="terminal" size={18} />
            <span>{c.sidebar.env}</span>
          </button>
          <button
            type="button"
            className="quick-link"
            onClick={() => onTelemetryAnchor('settings')}
          >
            <Icon name="settings" size={18} />
            <span>{c.sidebar.settings}</span>
          </button>
        </div>
      )}

      {queue.length > 0 && (
        <div className="sidebar-queue">
          <div className="nav-label">{c.sidebar.downloads}</div>
          {queue.map((record) => {
            const value =
              record.status === 'paused'
                ? 100
                : record.total > 0
                  ? (record.completed / record.total) * 100
                  : 0;
            return (
              <button
                key={record.id}
                type="button"
                className="queue-item"
                onClick={() => onNavigate('pull')}
                title={c.sidebar.openTask}
              >
                <Icon name="schedule" size={16} />
                <span className="queue-name">{shortModelName(record.model)}</span>
                <span className={`queue-percent ${record.status === 'paused' ? 'is-paused' : ''}`}>
                  {record.status === 'paused' ? c.status.paused : formatPercent(value)}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <button
        type="button"
        className="vram-card"
        onClick={() => onNavigate('telemetry')}
        title={`${c.sidebar.vram} · ${status === 'online' ? (version ?? '') : c.topbar.daemonOffline}`}
      >
        <span className="vram-head">
          <span>{c.sidebar.vram}</span>
          <Icon name="memory" size={17} />
        </span>
        <span className="vram-value">
          {loadedVramBytes > 0 ? bytesToGb(loadedVramBytes) : '0.0'}
          {memoryTotalBytes > 0 && <small> / {bytesToGb(memoryTotalBytes)} GB</small>}
          {memoryTotalBytes <= 0 && <small> GB</small>}
        </span>
        <span className="vram-bar">
          <i style={{ width: `${Math.max(2, Math.min(100, percent))}%` }} />
        </span>
        <span className="vram-meta">
          <b>{c.sidebar.resident(runningCount)}</b>
          <span>
            {status === 'online'
              ? `GPU · ${gpuName?.replace(/^Apple\s+/i, '') || c.sidebar.unified}`
              : c.topbar.daemonOffline}
          </span>
        </span>
      </button>

      <div className="sidebar-foot">
        <span className={`status-dot status-${status}`} />
        <span>
          {status === 'online'
            ? `${c.telemetry.online}${version ? ` · v${version}` : ''}`
            : status === 'offline'
              ? c.telemetry.offline
              : c.topbar.daemonConnecting}
        </span>
      </div>
    </aside>
  );
}
