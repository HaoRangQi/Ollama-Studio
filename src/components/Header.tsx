import React, { useRef, useState } from 'react';
import { useAppTheme } from '../context/ThemeContext';
import { useDismissable } from '../hooks/useDismissable';
import { OllamaStatus } from '../hooks/useOllama';

interface HeaderProps {
  onOpenCommandPalette: () => void;
  onOpenSettings: () => void;
  onOpenPullModal: () => void;
  onOpenPaletteModal: () => void;
  ollamaStatus: OllamaStatus;
  ollamaVersion: string | null;
  runningCount: number;
  modelCount: number;
  onRefreshOllama: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenCommandPalette,
  onOpenSettings,
  onOpenPullModal,
  onOpenPaletteModal,
  ollamaStatus,
  ollamaVersion,
  runningCount,
  modelCount,
  onRefreshOllama
}) => {
  const { themeMode, toggleTheme, language, toggleLanguage, t, currentPaletteConfig } =
    useAppTheme();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  useDismissable(notificationsRef, showNotifications, () => setShowNotifications(false));
  useDismissable(profileRef, showProfile, () => setShowProfile(false));
  const online = ollamaStatus === 'online';
  const connecting = ollamaStatus === 'connecting';
  const statusColor = online ? '#27c93f' : connecting ? '#ffbd2e' : '#ff453a';
  const statusLabel = online
    ? `v${ollamaVersion ?? '?'}`
    : connecting
      ? language === 'zh'
        ? '连接中'
        : 'Connecting'
      : language === 'zh'
        ? '未连接'
        : 'Offline';

  return (
    <header className="fixed top-0 left-0 lg:left-64 right-0 h-16 bg-[var(--app-bg)]/85 backdrop-blur-xl z-40 flex items-center justify-between px-3 sm:px-6 border-b border-[var(--app-border)] shadow-[0_1px_8px_rgba(0,0,0,0.06)] select-none transition-colors">
      {/* Search Input Bar with Command Palette Trigger */}
      <div className="flex items-center gap-4 flex-1">
        <div
          onClick={onOpenCommandPalette}
          className="relative flex items-center w-full max-w-xs sm:w-80 bg-[var(--app-surface-high)] hover:bg-[var(--app-surface-highest)] rounded-full px-4 py-1.5 transition-all cursor-pointer border border-[var(--app-border)] group"
        >
          <span
            className="material-symbols-outlined text-[var(--app-text-muted)] text-[18px] mr-2 transition-colors"
            style={{ color: 'var(--primary-accent)' }}
          >
            search
          </span>
          <span className="text-[var(--app-text-muted)] text-[12px] flex-1 truncate">
            {t.header.searchPlaceholder}
          </span>
          <kbd className="bg-[var(--app-surface-highest)] text-[var(--app-text-muted)] font-code text-[10px] px-1.5 py-0.5 rounded-full ml-1 border border-[var(--app-border)]">
            ⌘K
          </kbd>
        </div>

        {/* Daemon Connection Pill */}
        <div className="hidden lg:flex items-center gap-2 bg-[var(--app-surface)] border border-[var(--app-border)] px-4 py-1.5 rounded-full">
          <span className="relative flex h-2 w-2">
            {online && (
              <span
                className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                style={{ backgroundColor: statusColor }}
              />
            )}
            <span
              className="relative inline-flex rounded-full h-2 w-2"
              style={{ backgroundColor: statusColor }}
            />
          </span>
          <span className="text-[11px] text-[var(--app-text-muted)] font-medium">
            {t.header.daemon}
          </span>
          <span
            className="font-code text-[12px] font-semibold"
            style={{ color: online ? 'var(--primary-accent)' : statusColor }}
            title="Ollama /ollama"
          >
            {statusLabel}
          </span>
          <button
            onClick={onRefreshOllama}
            className="ml-0.5 w-6 h-6 rounded-full flex items-center justify-center text-[var(--app-text-muted)] hover:text-[var(--app-text)] hover:bg-[var(--app-surface-high)] transition-colors cursor-pointer"
            title={language === 'zh' ? '刷新 Ollama 状态' : 'Refresh Ollama status'}
          >
            <span
              className={`material-symbols-outlined text-[15px] ${
                connecting ? 'animate-spin' : ''
              }`}
            >
              refresh
            </span>
          </button>
        </div>
      </div>

      {/* Right Toolbar */}
      <div className="flex items-center gap-2 relative">
        {/* Live running models chip */}
        <div className="flex items-center gap-1.5 bg-[var(--app-surface)] border border-[var(--app-border)] px-3.5 py-1 rounded-full shadow-sm">
          <span
            className={`material-symbols-outlined text-[16px] ${online ? 'animate-pulse' : ''}`}
            style={{ color: online ? 'var(--primary-accent)' : statusColor }}
          >
            memory
          </span>
          <span className="text-[11px] font-code font-bold tracking-tight text-[var(--app-text)]">
            {online
              ? language === 'zh'
                ? `${runningCount} 个模型运行中`
                : `${runningCount} running`
              : connecting
                ? language === 'zh'
                  ? '读取状态…'
                  : 'Reading…'
                : language === 'zh'
                  ? '演示数据'
                  : 'Demo data'}
          </span>
        </div>

        {/* Quick Pull Model Pill */}
        <button
          onClick={onOpenPullModal}
          className="hidden sm:flex items-center gap-1 px-3 py-1 rounded-full bg-[var(--app-surface-high)] hover:bg-[var(--app-surface-highest)] text-[11px] font-medium border border-[var(--app-border)] transition-all cursor-pointer text-[var(--app-text)]"
        >
          <span
            className="material-symbols-outlined text-[16px]"
            style={{ color: 'var(--primary-accent)' }}
          >
            cloud_download
          </span>
          <span>{t.header.pullModelBtn}</span>
        </button>

        {/* Language Quick Toggle */}
        <button
          onClick={toggleLanguage}
          className="px-2.5 py-1 rounded-full bg-[var(--app-surface-high)] hover:bg-[var(--app-surface-highest)] text-[11px] font-bold border border-[var(--app-border)] transition-all cursor-pointer text-[var(--app-text)]"
          title={language === 'zh' ? 'Switch to English' : '切换为中文'}
        >
          {language === 'zh' ? '中 / EN' : 'EN / 中'}
        </button>

        {/* Dark / Light Mode Toggle */}
        <button
          onClick={toggleTheme}
          className="w-8 h-8 rounded-full bg-[var(--app-surface-high)] hover:bg-[var(--app-surface-highest)] flex items-center justify-center text-[var(--app-text-muted)] hover:text-[var(--app-text)] transition-colors cursor-pointer border border-[var(--app-border)]"
          title={themeMode === 'dark' ? t.header.themeLight : t.header.themeDark}
        >
          <span className="material-symbols-outlined text-[18px]">
            {themeMode === 'dark' ? 'light_mode' : 'dark_mode'}
          </span>
        </button>

        {/* Palette Color Picker Trigger */}
        <button
          onClick={onOpenPaletteModal}
          className="w-8 h-8 rounded-full bg-[var(--app-surface-high)] hover:bg-[var(--app-surface-highest)] flex items-center justify-center transition-colors cursor-pointer border border-[var(--app-border)] relative"
          title={t.header.palette}
        >
          <span className="material-symbols-outlined text-[18px] text-[var(--app-text-muted)]">
            palette
          </span>
          <span
            className="absolute bottom-1 right-1 w-2.5 h-2.5 rounded-full border border-white shadow-sm"
            style={{ backgroundColor: currentPaletteConfig.primary }}
          />
        </button>

        {/* Notification Icon */}
        <div className="relative" ref={notificationsRef}>
          <button
            onClick={() => {
              setShowNotifications(!showNotifications);
              setShowProfile(false);
            }}
            className="w-8 h-8 rounded-full bg-[var(--app-surface-high)] hover:bg-[var(--app-surface-highest)] flex items-center justify-center text-[var(--app-text-muted)] hover:text-[var(--app-text)] transition-colors relative cursor-pointer border border-[var(--app-border)]"
            title={language === 'zh' ? '通知中心' : 'Notifications'}
          >
            <span className="material-symbols-outlined text-[18px]">notifications</span>
            {!online && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#ffafd3]" />
            )}
          </button>

          {showNotifications && (
            <div className="absolute right-0 top-11 w-80 bg-[var(--app-surface-high)] border border-[var(--app-border)] text-[var(--app-text)] rounded-2xl shadow-2xl p-3 z-50 animate-in fade-in zoom-in-95 duration-100">
              <div className="flex items-center justify-between pb-2 border-b border-[var(--app-border)] px-1">
                <span className="text-[12px] font-semibold text-[var(--app-text)]">
                  {t.header.notificationsTitle}
                </span>
                <span className="text-[10px] text-[#ffafd3] bg-[#ba4385]/20 px-2 py-0.5 rounded-full font-bold">
                  {online ? 'LIVE' : 'DEMO'}
                </span>
              </div>
              <div className="flex flex-col gap-2 mt-2">
                <div className="p-2.5 rounded-xl bg-[var(--app-surface)] border border-[var(--app-border)] flex gap-2.5 items-start">
                  <span
                    className="material-symbols-outlined text-[18px] shrink-0 mt-0.5"
                    style={{ color: online ? '#27c93f' : statusColor }}
                  >
                    {online ? 'check_circle' : 'cloud_off'}
                  </span>
                  <div className="flex flex-col text-[11px]">
                    <span className="font-semibold text-[var(--app-text)]">
                      {online
                        ? language === 'zh'
                          ? 'Ollama 已连接'
                          : 'Ollama connected'
                        : language === 'zh'
                          ? 'Ollama 未连接'
                          : 'Ollama offline'}
                    </span>
                    <span className="text-[var(--app-text-muted)] mt-0.5">
                      {online
                        ? language === 'zh'
                          ? `v${ollamaVersion ?? '?'} · ${runningCount} 个模型运行中`
                          : `v${ollamaVersion ?? '?'} · ${runningCount} running`
                        : language === 'zh'
                          ? '当前显示演示数据，请启动 Ollama 后重试'
                          : 'Showing demo data. Start Ollama and retry.'}
                    </span>
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-[var(--app-surface)] border border-[var(--app-border)] flex gap-2.5 items-start">
                  <span
                    className="material-symbols-outlined text-[18px] shrink-0 mt-0.5"
                    style={{ color: 'var(--primary-accent)' }}
                  >
                    deployed_code
                  </span>
                  <div className="flex flex-col text-[11px]">
                    <span className="font-semibold text-[var(--app-text)]">
                      {language === 'zh' ? '本地模型库' : 'Local model library'}
                    </span>
                    <span className="text-[var(--app-text-muted)] mt-0.5">
                      {language === 'zh'
                        ? `${modelCount} 个模型 · ${runningCount} 个运行中`
                        : `${modelCount} models · ${runningCount} running`}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Tune Button (Preferences) */}
        <button
          onClick={onOpenSettings}
          className="w-8 h-8 rounded-full bg-[var(--app-surface-high)] hover:bg-[var(--app-surface-highest)] flex items-center justify-center text-[var(--app-text-muted)] hover:text-[var(--app-text)] transition-colors cursor-pointer border border-[var(--app-border)]"
          title={language === 'zh' ? '系统与推理设置' : 'System and inference settings'}
        >
          <span className="material-symbols-outlined text-[18px]">tune</span>
        </button>

        {/* User Profile */}
        <div className="relative" ref={profileRef}>
          <button
            onClick={() => {
              setShowProfile(!showProfile);
              setShowNotifications(false);
            }}
            className="w-8 h-8 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-md text-white font-bold"
            style={{ backgroundColor: 'var(--primary-accent)' }}
            title={language === 'zh' ? '开发者空间' : 'Developer profile'}
          >
            <span className="material-symbols-outlined text-[18px]">person</span>
          </button>

          {showProfile && (
            <div className="absolute right-0 top-11 w-64 bg-[var(--app-surface-high)] border border-[var(--app-border)] text-[var(--app-text)] rounded-2xl shadow-2xl p-3 z-50 animate-in fade-in zoom-in-95 duration-100">
              <div className="flex items-center gap-3 pb-3 border-b border-[var(--app-border)]">
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold"
                  style={{ backgroundColor: 'var(--primary-accent)' }}
                >
                  OS
                </div>
                <div className="flex flex-col">
                  <span className="text-[13px] font-bold text-[var(--app-text)]">
                    {t.header.profileRole}
                  </span>
                  <span className="text-[10px] font-code text-[var(--app-text-muted)]">
                    Ollama Studio · Web
                  </span>
                </div>
              </div>
              <div className="flex flex-col gap-1 mt-2 text-[12px] text-[var(--app-text-muted)]">
                <div className="flex justify-between py-1 px-2 rounded-lg hover:bg-[var(--app-surface)]">
                  <span>{t.header.profileOllamaVer}</span>
                  <span className="font-code font-bold" style={{ color: 'var(--primary-accent)' }}>
                    {ollamaVersion ? `v${ollamaVersion}` : '—'}
                  </span>
                </div>
                <div className="flex justify-between py-1 px-2 rounded-lg hover:bg-[var(--app-surface)]">
                  <span>{language === 'zh' ? '运行中模型' : 'Running models'}</span>
                  <span className="font-code text-[#27c93f]">{runningCount}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
