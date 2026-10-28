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
export type AccentPalette = 'lavender' | 'emerald' | 'amber' | 'sakura' | 'cyan';

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

export const PALETTES: Record<AccentPalette, PaletteConfig> = {
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

interface ThemeContextType {
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  toggleTheme: () => void;
  accentPalette: AccentPalette;
  setAccentPalette: (palette: AccentPalette) => void;
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
    return stored && stored in PALETTES ? (stored as AccentPalette) : 'lavender';
  });

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
    const current = PALETTES[accentPalette] || PALETTES.lavender;

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
  }, [themeMode, accentPalette, language]);

  const t = translations[language] || translations.zh;
  const currentPaletteConfig = PALETTES[accentPalette] || PALETTES.lavender;

  return (
    <ThemeContext.Provider
      value={{
        themeMode,
        setThemeMode,
        toggleTheme,
        accentPalette,
        setAccentPalette,
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
