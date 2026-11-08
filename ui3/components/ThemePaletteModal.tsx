import { useEffect, useRef } from 'react';
import { useTheme } from '../context/ThemeContext';
import type { AccentId, ThemeMode } from '../context/ThemeContext';
import { Icon } from './Icon';

const SWATCHES: Array<{ id: AccentId; labelKey: 'sage' | 'apricot' | 'cocoa' | 'honey' | 'mist' }> =
  [
    { id: 'sage', labelKey: 'sage' },
    { id: 'apricot', labelKey: 'apricot' },
    { id: 'cocoa', labelKey: 'cocoa' },
    { id: 'honey', labelKey: 'honey' },
    { id: 'mist', labelKey: 'mist' }
  ];

const MODES: ThemeMode[] = ['light', 'dark', 'system'];

export function ThemePaletteModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { c, themeMode, setThemeMode, accent, setAccent, language, setLanguage } = useTheme();
  const cardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    const timer = window.setTimeout(() => cardRef.current?.focus(), 20);
    return () => {
      document.removeEventListener('keydown', handleKey);
      window.clearTimeout(timer);
    };
  }, [onClose, open]);

  if (!open) return null;

  const modeLabel: Record<ThemeMode, string> = {
    light: c.theme.light,
    dark: c.theme.dark,
    system: c.theme.system
  };

  return (
    <div
      className="overlay overlay-soft"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={cardRef}
        className="theme-card"
        role="dialog"
        aria-modal="true"
        aria-label={c.theme.title}
        tabIndex={-1}
      >
        <div className="theme-card-head">
          <h3>{c.theme.title}</h3>
          <button
            type="button"
            className="iconbtn small"
            onClick={onClose}
            aria-label={c.common.close}
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="theme-label">{c.theme.accentLabel}</div>
        <div className="swatches">
          {SWATCHES.map((swatch) => (
            <button
              key={swatch.id}
              type="button"
              className={`swatch-item ${accent === swatch.id ? 'is-active' : ''}`}
              onClick={() => setAccent(swatch.id)}
              aria-pressed={accent === swatch.id}
            >
              <span className={`swatch swatch-${swatch.id}`}>
                {accent === swatch.id && <Icon name="check" size={15} />}
              </span>
              <span>{c.theme[swatch.labelKey]}</span>
            </button>
          ))}
        </div>

        <div className="theme-label">{c.theme.modeLabel}</div>
        <div className="segmented" role="group" aria-label={c.theme.modeLabel}>
          {MODES.map((mode) => (
            <button
              key={mode}
              type="button"
              className={themeMode === mode ? 'is-active' : ''}
              onClick={() => setThemeMode(mode)}
              aria-pressed={themeMode === mode}
            >
              {modeLabel[mode]}
            </button>
          ))}
        </div>

        <div className="theme-label">{c.theme.language}</div>
        <div className="segmented" role="group" aria-label={c.theme.language}>
          <button
            type="button"
            className={language === 'zh' ? 'is-active' : ''}
            onClick={() => setLanguage('zh')}
            aria-pressed={language === 'zh'}
          >
            {c.theme.chinese}
          </button>
          <button
            type="button"
            className={language === 'en' ? 'is-active' : ''}
            onClick={() => setLanguage('en')}
            aria-pressed={language === 'en'}
          >
            {c.theme.english}
          </button>
        </div>
      </div>
    </div>
  );
}
