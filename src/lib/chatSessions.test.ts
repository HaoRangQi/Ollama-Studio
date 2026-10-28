import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage } from '../types';
import {
  CHAT_STORE_KEY,
  LEGACY_CHAT_STORE_KEY,
  createEmptyStore,
  createSession,
  deriveSessionTitle,
  getActiveSession,
  getSessions,
  loadChatStore,
  migrateLegacySessions,
  parseChatStore,
  removeSession,
  renameSession,
  saveChatStore,
  setActiveSession,
  updateSessionMessages,
  upsertSession
} from './chatSessions';

function message(id: string, role: ChatMessage['role'], content: string): ChatMessage {
  return { id, role, content, timestamp: '12:00' };
}

function installStorage() {
  const data = new Map<string, string>();
  const localStorage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    }
  };
  vi.stubGlobal('window', { localStorage });
  return data;
}

describe('deriveSessionTitle', () => {
  it('uses the first user message and collapses whitespace', () => {
    expect(
      deriveSessionTitle([
        message('1', 'assistant', 'assistant first'),
        message('2', 'user', '  hello\n  world  ')
      ])
    ).toBe('hello world');
  });

  it('truncates long titles', () => {
    const title = deriveSessionTitle([message('1', 'user', 'x'.repeat(100))]);
    expect(title).toHaveLength(41);
    expect(title.endsWith('…')).toBe(true);
  });

  it('returns empty when there is no user message', () => {
    expect(deriveSessionTitle([])).toBe('');
  });
});

describe('chat session store operations', () => {
  it('creates, updates, activates and removes sessions', () => {
    let store = createEmptyStore();
    const first = createSession([message('1', 'user', 'first question')], 100);
    store = upsertSession(store, 'model:a', first);
    expect(getSessions(store, 'model:a')).toHaveLength(1);
    expect(getActiveSession(store, 'model:a')?.id).toBe(first.id);

    store = updateSessionMessages(
      store,
      'model:a',
      first.id,
      (messages) => [...messages, message('2', 'assistant', 'answer')],
      200
    );
    expect(getActiveSession(store, 'model:a')?.messages).toHaveLength(2);
    expect(getActiveSession(store, 'model:a')?.updatedAt).toBe(200);

    const second = createSession([], 300);
    store = upsertSession(store, 'model:a', second);
    expect(getActiveSession(store, 'model:a')?.id).toBe(second.id);

    store = setActiveSession(store, 'model:a', first.id);
    expect(getActiveSession(store, 'model:a')?.id).toBe(first.id);

    store = removeSession(store, 'model:a', first.id);
    expect(getSessions(store, 'model:a').map((session) => session.id)).toEqual([second.id]);
    expect(getActiveSession(store, 'model:a')?.id).toBe(second.id);
  });

  it('renames a session', () => {
    const session = createSession([], 1);
    let store = upsertSession(createEmptyStore(), 'm', session);
    store = renameSession(store, 'm', session.id, '  renamed  ');
    expect(getActiveSession(store, 'm')?.title).toBe('renamed');
  });

  it('ignores unknown session ids', () => {
    const store = createEmptyStore();
    expect(setActiveSession(store, 'm', 'missing')).toBe(store);
    expect(removeSession(store, 'm', 'missing')).toEqual(store);
  });
});

describe('migration and parsing', () => {
  it('migrates the v1 shape into one session per model', () => {
    const migrated = migrateLegacySessions({
      'model:a': [message('1', 'user', 'legacy question')],
      'model:b': []
    });
    expect(Object.keys(migrated.sessionsByModel)).toEqual(['model:a']);
    expect(getActiveSession(migrated, 'model:a')?.messages).toHaveLength(1);
  });

  it('rejects stores with an unexpected version', () => {
    expect(parseChatStore({ version: 1, sessionsByModel: {} })).toBeNull();
    expect(parseChatStore(null)).toBeNull();
  });

  it('filters malformed messages while parsing', () => {
    const parsed = parseChatStore({
      version: 2,
      activeByModel: { m: 's1' },
      sessionsByModel: {
        m: [
          {
            id: 's1',
            title: 'ok',
            createdAt: 1,
            updatedAt: 2,
            messages: [message('1', 'user', 'hi'), { bad: true }]
          }
        ]
      }
    });
    expect(parsed?.sessionsByModel.m[0].messages).toHaveLength(1);
    expect(parsed?.activeByModel.m).toBe('s1');
  });
});

describe('loadChatStore', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads a v2 store', () => {
    const storage = installStorage();
    const session = createSession([message('1', 'user', 'hello')], 10);
    const store = upsertSession(createEmptyStore(), 'm', session);
    storage.set(CHAT_STORE_KEY, JSON.stringify(store));

    expect(loadChatStore().sessionsByModel.m).toHaveLength(1);
  });

  it('migrates and removes the legacy key', () => {
    const storage = installStorage();
    storage.set(LEGACY_CHAT_STORE_KEY, JSON.stringify({ m: [message('1', 'user', 'legacy')] }));

    const store = loadChatStore();
    expect(store.sessionsByModel.m).toHaveLength(1);
    expect(storage.has(LEGACY_CHAT_STORE_KEY)).toBe(false);
    expect(storage.has(CHAT_STORE_KEY)).toBe(true);
  });

  it('returns an empty store for malformed JSON', () => {
    const storage = installStorage();
    storage.set(CHAT_STORE_KEY, '{not json');
    expect(loadChatStore()).toEqual(createEmptyStore());
  });

  it('persists through saveChatStore', () => {
    const storage = installStorage();
    const store = upsertSession(createEmptyStore(), 'm', createSession([], 1));
    expect(saveChatStore(store)).toBe(true);
    expect(storage.has(CHAT_STORE_KEY)).toBe(true);
  });
});
