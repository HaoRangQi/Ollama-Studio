import { createContext, useContext } from 'react';
import type { Copy, Lang } from '../copy';

export type Mode = 'dark' | 'light';

export interface ConsoleContextValue {
  lang: Lang;
  mode: Mode;
  t: Copy;
  setLang: (lang: Lang) => void;
  setMode: (mode: Mode) => void;
  toggleLang: () => void;
  toggleMode: () => void;
}

export const ConsoleContext = createContext<ConsoleContextValue | null>(null);

export function useConsole(): ConsoleContextValue {
  const value = useContext(ConsoleContext);
  if (!value) throw new Error('useConsole must be used within ConsoleProvider');
  return value;
}
