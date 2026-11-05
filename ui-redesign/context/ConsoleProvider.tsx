import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { copy, type Lang } from '../copy';
import { ConsoleContext, type ConsoleContextValue, type Mode } from './console';

const LANGUAGE_KEY = 'ollama_language';
const THEME_KEY = 'ollama_theme_mode';

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable in private or restricted contexts.
  }
}

export function ConsoleProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() =>
    readStored(LANGUAGE_KEY) === 'en' ? 'en' : 'zh'
  );
  const [mode, setModeState] = useState<Mode>(() =>
    readStored(THEME_KEY) === 'light' ? 'light' : 'dark'
  );

  const setLang = useCallback((next: Lang) => setLangState(next), []);
  const setMode = useCallback((next: Mode) => setModeState(next), []);
  const toggleLang = useCallback(
    () => setLangState((previous) => (previous === 'zh' ? 'en' : 'zh')),
    []
  );
  const toggleMode = useCallback(
    () => setModeState((previous) => (previous === 'dark' ? 'light' : 'dark')),
    []
  );

  useEffect(() => {
    const root = document.documentElement;
    root.lang = lang === 'zh' ? 'zh-CN' : 'en';
    root.dataset.lang = lang;
    writeStored(LANGUAGE_KEY, lang);
  }, [lang]);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.mode = mode;
    root.style.colorScheme = mode;
    writeStored(THEME_KEY, mode);
  }, [mode]);

  const value = useMemo<ConsoleContextValue>(
    () => ({ lang, mode, t: copy[lang], setLang, setMode, toggleLang, toggleMode }),
    [lang, mode, setLang, setMode, toggleLang, toggleMode]
  );

  return <ConsoleContext.Provider value={value}>{children}</ConsoleContext.Provider>;
}
