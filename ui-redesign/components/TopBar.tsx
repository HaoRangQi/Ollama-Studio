import type { Copy, Lang } from '../copy';
import type { ConnectionState } from '../hooks/useOllamaData';
import type { Mode } from '../context/console';
import { hashForScreen, SCREEN_IDS, type ScreenId } from '../navigation';
import { Icon } from './Icon';

interface TopBarProps {
  screen: ScreenId;
  t: Copy;
  lang: Lang;
  mode: Mode;
  status: ConnectionState;
  version: string | null;
  modelCount: number;
  runningCount: number;
  ready: boolean;
  refreshing: boolean;
  onToggleLang: () => void;
  onToggleMode: () => void;
  onRefresh: () => void;
}

export function TopBar({
  screen,
  t,
  lang,
  mode,
  status,
  version,
  modelCount,
  runningCount,
  ready,
  refreshing,
  onToggleLang,
  onToggleMode,
  onRefresh
}: TopBarProps) {
  const statusText =
    status === 'online'
      ? t.common.online
      : status === 'offline'
        ? t.common.offline
        : t.common.connecting;
  const statusClass =
    status === 'online'
      ? 'status status--ok'
      : status === 'offline'
        ? 'status status--bad'
        : 'status';
  const versionLabel = version ? (version.startsWith('v') ? version : `v${version}`) : null;
  const navLabels: Record<ScreenId, string> = {
    runtime: t.nav.runtime,
    models: t.nav.models,
    pull: t.nav.pull,
    chat: t.nav.chat,
    modelfile: t.nav.modelfile
  };

  return (
    <header className="topbar">
      <div className="container">
        <div className="topbar__row">
          <div className="topbar__brand">
            <a className="brand__name" href="#runtime">
              {t.app.name}
            </a>
            <span className="brand__meta">{t.app.descriptor}</span>
          </div>

          <div className="topbar__status">
            <span className={statusClass}>{statusText}</span>
            {versionLabel ? (
              <span className="status status--version">
                <span className="muted">{t.common.version}</span>
                <span className="status__value">{versionLabel}</span>
              </span>
            ) : null}
            <span className="status status--wide">
              <span className="muted">{t.common.models}</span>
              <span className="status__value">{ready ? modelCount : '—'}</span>
            </span>
            <span className="status">
              <span className="muted">{t.common.running}</span>
              <span className="status__value">{ready ? runningCount : '—'}</span>
            </span>

            <button
              type="button"
              className="btn btn--quiet btn--icon"
              aria-label={mode === 'dark' ? t.app.themeToLight : t.app.themeToDark}
              title={mode === 'dark' ? t.app.themeToLight : t.app.themeToDark}
              onClick={onToggleMode}
            >
              <Icon name={mode === 'dark' ? 'light_mode' : 'dark_mode'} />
            </button>
            <button
              type="button"
              className="btn btn--quiet"
              aria-label={t.app.language}
              title={t.app.language}
              onClick={onToggleLang}
            >
              {lang === 'zh' ? t.app.switchToEnglish : t.app.switchToChinese}
            </button>
            <button
              type="button"
              className="btn btn--quiet btn--icon"
              aria-label={t.app.refresh}
              title={t.app.refresh}
              onClick={onRefresh}
              disabled={refreshing}
            >
              <Icon name="refresh" />
            </button>
            <a className="btn btn--quiet classic-link" href="/" title={t.app.classicTitle}>
              {t.app.classic}
            </a>
          </div>
        </div>

        <nav className="tabs" aria-label={t.nav.label}>
          {SCREEN_IDS.map((id) => (
            <a
              key={id}
              className="tab"
              href={hashForScreen(id)}
              aria-current={screen === id ? 'page' : undefined}
            >
              {navLabels[id]}
            </a>
          ))}
        </nav>
      </div>
    </header>
  );
}
