import React from 'react';
import { NavScreen } from '../types';
import { useAppTheme } from '../context/ThemeContext';

interface MobileNavProps {
  currentScreen: NavScreen;
  onNavigate: (screen: NavScreen) => void;
  runningModelCount: number;
}

export const MobileNav: React.FC<MobileNavProps> = ({
  currentScreen,
  onNavigate,
  runningModelCount
}) => {
  const { t } = useAppTheme();
  const items: { id: NavScreen; label: string; icon: string }[] = [
    { id: 'chat', label: t.nav.chat, icon: 'chat_spark' },
    { id: 'models', label: t.nav.models, icon: 'deployed_code' },
    { id: 'pull', label: t.nav.pull, icon: 'cloud_download' },
    { id: 'modelfile-lab', label: t.nav.modelfileLab, icon: 'science' },
    { id: 'telemetry-settings', label: t.nav.telemetry, icon: 'vital_signs' }
  ];

  return (
    <nav
      aria-label="Primary"
      className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-[var(--app-sidebar)]/95 backdrop-blur-xl border-t border-[var(--app-border)] safe-area-inset-bottom"
    >
      <div className="grid grid-cols-5">
        {items.map((item) => {
          const active = currentScreen === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              aria-current={active ? 'page' : undefined}
              className={`relative flex flex-col items-center justify-center gap-1 py-2.5 px-1 min-h-[56px] text-[10px] font-medium transition-colors cursor-pointer ${
                active
                  ? 'text-[var(--primary-accent)]'
                  : 'text-[var(--app-text-muted)] hover:text-[var(--app-text)]'
              }`}
            >
              <span className="material-symbols-outlined text-[22px]">{item.icon}</span>
              <span className="truncate max-w-full">{item.label.split(' ')[0]}</span>
              {item.id === 'models' && runningModelCount > 0 && (
                <span className="absolute top-1.5 right-1/4 min-w-4 h-4 px-1 rounded-full bg-[#27c93f] text-[9px] leading-4 text-[#0b1a0e] font-bold text-center">
                  {runningModelCount}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
