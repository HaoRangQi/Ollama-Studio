import { useRef, useState } from 'react';
import { useTheme } from '../context/ThemeContext';
import { useDismissable } from '../hooks/useDismissable';
import type { OllamaStatus } from '../hooks/useOllamaData';
import type { Screen } from '../navigation';
import { Icon } from './Icon';

export interface TopBarProps {
  screen: Screen;
  status: OllamaStatus;
  version: string | null;
  hasAlert: boolean;
  onOpenPalette: () => void;
  onOpenThemeModal: () => void;
  onOpenTelemetry: () => void;
}

export function TopBar({
  screen,
  status,
  version,
  hasAlert,
  onOpenPalette,
  onOpenThemeModal,
  onOpenTelemetry
}: TopBarProps) {
  const { c, language, resolvedMode, toggleTheme, toggleLanguage } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  useDismissable(menuRef, () => setMenuOpen(false), menuOpen);

  const screenLabel =
    screen === 'modelfile'
      ? c.nav.lab
      : screen === 'chat'
        ? c.nav.chat
        : screen === 'models'
          ? c.nav.models
          : screen === 'pull'
            ? c.nav.pull
            : c.nav.telemetry;

  const searchLabel = screen === 'models' ? c.topbar.searchModels : c.topbar.search;
  const daemonLabel =
    status === 'online'
      ? c.topbar.daemonRunning
      : status === 'offline'
        ? c.topbar.daemonOffline
        : c.topbar.daemonConnecting;

  return (
    <header className="topbar">
      <div className="crumb" aria-label={`${c.app.workbench} / ${screenLabel}`}>
        <span>{c.app.workbench}</span>
        <Icon name="chevron_right" size={15} />
        <b>{screenLabel}</b>
      </div>

      <button type="button" className="search-trigger" onClick={onOpenPalette}>
        <Icon name="search" size={18} />
        <span className="search-text">{searchLabel}</span>
        <kbd className="kbd">⌘K</kbd>
      </button>

      <button
        type="button"
        className={`daemon-pill status-${status}`}
        onClick={onOpenTelemetry}
        title={version ? `Ollama v${version}` : daemonLabel}
      >
        <span className="daemon-dot" />
        <span className="daemon-text">{daemonLabel}</span>
      </button>

      <div className="topbar-actions">
        <button
          type="button"
          className="iconbtn"
          onClick={toggleTheme}
          aria-label={c.topbar.theme}
          title={c.topbar.theme}
        >
          <Icon name={resolvedMode === 'dark' ? 'light_mode' : 'dark_mode'} size={20} />
        </button>
        <button
          type="button"
          className="iconbtn"
          onClick={onOpenTelemetry}
          aria-label={c.topbar.notifications}
          title={c.topbar.notifications}
        >
          <Icon name="notifications" size={20} />
          {hasAlert && <span className="icon-dot" />}
        </button>

        <div className="account" ref={menuRef}>
          <button
            type="button"
            className="avatar-btn"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label={c.topbar.account}
            aria-expanded={menuOpen}
          >
            A
          </button>
          {menuOpen && (
            <div className="popover account-popover" role="menu">
              <div className="popover-head">
                <strong>{c.app.name}</strong>
                <span>{version ? `v${version}` : c.app.tagline}</span>
              </div>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  onOpenThemeModal();
                }}
              >
                <Icon name="palette" size={18} />
                <span>{c.topbar.themePalette}</span>
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  toggleLanguage();
                }}
              >
                <Icon name="translate" size={18} />
                <span>
                  {c.topbar.language} · {language === 'zh' ? c.theme.chinese : c.theme.english}
                </span>
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  onOpenTelemetry();
                }}
              >
                <Icon name="monitoring" size={18} />
                <span>{c.topbar.telemetry}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
