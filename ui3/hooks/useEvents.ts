import { useCallback, useState } from 'react';

export type EventLevel = 'info' | 'success' | 'warn' | 'error';

export interface AppEvent {
  id: string;
  at: number;
  level: EventLevel;
  text: string;
}

function createId(): string {
  const api = globalThis.crypto;
  if (api && typeof api.randomUUID === 'function') return api.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface UseEventsResult {
  events: AppEvent[];
  pushEvent: (level: EventLevel, text: string) => void;
}

/** 仅记录本次页面会话中真实发生的事件，用于监控页的“本次会话事件”。 */
export function useEvents(): UseEventsResult {
  const [events, setEvents] = useState<AppEvent[]>([]);

  const pushEvent = useCallback((level: EventLevel, text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setEvents((previous) =>
      [{ id: createId(), at: Date.now(), level, text: trimmed }, ...previous].slice(0, 50)
    );
  }, []);

  return { events, pushEvent };
}
