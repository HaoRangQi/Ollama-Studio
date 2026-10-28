import React, { useState, useEffect } from 'react';
import { NavScreen, OllamaModel } from '../types';
import { useAppTheme } from '../context/ThemeContext';

interface CommandPaletteProps {
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  models: OllamaModel[];
  onSelectModel: (model: OllamaModel) => void;
  onNavigate: (screen: NavScreen) => void;
  onQuickPull: (modelName: string) => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onOpen,
  onClose,
  models,
  onSelectModel,
  onNavigate,
  onQuickPull
}) => {
  const { t, language } = useAppTheme();
  const [query, setQuery] = useState('');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (isOpen) onClose();
        else onOpen();
      }
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onOpen, onClose]);

  if (!isOpen) return null;

  const filteredModels = models.filter(
    (m) =>
      m.name.toLowerCase().includes(query.toLowerCase()) ||
      m.tag.toLowerCase().includes(query.toLowerCase()) ||
      m.category.toLowerCase().includes(query.toLowerCase())
  );

  const quickActions = [
    { label: t.nav.chat, icon: 'chat_spark', action: () => onNavigate('chat') },
    { label: t.nav.models, icon: 'deployed_code', action: () => onNavigate('models') },
    { label: t.nav.pull, icon: 'cloud_download', action: () => onNavigate('pull') },
    { label: t.nav.modelfileLab, icon: 'science', action: () => onNavigate('modelfile-lab') },
    { label: t.nav.telemetry, icon: 'vital_signs', action: () => onNavigate('telemetry-settings') },
    {
      label: `${t.pull.pullBtnPrefix}: deepseek-r1:8b`,
      icon: 'download',
      action: () => {
        onQuickPull('deepseek-r1:8b');
        onNavigate('pull');
      }
    },
    {
      label: `${t.pull.pullBtnPrefix}: qwen2.5-coder:7b`,
      icon: 'download',
      action: () => {
        onQuickPull('qwen2.5-coder:7b');
        onNavigate('pull');
      }
    }
  ].filter((a) => a.label.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-start justify-center pt-24 p-4 animate-in fade-in duration-150">
      <div
        className="bg-[var(--app-surface)] border border-[var(--app-border)] w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col transform transition-all text-[var(--app-text)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input Bar */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-[var(--app-border)] bg-[var(--app-surface-high)]">
          <span
            className="material-symbols-outlined text-[22px]"
            style={{ color: 'var(--primary-accent)' }}
          >
            search
          </span>
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.cmdPalette.searchPlaceholder}
            className="w-full bg-transparent border-none outline-none text-[var(--app-text)] placeholder:text-[var(--app-text-muted)] font-body text-[15px]"
          />
          <kbd className="bg-[var(--app-surface-highest)] text-[var(--app-text-muted)] font-code text-[11px] px-2 py-0.5 rounded-full border border-[var(--app-border)]">
            ESC
          </kbd>
        </div>

        {/* Search Results */}
        <div className="max-h-96 overflow-y-auto p-4 flex flex-col gap-4">
          <div>
            <div className="px-3 py-1 text-[11px] font-semibold text-[var(--app-text-muted)] tracking-wider uppercase">
              {t.cmdPalette.localWeights} ({filteredModels.length})
            </div>
            <div className="flex flex-col gap-1 mt-1">
              {filteredModels.length === 0 ? (
                <div className="text-[13px] text-[var(--app-text-muted)] px-3 py-2">
                  {t.cmdPalette.noMatch}
                </div>
              ) : (
                filteredModels.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => {
                      onSelectModel(m);
                      onNavigate('chat');
                      onClose();
                    }}
                    className="flex items-center justify-between px-4 py-2.5 rounded-2xl hover:bg-[var(--app-surface-high)] text-left transition-colors group cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-8 h-8 rounded-xl ${m.iconBg} ${m.iconColor} flex items-center justify-center border border-[var(--app-border)]`}
                      >
                        <span className="material-symbols-outlined text-[18px]">{m.icon}</span>
                      </div>
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          <span className="text-[14px] text-[var(--app-text)] font-bold">
                            {m.name}
                          </span>
                          <span className="text-[11px] font-code bg-[var(--app-surface-highest)] text-[var(--app-text-muted)] px-2 py-0.5 rounded-full">
                            {m.tag}
                          </span>
                          {m.status === 'running' && (
                            <span className="text-[10px] bg-[#27c93f]/20 text-[#27c93f] px-2 py-0.2 rounded-full font-bold">
                              {t.cmdPalette.vramReady}
                            </span>
                          )}
                        </div>
                        <span className="text-[12px] text-[var(--app-text-muted)] line-clamp-1">
                          {language === 'zh' ? m.description : (m.descriptionEn ?? m.description)}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] font-code text-[var(--app-text-muted)]">
                      <span>{m.quantization}</span>
                      <span>·</span>
                      <span>{m.size}</span>
                      <span
                        className="material-symbols-outlined text-[16px] opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{ color: 'var(--primary-accent)' }}
                      >
                        arrow_forward
                      </span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          <div>
            <div className="px-3 py-1 text-[11px] font-semibold text-[var(--app-text-muted)] tracking-wider uppercase">
              {t.cmdPalette.quickJump}
            </div>
            <div className="flex flex-col gap-1 mt-1">
              {quickActions.map((qa, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    qa.action();
                    onClose();
                  }}
                  className="flex items-center justify-between px-4 py-2 rounded-2xl hover:bg-[var(--app-surface-high)] text-left transition-colors cursor-pointer group"
                >
                  <div className="flex items-center gap-3 text-[13px] text-[var(--app-text)]">
                    <span
                      className="material-symbols-outlined text-[18px]"
                      style={{ color: 'var(--primary-accent)' }}
                    >
                      {qa.icon}
                    </span>
                    <span>{qa.label}</span>
                  </div>
                  <span className="material-symbols-outlined text-[16px] text-[var(--app-text-muted)] opacity-0 group-hover:opacity-100">
                    subdirectory_arrow_left
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-2.5 bg-[var(--app-surface-high)] border-t border-[var(--app-border)] flex items-center justify-between text-[11px] text-[var(--app-text-muted)]">
          <div className="flex items-center gap-2">
            <kbd className="px-1.5 py-0.5 rounded bg-[var(--app-surface)] border border-[var(--app-border)]">
              ↑
            </kbd>
            <kbd className="px-1.5 py-0.5 rounded bg-[var(--app-surface)] border border-[var(--app-border)]">
              ↓
            </kbd>
            <span>{t.cmdPalette.footerNav}</span>
            <kbd className="px-1.5 py-0.5 rounded bg-[var(--app-surface)] border border-[var(--app-border)] ml-2">
              ↵
            </kbd>
            <span>{t.cmdPalette.footerSelect}</span>
          </div>
          <span style={{ color: 'var(--primary-accent)' }}>Ollama Studio</span>
        </div>
      </div>
    </div>
  );
};
