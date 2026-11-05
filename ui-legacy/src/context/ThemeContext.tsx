/* eslint-disable react-refresh/only-export-components -- this module intentionally exports the theme hook and palette constants alongside the provider */
import React, { createContext, useContext, useState, useEffect } from 'react';
import { translations, Language } from '../i18n/translations';

function readPreference(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writePreference(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Private mode or blocked storage: keep the in-memory preference.
  }
}

export type ThemeMode = 'dark' | 'light';
export type PresetPalette = 'lavender' | 'emerald' | 'amber' | 'sakura' | 'cyan';
export type AccentPalette = PresetPalette | 'custom';

export interface PaletteConfig {
  id: AccentPalette;
  nameZh: string;
  nameEn: string;
  primary: string;
  primaryContainer: string;
  tint: string;
  glow: string;
  dotColor: string;
}

export const PALETTES: Record<PresetPalette, PaletteConfig> = {
  lavender: {
    id: 'lavender',
    nameZh: '电光薰衣草',
    nameEn: 'Electric Lavender',
    primary: '#7952ec',
    primaryContainer: '#4d31a8',
    tint: '#cdbdff',
    glow: 'rgba(121, 82, 236, 0.45)',
    dotColor: '#7952ec'
  },
  emerald: {
    id: 'emerald',
    nameZh: '赛博翡翠',
    nameEn: 'Cyber Emerald',
    primary: '#059669',
    primaryContainer: '#065f46',
    tint: '#6ee7b7',
    glow: 'rgba(5, 150, 105, 0.45)',
    dotColor: '#059669'
  },
  amber: {
    id: 'amber',
    nameZh: '极客琥珀',
    nameEn: 'Neon Amber',
    primary: '#d97706',
    primaryContainer: '#92400e',
    tint: '#fcd34d',
    glow: 'rgba(217, 119, 6, 0.45)',
    dotColor: '#d97706'
  },
  sakura: {
    id: 'sakura',
    nameZh: '樱花草莓',
    nameEn: 'Sakura Pink',
    primary: '#d946ef',
    primaryContainer: '#86198f',
    tint: '#f5d0fe',
    glow: 'rgba(217, 70, 239, 0.45)',
    dotColor: '#d946ef'
  },
  cyan: {
    id: 'cyan',
    nameZh: '冰川极光',
    nameEn: 'Glacier Cyan',
    primary: '#0284c7',
    primaryContainer: '#075985',
    tint: '#7dd3fc',
    glow: 'rgba(2, 132, 199, 0.45)',
    dotColor: '#0284c7'
  }
};

export const DEFAULT_CUSTOM_ACCENT = '#7952ec';

function normalizeCustomAccent(value: string | null): string {
  return value && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : DEFAULT_CUSTOM_ACCENT;
}

function hexToRgb(hex: string): [number, number, number] {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16)
  ];
}

function rgbToHex(red: number, green: number, blue: number): string {
  const channel = (value: number) =>
    Math.min(255, Math.max(0, Math.round(value)))
      .toString(16)
      .padStart(2, '0');
  return `#${channel(red)}${channel(green)}${channel(blue)}`;
}

function mixColor(hex: string, target: [number, number, number], amount: number): string {
  const [red, green, blue] = hexToRgb(hex);
  return rgbToHex(
    red + (target[0] - red) * amount,
    green + (target[1] - green) * amount,
    blue + (target[2] - blue) * amount
  );
}

export function buildCustomPalette(hex: string): PaletteConfig {
  const primary = normalizeCustomAccent(hex);
  const [red, green, blue] = hexToRgb(primary);
  return {
    id: 'custom',
    nameZh: '自定义调色盘',
    nameEn: 'Custom palette',
    primary,
    primaryContainer: mixColor(primary, [0, 0, 0], 0.35),
    tint: mixColor(primary, [255, 255, 255], 0.55),
    glow: `rgba(${red}, ${green}, ${blue}, 0.45)`,
    dotColor: primary
  };
}

export function resolvePalette(palette: AccentPalette, customAccent: string): PaletteConfig {
  if (palette === 'custom') return buildCustomPalette(customAccent);
  return PALETTES[palette] ?? PALETTES.lavender;
}

interface ThemeContextType {
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  toggleTheme: () => void;
  accentPalette: AccentPalette;
  setAccentPalette: (palette: AccentPalette) => void;
  customAccent: string;
  setCustomAccent: (hex: string) => void;
  language: Language;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
  t: typeof translations.zh;
  currentPaletteConfig: PaletteConfig;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [themeMode, setThemeModeState] = useState<ThemeMode>(() =>
    readPreference('ollama_theme_mode') === 'light' ? 'light' : 'dark'
  );

  const [accentPalette, setAccentPaletteState] = useState<AccentPalette>(() => {
    const stored = readPreference('ollama_accent_palette');
    if (stored === 'custom') return 'custom';
    return stored && stored in PALETTES ? (stored as PresetPalette) : 'lavender';
  });

  const [customAccent, setCustomAccentState] = useState<string>(() =>
    normalizeCustomAccent(readPreference('ollama_custom_accent'))
  );

  const [language, setLanguageState] = useState<Language>(() =>
    readPreference('ollama_language') === 'en' ? 'en' : 'zh'
  );

  const setThemeMode = (mode: ThemeMode) => {
    setThemeModeState(mode);
    writePreference('ollama_theme_mode', mode);
  };

  const toggleTheme = () => {
    setThemeMode(themeMode === 'dark' ? 'light' : 'dark');
  };

  const setAccentPalette = (palette: AccentPalette) => {
    setAccentPaletteState(palette);
    writePreference('ollama_accent_palette', palette);
  };

  const setCustomAccent = (hex: string) => {
    const normalized = normalizeCustomAccent(hex);
    setCustomAccentState(normalized);
    writePreference('ollama_custom_accent', normalized);
    setAccentPaletteState('custom');
    writePreference('ollama_accent_palette', 'custom');
  };

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    writePreference('ollama_language', lang);
  };

  const toggleLanguage = () => {
    setLanguage(language === 'zh' ? 'en' : 'zh');
  };

  // Sync theme, language and CSS variables to root
  useEffect(() => {
    const root = document.documentElement;
    root.lang = language === 'zh' ? 'zh-CN' : 'en';
    const current = resolvePalette(accentPalette, customAccent);

    // Dark/Light class
    if (themeMode === 'dark') {
      root.classList.add('dark');
      root.classList.remove('light');
    } else {
      root.classList.add('light');
      root.classList.remove('dark');
    }

    // Set dynamic custom CSS variables
    root.style.setProperty('--primary-accent', current.primary);
    root.style.setProperty('--primary-container', current.primaryContainer);
    root.style.setProperty('--primary-tint', current.tint);
    root.style.setProperty('--primary-glow', current.glow);

    if (themeMode === 'dark') {
      root.style.setProperty('--app-bg', '#14121d');
      root.style.setProperty('--app-surface', '#201e2a');
      root.style.setProperty('--app-surface-high', '#2b2834');
      root.style.setProperty('--app-surface-highest', '#36333f');
      root.style.setProperty('--app-sidebar', '#0f0d18');
      root.style.setProperty('--app-text', '#e6e0f0');
      root.style.setProperty('--app-text-muted', '#cac3d7');
      root.style.setProperty('--app-border', 'rgba(255, 255, 255, 0.08)');
    } else {
      root.style.setProperty('--app-bg', '#f4f3f9');
      root.style.setProperty('--app-surface', '#ffffff');
      root.style.setProperty('--app-surface-high', '#f0edf7');
      root.style.setProperty('--app-surface-highest', '#e4dfef');
      root.style.setProperty('--app-sidebar', '#eae6f4');
      root.style.setProperty('--app-text', '#1c1827');
      root.style.setProperty('--app-text-muted', '#5c546b');
      root.style.setProperty('--app-border', 'rgba(0, 0, 0, 0.08)');
    }
  }, [themeMode, accentPalette, customAccent, language]);

  const t = translations[language] || translations.zh;
  const currentPaletteConfig = resolvePalette(accentPalette, customAccent);

  return (
    <ThemeContext.Provider
      value={{
        themeMode,
        setThemeMode,
        toggleTheme,
        accentPalette,
        setAccentPalette,
        customAccent,
        setCustomAccent,
        language,
        setLanguage,
        toggleLanguage,
        t,
        currentPaletteConfig
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useAppTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useAppTheme must be used within a ThemeProvider');
  }
  return context;
};
