/* eslint-disable react-refresh/only-export-components -- provider 与 hook 必须同文件导出 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { copy } from '../copy';
import type { Language } from '../copy';
import { readStorageJson, writeStorageJson } from '../lib/legacy';
import type { KeepAlive } from '../lib/legacy';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedMode = 'light' | 'dark';
export type AccentId = 'sage' | 'apricot' | 'cocoa' | 'honey' | 'mist';

export interface UiPreferences {
  /** 新对话默认 keep_alive；-1 表示常驻。 */
  defaultKeepAlive: KeepAlive;
  defaultNumCtx: number;
  showThinking: boolean;
  reduceMotion: boolean;
}

export const DEFAULT_PREFERENCES: UiPreferences = {
  defaultKeepAlive: '5m',
  defaultNumCtx: 8192,
  showThinking: true,
  reduceMotion: false
};

export const THEME_KEY = 'ollama_ui3_theme';
export const ACCENT_KEY = 'ollama_ui3_accent';
export const LANGUAGE_KEY = 'ollama_language';
export const PREFERENCES_KEY = 'ollama_ui3_prefs_v1';

const ACCENTS: AccentId[] = ['sage', 'apricot', 'cocoa', 'honey', 'mist'];

/** 主题/语言与经典界面共用原始字符串存储，不能走 JSON 包装。 */
function readRaw(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeRaw(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // 私密模式或存储被禁用时保留内存状态。
  }
}

function readMode(): ThemeMode {
  const stored = readRaw(THEME_KEY);
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
}

function readAccent(): AccentId {
  const stored = readRaw(ACCENT_KEY);
  return ACCENTS.includes(stored as AccentId) ? (stored as AccentId) : 'sage';
}

function readLanguage(): Language {
  return readRaw(LANGUAGE_KEY) === 'en' ? 'en' : 'zh';
}

function normalizeKeepAlive(value: unknown): KeepAlive {
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value === 0) return 0;
    return value < 0 ? -1 : Math.min(value, 86_400);
  }
  if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 16);
  return '5m';
}

function readPreferences(): UiPreferences {
  const raw = readStorageJson<unknown>(PREFERENCES_KEY, null);
  if (typeof raw !== 'object' || raw === null) return DEFAULT_PREFERENCES;
  const value = raw as Record<string, unknown>;
  const numCtx =
    typeof value.defaultNumCtx === 'number' && Number.isFinite(value.defaultNumCtx)
      ? Math.min(131_072, Math.max(512, Math.round(value.defaultNumCtx)))
      : DEFAULT_PREFERENCES.defaultNumCtx;
  return {
    defaultKeepAlive: normalizeKeepAlive(value.defaultKeepAlive),
    defaultNumCtx: numCtx,
    showThinking:
      typeof value.showThinking === 'boolean'
        ? value.showThinking
        : DEFAULT_PREFERENCES.showThinking,
    reduceMotion:
      typeof value.reduceMotion === 'boolean'
        ? value.reduceMotion
        : DEFAULT_PREFERENCES.reduceMotion
  };
}

export interface ThemeContextValue {
  themeMode: ThemeMode;
  resolvedMode: ResolvedMode;
  setThemeMode: (mode: ThemeMode) => void;
  toggleTheme: () => void;
  accent: AccentId;
  setAccent: (accent: AccentId) => void;
  language: Language;
  setLanguage: (language: Language) => void;
  toggleLanguage: () => void;
  preferences: UiPreferences;
  setPreference: <K extends keyof UiPreferences>(key: K, value: UiPreferences[K]) => void;
  c: typeof copy.zh;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeMode, setThemeModeState] = useState<ThemeMode>(readMode);
  const [accent, setAccentState] = useState<AccentId>(readAccent);
  const [language, setLanguageState] = useState<Language>(readLanguage);
  const [preferences, setPreferences] = useState<UiPreferences>(readPreferences);
  const [systemDark, setSystemDark] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  const resolvedMode: ResolvedMode =
    themeMode === 'system' ? (systemDark ? 'dark' : 'light') : themeMode;

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const handle = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    query.addEventListener('change', handle);
    return () => query.removeEventListener('change', handle);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = resolvedMode;
    root.dataset.accent = accent;
    root.lang = language === 'zh' ? 'zh-CN' : 'en';
    root.classList.toggle('reduce-motion', preferences.reduceMotion);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', resolvedMode === 'dark' ? '#1b1a17' : '#f8f9f5');
  }, [accent, language, preferences.reduceMotion, resolvedMode]);

  const setThemeMode = useCallback((mode: ThemeMode) => {
    setThemeModeState(mode);
    writeRaw(THEME_KEY, mode);
  }, []);

  const toggleTheme = useCallback(() => {
    const next = resolvedMode === 'dark' ? 'light' : 'dark';
    setThemeModeState(next);
    writeRaw(THEME_KEY, next);
  }, [resolvedMode]);

  const setAccent = useCallback((value: AccentId) => {
    setAccentState(value);
    writeRaw(ACCENT_KEY, value);
  }, []);

  const setLanguage = useCallback((value: Language) => {
    setLanguageState(value);
    writeRaw(LANGUAGE_KEY, value);
  }, []);

  const toggleLanguage = useCallback(() => {
    setLanguageState((current) => {
      const next = current === 'zh' ? 'en' : 'zh';
      writeRaw(LANGUAGE_KEY, next);
      return next;
    });
  }, []);

  const setPreference = useCallback(
    <K extends keyof UiPreferences>(key: K, value: UiPreferences[K]) => {
      setPreferences((current) => {
        const next = { ...current, [key]: value };
        writeStorageJson(PREFERENCES_KEY, next);
        return next;
      });
    },
    []
  );

  const value = useMemo<ThemeContextValue>(
    () => ({
      themeMode,
      resolvedMode,
      setThemeMode,
      toggleTheme,
      accent,
      setAccent,
      language,
      setLanguage,
      toggleLanguage,
      preferences,
      setPreference,
      c: copy[language]
    }),
    [
      accent,
      language,
      preferences,
      resolvedMode,
      setAccent,
      setLanguage,
      setPreference,
      setThemeMode,
      themeMode,
      toggleLanguage,
      toggleTheme
    ]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
}
