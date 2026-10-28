import React from 'react';
import { NavScreen } from '../types';
import { useAppTheme } from '../context/ThemeContext';
import { OllamaStatus } from '../hooks/useOllama';

interface SidebarProps {
  currentScreen: NavScreen;
  onNavigate: (screen: NavScreen) => void;
  runningModelCount: number;
  loadedVramGb: number;
  ollamaStatus: OllamaStatus;
  ollamaVersion: string | null;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentScreen,
  onNavigate,
  runningModelCount,
  loadedVramGb,
  ollamaStatus,
  ollamaVersion
}) => {
  const { t, language } = useAppTheme();
  const online = ollamaStatus === 'online';
  const connecting = ollamaStatus === 'connecting';
  const statusColor = online ? '#27c93f' : connecting ? '#ffbd2e' : '#ff453a';
  const statusText = online
    ? t.nav.activeStatus
    : connecting
      ? language === 'zh'
        ? '正在连接 Ollama'
        : 'Connecting to Ollama'
      : language === 'zh'
        ? 'Ollama 未连接'
        : 'Ollama offline';

  const navItems: { id: NavScreen; label: string; icon: string }[] = [
    { id: 'chat', label: t.nav.chat, icon: 'chat_spark' },
    { id: 'models', label: t.nav.models, icon: 'deployed_code' },
    { id: 'pull', label: t.nav.pull, icon: 'cloud_download' },
    { id: 'modelfile-lab', label: t.nav.modelfileLab, icon: 'science' },
    { id: 'telemetry-settings', label: t.nav.telemetry, icon: 'vital_signs' }
  ];

  return (
    <aside className="hidden lg:flex fixed left-0 top-0 h-full w-64 bg-[var(--app-sidebar)] z-50 flex-col justify-between p-4 border-r border-[var(--app-border)] select-none transition-colors">
      <div className="flex flex-col gap-4">
        {/* macOS Traffic Lights & Logo */}
        <div className="flex items-center gap-2 px-1 pt-1 pb-2">
          <div className="flex items-center gap-1.5 group cursor-pointer">
            <div
              className="w-3 h-3 rounded-full bg-[#ff5f56] opacity-90 hover:opacity-100 transition-opacity"
              title={language === 'zh' ? '关闭窗口' : 'Close'}
            />
            <div
              className="w-3 h-3 rounded-full bg-[#ffbd2e] opacity-90 hover:opacity-100 transition-opacity"
              title={language === 'zh' ? '最小化' : 'Minimize'}
            />
            <div
              className="w-3 h-3 rounded-full bg-[#27c93f] opacity-90 hover:opacity-100 transition-opacity"
              title={language === 'zh' ? '全屏' : 'Full screen'}
            />
          </div>
          <div className="ml-2 flex items-center gap-1.5">
            <span
              className="material-symbols-outlined text-[20px]"
              style={{ color: 'var(--primary-accent)' }}
            >
              neurology
            </span>
            <span className="font-headline text-[15px] text-[var(--app-text)] font-bold tracking-tight">
              Ollama Studio
            </span>
          </div>
        </div>

        {/* Engine Status Pill */}
        <div className="px-1">
          <div className="bg-[var(--app-surface)] border border-[var(--app-border)] rounded-full px-3 py-1 flex items-center gap-2 shadow-inner">
            <span
              className={`w-2 h-2 rounded-full ${online ? 'animate-pulse' : ''}`}
              style={{ backgroundColor: statusColor, boxShadow: `0 0 8px ${statusColor}` }}
            />
            <span className="text-[11px] text-[var(--app-text-muted)] font-medium tracking-wide">
              {statusText}
            </span>
            <span
              className="font-code text-[10px] font-semibold ml-auto"
              style={{ color: online ? 'var(--primary-accent)' : statusColor }}
              title={ollamaVersion ? `Ollama v${ollamaVersion}` : undefined}
            >
              {online ? `v${ollamaVersion ?? '?'}` : ':11434'}
            </span>
          </div>
        </div>

        {/* Main Navigation */}
        <nav className="flex flex-col gap-1.5 mt-1">
          {navItems.map((item) => {
            const isActive = currentScreen === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-full text-[13px] font-medium transition-all group cursor-pointer text-left ${
                  isActive
                    ? 'text-white font-semibold shadow-lg ring-1 ring-white/20'
                    : 'text-[var(--app-text-muted)] hover:bg-[var(--app-surface-high)] hover:text-[var(--app-text)]'
                }`}
                style={
                  isActive
                    ? {
                        backgroundColor: 'var(--primary-accent)',
                        boxShadow: '0 0 18px var(--primary-glow)'
                      }
                    : {}
                }
              >
                <span
                  className={`material-symbols-outlined text-[20px] transition-transform duration-200 ${
                    isActive
                      ? 'scale-110 text-white'
                      : 'text-[var(--app-text-muted)] group-hover:scale-105'
                  }`}
                  style={!isActive ? { color: 'var(--primary-accent)' } : {}}
                >
                  {item.icon}
                </span>
                <span className="tracking-tight">{item.label}</span>
                {item.id === 'models' && runningModelCount > 0 && (
                  <span className="ml-auto bg-[#27c93f]/20 text-[#27c93f] text-[10px] font-code px-2 py-0.5 rounded-full font-bold">
                    {runningModelCount} {t.nav.runningTag}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Real VRAM reported by /api/ps */}
      <div className="flex flex-col gap-2 bg-[var(--app-surface)] border border-[var(--app-border)] p-3 rounded-2xl shadow-lg">
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-[var(--app-text-muted)] font-medium">
            {language === 'zh' ? '已加载显存' : 'Loaded VRAM'}
          </span>
          <span className="text-[10px] text-[#ffafd3] font-semibold tracking-wider">
            {language === 'zh' ? 'Ollama 报告' : 'reported'}
          </span>
        </div>
        <div className="flex items-baseline gap-1">
          <span className="font-headline text-[20px] text-[var(--app-text)] font-bold">
            {loadedVramGb.toFixed(1)}
          </span>
          <span className="text-[11px] text-[var(--app-text-muted)]">GB</span>
        </div>
        <div className="flex justify-between items-center text-[10px] text-[var(--app-text-muted)] font-code">
          <span>
            {runningModelCount} {t.nav.runningTag}
          </span>
          <span className="text-[var(--app-text)]">{online ? 'GET /api/ps' : '—'}</span>
        </div>
      </div>
    </aside>
  );
};
