import type { ChatMessage } from '../types';
import { readStorageJson, removeStorageKey, writeStorageJson } from './storage';

export const CHAT_STORE_KEY = 'ollama_chat_sessions_v2';
export const LEGACY_CHAT_STORE_KEY = 'ollama_chat_sessions_v1';
export const CHAT_STORE_VERSION = 2;

export interface ChatSession {
  id: string;
  /** Empty until the first user message arrives; the UI supplies a default. */
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
}

export interface ChatStore {
  version: typeof CHAT_STORE_VERSION;
  activeByModel: Record<string, string>;
  sessionsByModel: Record<string, ChatSession[]>;
}

export function createEmptyStore(): ChatStore {
  return {
    version: CHAT_STORE_VERSION,
    activeByModel: {},
    sessionsByModel: {}
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isChatMessage(value: unknown): value is ChatMessage {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    (value.role === 'user' || value.role === 'assistant') &&
    typeof value.content === 'string' &&
    typeof value.timestamp === 'string'
  );
}

function createId(prefix: string): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
    return `${prefix}-${cryptoApi.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function deriveSessionTitle(messages: ChatMessage[]): string {
  const firstUser = messages.find((message) => message.role === 'user' && message.content.trim());
  if (!firstUser) return '';
  const normalized = firstUser.content.replace(/\s+/g, ' ').trim();
  return normalized.length > 40 ? `${normalized.slice(0, 40)}…` : normalized;
}

export function createSession(messages: ChatMessage[] = [], now = Date.now()): ChatSession {
  return {
    id: createId('session'),
    title: deriveSessionTitle(messages),
    createdAt: now,
    updatedAt: now,
    messages
  };
}

export function getSessions(store: ChatStore, modelTag: string): ChatSession[] {
  return store.sessionsByModel[modelTag] ?? [];
}

export function getActiveSession(store: ChatStore, modelTag: string): ChatSession | null {
  const sessions = getSessions(store, modelTag);
  if (sessions.length === 0) return null;
  const activeId = store.activeByModel[modelTag];
  return sessions.find((session) => session.id === activeId) ?? sessions[0];
}

export function setActiveSession(store: ChatStore, modelTag: string, sessionId: string): ChatStore {
  if (!getSessions(store, modelTag).some((session) => session.id === sessionId)) {
    return store;
  }
  return {
    ...store,
    activeByModel: { ...store.activeByModel, [modelTag]: sessionId }
  };
}

export function upsertSession(store: ChatStore, modelTag: string, session: ChatSession): ChatStore {
  const sessions = getSessions(store, modelTag);
  const exists = sessions.some((item) => item.id === session.id);
  const nextSessions = exists
    ? sessions.map((item) => (item.id === session.id ? session : item))
    : [...sessions, session];

  return {
    ...store,
    activeByModel: { ...store.activeByModel, [modelTag]: session.id },
    sessionsByModel: { ...store.sessionsByModel, [modelTag]: nextSessions }
  };
}

export function updateSessionMessages(
  store: ChatStore,
  modelTag: string,
  sessionId: string,
  update: (messages: ChatMessage[]) => ChatMessage[],
  now = Date.now()
): ChatStore {
  const sessions = getSessions(store, modelTag);
  const session = sessions.find((item) => item.id === sessionId);
  if (!session) return store;

  const messages = update(session.messages);
  const title = session.title || deriveSessionTitle(messages);
  return upsertSession(store, modelTag, {
    ...session,
    title,
    messages,
    updatedAt: now
  });
}

export function removeSession(store: ChatStore, modelTag: string, sessionId: string): ChatStore {
  const sessions = getSessions(store, modelTag);
  const nextSessions = sessions.filter((session) => session.id !== sessionId);
  if (nextSessions.length === sessions.length) return store;
  const nextActive =
    store.activeByModel[modelTag] === sessionId
      ? nextSessions[nextSessions.length - 1]?.id
      : store.activeByModel[modelTag];

  const activeByModel = { ...store.activeByModel };
  if (nextActive) activeByModel[modelTag] = nextActive;
  else delete activeByModel[modelTag];

  return {
    ...store,
    activeByModel,
    sessionsByModel: { ...store.sessionsByModel, [modelTag]: nextSessions }
  };
}

export function renameSession(
  store: ChatStore,
  modelTag: string,
  sessionId: string,
  title: string
): ChatStore {
  return {
    ...store,
    sessionsByModel: {
      ...store.sessionsByModel,
      [modelTag]: getSessions(store, modelTag).map((session) =>
        session.id === sessionId
          ? { ...session, title: title.trim(), updatedAt: Date.now() }
          : session
      )
    }
  };
}

/** Converts the v1 shape `{ [modelTag]: ChatMessage[] }` into a v2 store. */
export function migrateLegacySessions(legacy: unknown): ChatStore {
  const store = createEmptyStore();
  if (!isRecord(legacy)) return store;

  for (const [modelTag, value] of Object.entries(legacy)) {
    if (!modelTag || !Array.isArray(value)) continue;
    const messages = value.filter(isChatMessage);
    if (messages.length === 0) continue;
    const session = createSession(messages);
    store.sessionsByModel[modelTag] = [session];
    store.activeByModel[modelTag] = session.id;
  }
  return store;
}

function parseStoredSession(value: unknown): ChatSession | null {
  if (!isRecord(value) || typeof value.id !== 'string') return null;
  const messages = Array.isArray(value.messages) ? value.messages.filter(isChatMessage) : [];
  const createdAt = typeof value.createdAt === 'number' ? value.createdAt : Date.now();
  return {
    id: value.id,
    title: typeof value.title === 'string' ? value.title : '',
    createdAt,
    updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : createdAt,
    messages
  };
}

export function parseChatStore(value: unknown): ChatStore | null {
  if (!isRecord(value) || value.version !== CHAT_STORE_VERSION) return null;

  const store = createEmptyStore();
  const sessionsByModel = isRecord(value.sessionsByModel) ? value.sessionsByModel : {};
  for (const [modelTag, rawSessions] of Object.entries(sessionsByModel)) {
    if (!Array.isArray(rawSessions)) continue;
    const sessions = rawSessions
      .map(parseStoredSession)
      .filter((session): session is ChatSession => session !== null);
    if (sessions.length > 0) store.sessionsByModel[modelTag] = sessions;
  }

  if (isRecord(value.activeByModel)) {
    for (const [modelTag, sessionId] of Object.entries(value.activeByModel)) {
      if (typeof sessionId !== 'string') continue;
      if (store.sessionsByModel[modelTag]?.some((s) => s.id === sessionId)) {
        store.activeByModel[modelTag] = sessionId;
      }
    }
  }

  return store;
}

export function loadChatStore(): ChatStore {
  const stored = readStorageJson<unknown>(CHAT_STORE_KEY, null);
  const parsed = parseChatStore(stored);
  if (parsed) return parsed;

  const legacy = readStorageJson<unknown>(LEGACY_CHAT_STORE_KEY, null);
  if (legacy) {
    const migrated = migrateLegacySessions(legacy);
    if (Object.keys(migrated.sessionsByModel).length > 0) {
      saveChatStore(migrated);
      removeStorageKey(LEGACY_CHAT_STORE_KEY);
    }
    return migrated;
  }

  return createEmptyStore();
}

export function saveChatStore(store: ChatStore): boolean {
  return writeStorageJson(CHAT_STORE_KEY, store);
}
