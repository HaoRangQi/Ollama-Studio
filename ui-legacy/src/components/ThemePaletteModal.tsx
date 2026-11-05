import React from 'react';
import { useAppTheme, PALETTES, buildCustomPalette } from '../context/ThemeContext';

const CUSTOM_SWATCHES = [
  '#ef4444',
  '#f97316',
  '#f59e0b',
  '#eab308',
  '#22c55e',
  '#10b981',
  '#14b8a6',
  '#06b6d4',
  '#3b82f6',
  '#6366f1',
  '#8b5cf6',
  '#a855f7',
  '#d946ef',
  '#ec4899',
  '#f43f5e',
  '#64748b'
];

function randomSwatch(current: string): string {
  const options = CUSTOM_SWATCHES.filter((color) => color !== current);
  return options[Math.floor(Math.random() * options.length)] ?? CUSTOM_SWATCHES[0];
}

interface ThemePaletteModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ThemePaletteModal: React.FC<ThemePaletteModalProps> = ({ isOpen, onClose }) => {
  const {
    themeMode,
    setThemeMode,
    accentPalette,
    setAccentPalette,
    customAccent,
    setCustomAccent,
    language,
    setLanguage,
    t
  } = useAppTheme();

  if (!isOpen) return null;

  const customPreview = buildCustomPalette(customAccent);

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 flex items-center justify-center p-4 transition-all"
      onClick={onClose}
    >
      <div
        className="bg-[var(--app-surface-high)] border border-[var(--app-border)] text-[var(--app-text)] rounded-[2.5rem] p-6 lg:p-8 max-w-xl w-full max-h-[90vh] overflow-y-auto shadow-2xl flex flex-col gap-6 transform transition-transform"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-[var(--app-border)]">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-white shadow-md"
              style={{ backgroundColor: 'var(--primary-accent)' }}
            >
              <span className="material-symbols-outlined text-[20px]">palette</span>
            </div>
            <div>
              <h3 className="font-headline text-[18px] font-bold text-[var(--app-text)]">
                {t.paletteModal.title}
              </h3>
              <p className="text-[12px] text-[var(--app-text-muted)]">{t.paletteModal.subtitle}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-[var(--app-surface-highest)] flex items-center justify-center text-[var(--app-text-muted)] hover:text-[var(--app-text)] cursor-pointer transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* 1. Dark / Light Theme Toggle */}
        <div className="flex flex-col gap-2.5">
          <label className="text-[12px] font-bold uppercase tracking-wider text-[var(--app-text-muted)]">
            {t.paletteModal.themeMode}
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setThemeMode('dark')}
              className={`flex items-center gap-3 p-3.5 rounded-2xl border transition-all cursor-pointer ${
                themeMode === 'dark'
                  ? 'border-[var(--primary-accent)] bg-[var(--app-surface)] shadow-md ring-1 ring-[var(--primary-accent)]'
                  : 'border-[var(--app-border)] hover:bg-[var(--app-surface)]'
              }`}
            >
              <div className="w-8 h-8 rounded-xl bg-[#14121d] border border-white/10 flex items-center justify-center text-[#cdbdff]">
                <span className="material-symbols-outlined text-[18px]">dark_mode</span>
              </div>
              <div className="flex flex-col text-left">
                <span className="text-[13px] font-bold text-[var(--app-text)]">
                  {t.paletteModal.themeDark}
                </span>
                <span className="text-[11px] text-[var(--app-text-muted)]">OLED Obsidian</span>
              </div>
            </button>

            <button
              onClick={() => setThemeMode('light')}
              className={`flex items-center gap-3 p-3.5 rounded-2xl border transition-all cursor-pointer ${
                themeMode === 'light'
                  ? 'border-[var(--primary-accent)] bg-[var(--app-surface)] shadow-md ring-1 ring-[var(--primary-accent)]'
                  : 'border-[var(--app-border)] hover:bg-[var(--app-surface)]'
              }`}
            >
              <div className="w-8 h-8 rounded-xl bg-white border border-black/10 flex items-center justify-center text-[#7952ec]">
                <span className="material-symbols-outlined text-[18px]">light_mode</span>
              </div>
              <div className="flex flex-col text-left">
                <span className="text-[13px] font-bold text-[var(--app-text)]">
                  {t.paletteModal.themeLight}
                </span>
                <span className="text-[11px] text-[var(--app-text-muted)]">Crisp Studio</span>
              </div>
            </button>
          </div>
        </div>

        {/* 2. Color Palette Picker */}
        <div className="flex flex-col gap-2.5">
          <label className="text-[12px] font-bold uppercase tracking-wider text-[var(--app-text-muted)]">
            {t.paletteModal.paletteTitle}
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {(Object.keys(PALETTES) as Array<keyof typeof PALETTES>).map((key) => {
              const pal = PALETTES[key];
              const isSelected = accentPalette === key;
              const displayName = language === 'zh' ? pal.nameZh : pal.nameEn;

              return (
                <button
                  key={key}
                  onClick={() => setAccentPalette(key)}
                  className={`flex items-center justify-between p-3 rounded-2xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'border-[var(--primary-accent)] bg-[var(--app-surface)] shadow-md ring-1 ring-[var(--primary-accent)]'
                      : 'border-[var(--app-border)] hover:bg-[var(--app-surface)]'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      className="w-5 h-5 rounded-full shadow-sm shrink-0 flex items-center justify-center"
                      style={{ backgroundColor: pal.primary }}
                    >
                      {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </span>
                    <span className="text-[13px] font-semibold text-[var(--app-text)]">
                      {displayName}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span
                      className="w-3 h-3 rounded-full opacity-80"
                      style={{ backgroundColor: pal.tint }}
                    />
                    <span
                      className="w-3 h-3 rounded-full opacity-60"
                      style={{ backgroundColor: pal.primaryContainer }}
                    />
                  </div>
                </button>
              );
            })}
          </div>

          <div
            className={`mt-1 flex flex-col gap-3 rounded-2xl border p-3.5 transition-all ${
              accentPalette === 'custom'
                ? 'border-[var(--primary-accent)] bg-[var(--app-surface)] shadow-md ring-1 ring-[var(--primary-accent)]'
                : 'border-[var(--app-border)]'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <span
                  className="w-5 h-5 rounded-full shadow-sm shrink-0"
                  style={{ backgroundColor: customAccent }}
                />
                <div className="flex flex-col">
                  <span className="text-[13px] font-semibold text-[var(--app-text)]">
                    {language === 'zh' ? '自定义调色盘' : 'Custom palette'}
                  </span>
                  <span className="text-[10px] font-code text-[var(--app-text-muted)]">
                    {customAccent}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <span
                    className="w-3 h-3 rounded-full opacity-80"
                    style={{ backgroundColor: customPreview.tint }}
                  />
                  <span
                    className="w-3 h-3 rounded-full opacity-60"
                    style={{ backgroundColor: customPreview.primaryContainer }}
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCustomAccent(randomSwatch(customAccent))}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-[var(--app-surface-high)] text-[var(--app-text-muted)] hover:text-[var(--app-text)] border border-[var(--app-border)] text-[11px] font-medium transition-colors cursor-pointer"
                  title={language === 'zh' ? '随机颜色' : 'Random color'}
                >
                  <span className="material-symbols-outlined text-[15px]">casino</span>
                  <span>{language === 'zh' ? '随机' : 'Random'}</span>
                </button>
                <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--app-surface-high)] text-[var(--app-text-muted)] hover:text-[var(--app-text)] border border-[var(--app-border)] text-[11px] font-medium transition-colors cursor-pointer">
                  <span className="material-symbols-outlined text-[15px]">colorize</span>
                  <span>{language === 'zh' ? '选颜色' : 'Pick'}</span>
                  <input
                    type="color"
                    value={customAccent}
                    onChange={(event) => setCustomAccent(event.target.value)}
                    className="sr-only"
                    aria-label={language === 'zh' ? '选择强调色' : 'Choose accent color'}
                  />
                </label>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {CUSTOM_SWATCHES.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setCustomAccent(color)}
                  aria-label={color}
                  title={color}
                  className={`w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 cursor-pointer ${
                    customAccent === color ? 'border-[var(--app-text)]' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
            <p className="text-[10px] text-[var(--app-text-muted)] leading-relaxed">
              {language === 'zh'
                ? '过亮的颜色可能降低强调色按钮上的文字对比度。'
                : 'Very light colors may reduce text contrast on accent buttons.'}
            </p>
          </div>
        </div>

        {/* 3. Language Selector */}
        <div className="flex flex-col gap-2.5">
          <label className="text-[12px] font-bold uppercase tracking-wider text-[var(--app-text-muted)]">
            {t.paletteModal.languageTitle}
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setLanguage('zh')}
              className={`flex items-center justify-center gap-2 py-3 rounded-2xl border text-[13px] font-semibold transition-all cursor-pointer ${
                language === 'zh'
                  ? 'border-[var(--primary-accent)] bg-[var(--app-surface)] text-[var(--app-text)] shadow-sm'
                  : 'border-[var(--app-border)] text-[var(--app-text-muted)] hover:bg-[var(--app-surface)]'
              }`}
            >
              <span>🇨🇳 简体中文 (Chinese)</span>
            </button>
            <button
              onClick={() => setLanguage('en')}
              className={`flex items-center justify-center gap-2 py-3 rounded-2xl border text-[13px] font-semibold transition-all cursor-pointer ${
                language === 'en'
                  ? 'border-[var(--primary-accent)] bg-[var(--app-surface)] text-[var(--app-text)] shadow-sm'
                  : 'border-[var(--app-border)] text-[var(--app-text-muted)] hover:bg-[var(--app-surface)]'
              }`}
            >
              <span>🇺🇸 English (US)</span>
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-2 border-t border-[var(--app-border)]">
          <span className="text-[12px] text-[var(--app-text-muted)] flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#27c93f]" />
            {t.paletteModal.saveDone}
          </span>
          <button
            onClick={onClose}
            className="px-6 py-2.5 rounded-full text-white text-[13px] font-semibold shadow-md transition-all cursor-pointer hover:opacity-90 active:scale-95"
            style={{ backgroundColor: 'var(--primary-accent)' }}
          >
            {language === 'zh' ? '完成' : 'Done'}
          </button>
        </div>
      </div>
    </div>
  );
};
