import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import type { Copy, Lang } from '../copy';
import { fill } from '../copy';
import type { OllamaData } from '../hooks/useOllamaData';
import {
  createSession,
  defaultSettings,
  getActiveSession,
  getSessions,
  loadChatStore,
  loadModelSettings,
  parseMessageSegments,
  removeSession,
  saveChatStore,
  saveModelSettings,
  setActiveSession,
  streamChat,
  updateSessionMessages,
  upsertSession
} from '../lib/legacy';
import type {
  ChatMessage,
  ChatSession,
  ChatStore,
  ModelSettings,
  OllamaModel
} from '../lib/legacy';
import { createLocalId, errorMessage, formatTime } from '../lib/format';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { EmptyState, ErrorState, LoadingState } from '../components/StateBlock';
import { Icon } from '../components/Icon';

interface ChatScreenProps {
  t: Copy;
  lang: Lang;
  ollama: OllamaData;
  selectedTag: string | null;
  onSelectModel: (model: OllamaModel) => void;
  onOpenModels: () => void;
}

function messageMeta(message: ChatMessage, t: Copy, lang: Lang): string | null {
  const parts: string[] = [];
  const time = formatTime(message.timestamp, lang);
  if (time) parts.push(time);
  if (message.duration) parts.push(`${message.duration} ${t.common.seconds}`);
  if (message.totalTokens != null) parts.push(`${message.totalTokens} ${t.common.tokens}`);
  if (message.tokensPerSecond != null) {
    parts.push(`${message.tokensPerSecond.toFixed(1)} ${t.common.perSecond}`);
  }
  return parts.length ? parts.join(lang === 'zh' ? '，' : ', ') : null;
}

interface MessageArticleProps {
  message: ChatMessage;
  t: Copy;
  lang: Lang;
  generating: boolean;
  copiedKey: string | null;
  copyFailedKey: string | null;
  onCopy: (text: string, key: string) => void;
}

function MessageArticle({
  message,
  t,
  lang,
  generating,
  copiedKey,
  copyFailedKey,
  onCopy
}: MessageArticleProps) {
  const segments = parseMessageSegments(message.content);
  const meta = messageMeta(message, t, lang);
  const isUser = message.role === 'user';

  return (
    <article className={`message message--${message.role}`}>
      <span className="message__role">{isUser ? t.chat.you : t.chat.assistant}</span>
      <div className="message__body">
        {message.thinkingContent ? (
          <details className="details message__thinking">
            <summary className="details__summary">{t.chat.thinking}</summary>
            <div className="details__body">
              <p className="message__text">{message.thinkingContent}</p>
            </div>
          </details>
        ) : null}

        {segments.map((segment, index) => {
          if (segment.type === 'text') {
            if (!segment.content.trim()) return null;
            return (
              <div className="message__text" key={`text-${index}`}>
                {segment.content}
              </div>
            );
          }

          const key = `${message.id}-${index}`;
          const language = segment.language?.trim();
          return (
            <div className="code-block" key={key}>
              <div className="code-block__head">
                <span className="code-block__lang">{language || t.common.code}</span>
                <button
                  type="button"
                  className="btn btn--quiet btn--small"
                  onClick={() => onCopy(segment.content, key)}
                >
                  {copiedKey === key
                    ? t.common.copied
                    : copyFailedKey === key
                      ? t.common.copyFailed
                      : t.common.copy}
                </button>
              </div>
              <pre className="code-block__code">
                <code>{segment.content}</code>
              </pre>
            </div>
          );
        })}

        {generating ? <p className="message__meta">{t.chat.generating}</p> : null}
        {meta ? <p className="message__meta measured">{meta}</p> : null}
      </div>
    </article>
  );
}

export function ChatScreen({
  t,
  lang,
  ollama,
  selectedTag,
  onSelectModel,
  onOpenModels
}: ChatScreenProps) {
  const models = ollama.models;
  const model = models.find((item) => item.fullTag === selectedTag) ?? models[0] ?? null;
  const modelTag = model?.fullTag ?? null;

  const [store, setStore] = useState<ChatStore>(() => loadChatStore());
  const storeRef = useRef(store);
  const [settingsState, setSettingsState] = useState<{ tag: string; value: ModelSettings } | null>(
    () =>
      model
        ? { tag: model.fullTag, value: loadModelSettings(model.fullTag, defaultSettings(model)) }
        : null
  );
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [forceJson, setForceJson] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stopped, setStopped] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ChatSession | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [copyFailedKey, setCopyFailedKey] = useState<string | null>(null);
  const streamingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const copyTimerRef = useRef<number | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!model) {
      setSettingsState(null);
      return;
    }
    setSettingsState((current) =>
      current?.tag === model.fullTag
        ? current
        : { tag: model.fullTag, value: loadModelSettings(model.fullTag, defaultSettings(model)) }
    );
  }, [model]);

  useEffect(() => {
    abortRef.current?.abort();
  }, [modelTag]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (copyTimerRef.current != null) window.clearTimeout(copyTimerRef.current);
    };
  }, []);

  const applyStore = (next: ChatStore, persist: boolean) => {
    storeRef.current = next;
    setStore(next);
    if (persist) saveChatStore(next);
  };

  const sessions = modelTag ? getSessions(store, modelTag) : [];
  const sortedSessions = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt);
  const activeSession = modelTag ? getActiveSession(store, modelTag) : null;
  const messages = useMemo(() => activeSession?.messages ?? [], [activeSession]);
  const settings = modelTag && settingsState?.tag === modelTag ? settingsState.value : null;
  const effectiveSettings = model
    ? (settings ?? loadModelSettings(model.fullTag, defaultSettings(model)))
    : null;

  useEffect(() => {
    if (messages.length === 0) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    endRef.current?.scrollIntoView({
      block: 'end',
      behavior: reduceMotion ? 'auto' : 'smooth'
    });
  }, [messages]);

  const updateSetting = <K extends keyof ModelSettings>(key: K, value: ModelSettings[K]) => {
    if (!model || !effectiveSettings) return;
    const next: ModelSettings = { ...effectiveSettings, [key]: value };
    setSettingsState({ tag: model.fullTag, value: next });
    saveModelSettings(model.fullTag, next);
  };

  const send = async () => {
    const content = input.trim();
    if (!content || !model || !effectiveSettings || streamingRef.current) return;

    streamingRef.current = true;
    const history = activeSession?.messages ?? [];
    const now = new Date().toISOString();
    const userMessage: ChatMessage = {
      id: createLocalId('message'),
      role: 'user',
      content,
      timestamp: now,
      modelName: model.fullTag
    };
    const assistantMessage: ChatMessage = {
      id: createLocalId('message'),
      role: 'assistant',
      content: '',
      timestamp: now,
      modelName: model.fullTag
    };
    const session = activeSession ?? createSession([userMessage, assistantMessage]);

    const nextStore = activeSession
      ? updateSessionMessages(storeRef.current, model.fullTag, session.id, () => [
          ...history,
          userMessage,
          assistantMessage
        ])
      : upsertSession(storeRef.current, model.fullTag, session);
    applyStore(nextStore, true);
    setInput('');
    setError(null);
    setStopped(false);
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;
    const requestMessages = [...history, userMessage].map((message) => ({
      role: message.role,
      content: message.content
    }));

    try {
      await streamChat(
        {
          model: model.fullTag,
          messages: requestMessages,
          think: model.capabilities?.includes('thinking') ? true : undefined,
          format: forceJson ? 'json' : undefined,
          keep_alive: effectiveSettings.keepAlive,
          options: {
            temperature: effectiveSettings.temperature,
            top_p: effectiveSettings.topP,
            num_ctx: effectiveSettings.numCtx,
            repeat_penalty: effectiveSettings.repeatPenalty
          }
        },
        {
          onChunk: (chunk) => {
            const text = chunk.message?.content ?? '';
            const thinking = chunk.message?.thinking ?? '';
            if (!text && !thinking) return;
            const next = updateSessionMessages(
              storeRef.current,
              model.fullTag,
              session.id,
              (current) =>
                current.map((message) =>
                  message.id === assistantMessage.id
                    ? {
                        ...message,
                        content: message.content + text,
                        thinkingContent: `${message.thinkingContent ?? ''}${thinking}`
                      }
                    : message
                )
            );
            applyStore(next, false);
          },
          onDone: (chunk) => {
            const duration =
              chunk.total_duration != null ? (chunk.total_duration / 1e9).toFixed(1) : undefined;
            const tokensPerSecond =
              chunk.eval_count != null && chunk.eval_duration
                ? chunk.eval_count / (chunk.eval_duration / 1e9)
                : undefined;
            const next = updateSessionMessages(
              storeRef.current,
              model.fullTag,
              session.id,
              (current) =>
                current.map((message) =>
                  message.id === assistantMessage.id
                    ? {
                        ...message,
                        duration,
                        totalTokens: chunk.eval_count,
                        tokensPerSecond
                      }
                    : message
                )
            );
            applyStore(next, true);
          }
        },
        controller.signal
      );
      saveChatStore(storeRef.current);
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === 'AbortError') {
        setStopped(true);
      } else {
        setError(errorMessage(caught) || t.common.unknownError);
      }
      const next = updateSessionMessages(storeRef.current, model.fullTag, session.id, (current) =>
        current.filter(
          (message) =>
            message.id !== assistantMessage.id || message.content || message.thinkingContent
        )
      );
      applyStore(next, true);
    } finally {
      streamingRef.current = false;
      abortRef.current = null;
      setStreaming(false);
    }
  };

  const handleSend = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void send();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void send();
    }
  };

  const stop = () => {
    abortRef.current?.abort();
  };

  const startNewSession = () => {
    if (!model || streamingRef.current) return;
    const session = createSession();
    applyStore(upsertSession(storeRef.current, model.fullTag, session), true);
    setInput('');
    setError(null);
    setStopped(false);
  };

  const selectSession = (session: ChatSession) => {
    if (!model || streamingRef.current) return;
    applyStore(setActiveSession(storeRef.current, model.fullTag, session.id), true);
    setError(null);
    setStopped(false);
  };

  const confirmDelete = () => {
    if (!model || !deleteTarget) return;
    abortRef.current?.abort();
    applyStore(removeSession(storeRef.current, model.fullTag, deleteTarget.id), true);
    setDeleteTarget(null);
    setError(null);
    setStopped(false);
  };

  const changeModel = (tag: string) => {
    const next = models.find((item) => item.fullTag === tag);
    if (!next || next.fullTag === model?.fullTag || streamingRef.current) return;
    setInput('');
    setError(null);
    setStopped(false);
    onSelectModel(next);
  };

  const copyCode = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setCopyFailedKey(null);
    } catch {
      setCopiedKey(null);
      setCopyFailedKey(key);
    }
    if (copyTimerRef.current != null) window.clearTimeout(copyTimerRef.current);
    copyTimerRef.current = window.setTimeout(() => {
      setCopiedKey(null);
      setCopyFailedKey(null);
    }, 2000);
  };

  const modelStatus = model
    ? model.status === 'running'
      ? t.common.loaded
      : t.common.notLoaded
    : null;

  return (
    <>
      <div className="screen">
        <header className="screen__head">
          <div className="screen__head-main">
            <h1>{t.chat.title}</h1>
            <p className="screen__lede">{t.chat.lede}</p>
          </div>
          <div className="screen__actions">
            <button
              type="button"
              className="btn btn--quiet"
              onClick={startNewSession}
              disabled={!model || streaming}
            >
              <Icon name="add" />
              {t.chat.newSession}
            </button>
          </div>
        </header>

        {model ? (
          <div className="chat-layout">
            <aside className="panel chat-sessions">
              <div className="panel__head">
                <h2 className="panel__title">{t.chat.sessions}</h2>
                <span className="panel__meta">{sessions.length}</span>
              </div>

              <div className="panel__body stack">
                {sortedSessions.length > 0 ? (
                  <div className="session-list">
                    {sortedSessions.map((session) => (
                      <button
                        key={session.id}
                        type="button"
                        className="session-button"
                        aria-current={activeSession?.id === session.id ? 'true' : undefined}
                        onClick={() => selectSession(session)}
                        disabled={streaming}
                      >
                        <span className="session-button__title">
                          {session.title || t.chat.newSession}
                        </span>
                        <span className="session-button__meta">
                          {formatTime(session.updatedAt, lang) ?? ''}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="state state--compact">
                    <p className="state__text">{t.chat.noSessions}</p>
                    <p className="state__text">{t.chat.noSessionsText}</p>
                  </div>
                )}
              </div>

              <div className="panel__foot">
                <button
                  type="button"
                  className="btn btn--danger btn--small"
                  onClick={() => setDeleteTarget(activeSession)}
                  disabled={!activeSession || streaming}
                >
                  {t.chat.deleteSession}
                </button>
              </div>
            </aside>

            <section className="panel chat-panel">
              <div className="chat-toolbar">
                <div className="chat-toolbar__group">
                  <label className="chat-toolbar__label" htmlFor="chat-model">
                    {t.chat.model}
                  </label>
                  <select
                    id="chat-model"
                    className="select"
                    value={model.fullTag}
                    onChange={(event) => changeModel(event.target.value)}
                    disabled={streaming}
                  >
                    {models.map((item) => (
                      <option key={item.id} value={item.fullTag}>
                        {item.fullTag}
                      </option>
                    ))}
                  </select>
                </div>
                <span className={model.status === 'running' ? 'chip chip--ok' : 'chip chip--plain'}>
                  {modelStatus}
                </span>
              </div>

              {effectiveSettings ? (
                <details className="details chat-params">
                  <summary className="details__summary">{t.chat.parameters}</summary>
                  <div className="details__body chat-params__body">
                    <div className="form-row">
                      <div className="field">
                        <label className="field__label" htmlFor="chat-temperature">
                          {t.chat.temperature}
                        </label>
                        <input
                          id="chat-temperature"
                          className="input"
                          type="number"
                          inputMode="decimal"
                          step="0.1"
                          min="0"
                          max="2"
                          value={effectiveSettings.temperature}
                          onChange={(event) =>
                            updateSetting('temperature', Number(event.target.value))
                          }
                        />
                      </div>
                      <div className="field">
                        <label className="field__label" htmlFor="chat-top-p">
                          {t.chat.topP}
                        </label>
                        <input
                          id="chat-top-p"
                          className="input"
                          type="number"
                          inputMode="decimal"
                          step="0.05"
                          min="0"
                          max="1"
                          value={effectiveSettings.topP}
                          onChange={(event) => updateSetting('topP', Number(event.target.value))}
                        />
                      </div>
                      <div className="field">
                        <label className="field__label" htmlFor="chat-num-ctx">
                          {t.chat.numCtx}
                        </label>
                        <input
                          id="chat-num-ctx"
                          className="input"
                          type="number"
                          inputMode="numeric"
                          step="128"
                          min="128"
                          value={effectiveSettings.numCtx}
                          onChange={(event) => updateSetting('numCtx', Number(event.target.value))}
                        />
                      </div>
                      <div className="field">
                        <label className="field__label" htmlFor="chat-repeat-penalty">
                          {t.chat.repeatPenalty}
                        </label>
                        <input
                          id="chat-repeat-penalty"
                          className="input"
                          type="number"
                          inputMode="decimal"
                          step="0.05"
                          min="0.1"
                          max="3"
                          value={effectiveSettings.repeatPenalty}
                          onChange={(event) =>
                            updateSetting('repeatPenalty', Number(event.target.value))
                          }
                        />
                      </div>
                      <div className="field">
                        <label className="field__label" htmlFor="chat-keep-alive">
                          {t.chat.keepAlive}
                        </label>
                        <input
                          id="chat-keep-alive"
                          className="input"
                          value={String(effectiveSettings.keepAlive)}
                          onChange={(event) => updateSetting('keepAlive', event.target.value)}
                          autoComplete="off"
                          spellCheck={false}
                        />
                      </div>
                    </div>
                    <label className="check-row">
                      <input
                        type="checkbox"
                        checked={forceJson}
                        onChange={(event) => setForceJson(event.target.checked)}
                      />
                      <span>{t.chat.forceJson}</span>
                    </label>
                    <p className="field__help">{t.chat.parametersHint}</p>
                  </div>
                </details>
              ) : null}

              <div className="chat-log">
                {messages.length === 0 ? (
                  <div className="chat-empty">
                    <p className="chat-empty__title">{t.chat.emptyTitle}</p>
                    <p className="chat-empty__text">{t.chat.emptyText}</p>
                  </div>
                ) : (
                  messages.map((message, index) => (
                    <MessageArticle
                      key={message.id}
                      message={message}
                      t={t}
                      lang={lang}
                      generating={
                        streaming &&
                        index === messages.length - 1 &&
                        message.role === 'assistant' &&
                        !message.content &&
                        !message.thinkingContent
                      }
                      copiedKey={copiedKey}
                      copyFailedKey={copyFailedKey}
                      onCopy={(text, key) => void copyCode(text, key)}
                    />
                  ))
                )}
                {messages.length > 0 ? <div ref={endRef} /> : null}
              </div>

              <form className="composer" onSubmit={handleSend}>
                <div className="field">
                  <label className="field__label" htmlFor="chat-input">
                    {t.chat.messageLabel}
                  </label>
                  <textarea
                    id="chat-input"
                    className="textarea"
                    rows={3}
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={t.chat.messagePlaceholder}
                  />
                </div>

                {error ? (
                  <p className="error-text" role="alert">
                    {t.chat.sendError}: {error}
                  </p>
                ) : null}
                {stopped ? (
                  <p className="field__help" role="status">
                    {t.chat.stopped}
                  </p>
                ) : null}

                <div className="composer__actions">
                  <span className="composer__hint">
                    {t.chat.attachments}{' '}
                    <a className="link" href="/">
                      {t.app.classic}
                    </a>
                  </span>
                  <div className="actions-row actions-row--end">
                    {streaming ? (
                      <button type="button" className="btn btn--danger" onClick={stop}>
                        {t.chat.stop}
                      </button>
                    ) : (
                      <button type="submit" className="btn btn--primary" disabled={!input.trim()}>
                        {t.chat.send}
                      </button>
                    )}
                  </div>
                </div>
              </form>
            </section>
          </div>
        ) : ollama.status === 'offline' ? (
          <section className="panel">
            <ErrorState
              title={t.chat.noModel}
              text={`${t.errors.ollama} ${ollama.error ?? ''}`}
              retry={() => void ollama.refresh()}
              retryLabel={t.common.retry}
            />
          </section>
        ) : ollama.status === 'connecting' && ollama.lastUpdated == null ? (
          <section className="panel">
            <LoadingState text={t.common.loading} rows={3} />
          </section>
        ) : (
          <section className="panel">
            <EmptyState
              title={t.chat.noModel}
              text={t.chat.noModelText}
              action={
                <button type="button" className="btn btn--quiet" onClick={onOpenModels}>
                  {t.runtime.openModels}
                </button>
              }
            />
          </section>
        )}
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        title={t.chat.deleteSessionTitle}
        confirmLabel={t.chat.deleteSession}
        cancelLabel={t.common.cancel}
        danger
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      >
        {deleteTarget ? (
          <p className="state__text">
            {fill(t.chat.deleteSessionText, {
              title: deleteTarget.title || t.chat.newSession
            })}
          </p>
        ) : null}
      </ConfirmDialog>
    </>
  );
}
