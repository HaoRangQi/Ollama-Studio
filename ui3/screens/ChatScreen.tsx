import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, KeyboardEvent } from 'react';
import { useTheme } from '../context/ThemeContext';
import {
  MAX_ATTACHMENTS,
  OllamaError,
  attachmentImages,
  createAttachment,
  createSession,
  getActiveSession,
  getSessions,
  isSupportedAttachment,
  loadChatStore,
  parseMessageSegments,
  removeSession,
  renameSession,
  saveChatStore,
  setActiveSession,
  streamChat,
  updateSessionMessages,
  upsertSession
} from '../lib/legacy';
import type {
  ChatAttachment,
  ChatMessage,
  ChatSession,
  ChatStore,
  KeepAlive,
  ModelSettings,
  OllamaChatChunk,
  OllamaChatMessage,
  OllamaModel
} from '../lib/legacy';
import { loadChatFlags, loadPersona, saveChatFlags, savePersona } from '../lib/chatFlags';
import type { ChatFlags } from '../lib/chatFlags';
import { chatOnce } from '../lib/api';
import { defaultSettings, loadModelSettings, saveModelSettings } from '../lib/legacy';
import { contextLabel, formatDateChip, shortModelName } from '../lib/format';
import { Icon } from '../components/Icon';
import { ParamsPanel } from '../components/ParamsPanel';
import { ConfirmDialog, PromptDialog } from '../components/ConfirmDialog';

export interface ChatScreenProps {
  models: OllamaModel[];
  model: OllamaModel | null;
  defaultKeepAlive: KeepAlive;
  defaultNumCtx: number;
  defaultShowThinking: boolean;
  onSelectModel: (model: OllamaModel) => void;
  onGoPull: () => void;
  notify: (message: string, tone?: 'info' | 'success' | 'warn' | 'error') => void;
}

function createMessageId(prefix: string): string {
  const api = globalThis.crypto;
  if (api && typeof api.randomUUID === 'function') return `${prefix}-${api.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function greeting(c: ReturnType<typeof useTheme>['c']): string {
  const hour = new Date().getHours();
  if (hour < 5) return c.chat.greetingNight;
  if (hour < 9) return c.chat.greetingMorning;
  if (hour < 12) return c.chat.greetingNoon;
  if (hour < 18) return c.chat.greetingAfternoon;
  return c.chat.greetingEvening;
}

function chunkStats(chunk: OllamaChatChunk): {
  tokens?: number;
  speed?: number;
  duration?: string;
} {
  const tokens = typeof chunk.eval_count === 'number' ? chunk.eval_count : undefined;
  const speed =
    typeof chunk.eval_count === 'number' &&
    typeof chunk.eval_duration === 'number' &&
    chunk.eval_duration > 0
      ? chunk.eval_count / (chunk.eval_duration / 1_000_000_000)
      : undefined;
  const duration =
    typeof chunk.total_duration === 'number' && chunk.total_duration > 0
      ? `${(chunk.total_duration / 1_000_000_000).toFixed(1)}s`
      : undefined;
  return { tokens, speed, duration };
}

function ChatBubbleContent({
  message,
  isGenerating,
  onCopy
}: {
  message: ChatMessage;
  isGenerating: boolean;
  onCopy: (text: string) => void;
}) {
  const segments = parseMessageSegments(message.content);
  if (!message.content.trim() && isGenerating) {
    return (
      <span className="typing" aria-label="generating">
        <i />
        <i />
        <i />
      </span>
    );
  }
  if (!message.content.trim()) return null;

  return (
    <>
      {segments.map((segment, index) =>
        segment.type === 'code' ? (
          <div className="code-block" key={`${message.id}-code-${index}`}>
            <div className="code-head">
              <span>{segment.language || 'code'}</span>
              <button type="button" onClick={() => onCopy(segment.content)}>
                <Icon name="content_copy" size={13} />
                copy
              </button>
            </div>
            <pre>
              <code>{segment.content}</code>
            </pre>
          </div>
        ) : (
          <p className="bubble-text" key={`${message.id}-text-${index}`}>
            {segment.content}
          </p>
        )
      )}
    </>
  );
}

export function ChatScreen({
  models,
  model,
  defaultKeepAlive,
  defaultNumCtx,
  defaultShowThinking,
  onSelectModel,
  onGoPull,
  notify
}: ChatScreenProps) {
  const { c, language } = useTheme();
  const modelTag = model?.fullTag ?? '';

  const fallbackSettings = useMemo<ModelSettings>(() => {
    if (!model) {
      return {
        temperature: 0.7,
        topP: 0.9,
        numCtx: defaultNumCtx,
        repeatPenalty: 1.1,
        keepAlive: defaultKeepAlive
      };
    }
    return {
      ...defaultSettings(model),
      numCtx: defaultNumCtx,
      keepAlive: defaultKeepAlive
    };
  }, [defaultKeepAlive, defaultNumCtx, model]);

  const [store, setStore] = useState<ChatStore>(() => loadChatStore());
  const [settings, setSettings] = useState<ModelSettings>(() =>
    modelTag ? loadModelSettings(modelTag, fallbackSettings) : fallbackSettings
  );
  const [flags, setFlags] = useState<ChatFlags>(() =>
    modelTag ? loadChatFlags(modelTag, loadChatFlagsFallback()) : loadChatFlagsFallback()
  );
  const [persona, setPersona] = useState(() => (modelTag ? loadPersona(modelTag) : ''));

  const [inputText, setInputText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<ChatAttachment[]>([]);
  const [isProcessingAttachments, setIsProcessingAttachments] = useState(false);
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [searchSessions, setSearchSessions] = useState(false);
  const [sessionQuery, setSessionQuery] = useState('');
  const [showParamsSheet, setShowParamsSheet] = useState(false);
  const [expandedThinking, setExpandedThinking] = useState<Record<string, boolean>>({});
  const [confirmDeleteSession, setConfirmDeleteSession] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [zenMode, setZenMode] = useState(false);
  const [attachmentsHintShown, setAttachmentsHintShown] = useState(false);

  const storeRef = useRef(store);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const runIdRef = useRef(0);
  const generatingRef = useRef(false);
  const autoScrollRef = useRef(true);
  const modelMenuRef = useRef<HTMLDivElement | null>(null);

  const sessions = useMemo(() => (modelTag ? getSessions(store, modelTag) : []), [modelTag, store]);
  const activeSession = useMemo(
    () => (modelTag ? getActiveSession(store, modelTag) : null),
    [modelTag, store]
  );
  const messages = useMemo(() => activeSession?.messages ?? [], [activeSession]);
  const sortedSessions = useMemo(
    () => [...sessions].sort((a, b) => b.updatedAt - a.updatedAt),
    [sessions]
  );
  const filteredSessions = sessionQuery.trim()
    ? sortedSessions.filter((session) =>
        session.title.toLowerCase().includes(sessionQuery.trim().toLowerCase())
      )
    : sortedSessions;
  const latestAssistant = [...messages].reverse().find((message) => message.role === 'assistant');
  const supportsThinking = Boolean(model?.capabilities?.includes('thinking'));
  const supportsVision = Boolean(model?.capabilities?.includes('vision'));
  const canSend =
    Boolean(model) &&
    (inputText.trim().length > 0 || pendingAttachments.length > 0) &&
    !isGenerating &&
    !isProcessingAttachments;

  function loadChatFlagsFallback(): ChatFlags {
    return {
      forceJson: false,
      showThinking: defaultShowThinking,
      stream: true,
      numPredict: 0
    };
  }

  useEffect(() => {
    storeRef.current = store;
    const timer = window.setTimeout(() => saveChatStore(storeRef.current), 250);
    return () => window.clearTimeout(timer);
  }, [store]);

  useEffect(() => {
    const flush = () => saveChatStore(storeRef.current);
    window.addEventListener('beforeunload', flush);
    return () => {
      window.removeEventListener('beforeunload', flush);
      flush();
    };
  }, []);

  useEffect(() => {
    if (!modelTag) {
      setSettings(fallbackSettings);
      setFlags(loadChatFlagsFallback());
      setPersona('');
      return;
    }
    setSettings(loadModelSettings(modelTag, fallbackSettings));
    setFlags(loadChatFlags(modelTag, loadChatFlagsFallback()));
    setPersona(loadPersona(modelTag));
    // fallbackSettings 由模型与全局默认值派生，只在模型切换时重置。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelTag]);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    const handlePointer = (event: PointerEvent) => {
      if (modelMenuRef.current && !modelMenuRef.current.contains(event.target as Node)) {
        setShowModelMenu(false);
      }
    };
    if (showModelMenu) document.addEventListener('pointerdown', handlePointer, true);
    return () => document.removeEventListener('pointerdown', handlePointer, true);
  }, [showModelMenu]);

  useEffect(() => {
    if (!autoScrollRef.current) return;
    endRef.current?.scrollIntoView({ behavior: isGenerating ? 'auto' : 'smooth', block: 'end' });
  }, [isGenerating, messages]);

  useEffect(() => {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${Math.min(200, Math.max(28, element.scrollHeight))}px`;
  }, [inputText]);

  const updateSettings = (patch: Partial<ModelSettings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch };
      if (modelTag) saveModelSettings(modelTag, next);
      return next;
    });
  };

  const updateFlags = (patch: Partial<ChatFlags>) => {
    setFlags((current) => {
      const next = { ...current, ...patch };
      if (modelTag) saveChatFlags(modelTag, next);
      return next;
    });
  };

  const updatePersona = (value: string) => {
    setPersona(value);
    if (modelTag) savePersona(modelTag, value);
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const incoming = Array.from(files);
    if (pendingAttachments.length + incoming.length > MAX_ATTACHMENTS) {
      notify(c.chat.attachmentLimit(MAX_ATTACHMENTS), 'warn');
      return;
    }
    if (incoming.some((file) => !isSupportedAttachment(file))) {
      notify(c.chat.attachmentUnsupported, 'warn');
      return;
    }
    if (!supportsVision && !attachmentsHintShown) {
      notify(c.chat.visionHint, 'warn');
      setAttachmentsHintShown(true);
    }

    setIsProcessingAttachments(true);
    try {
      const created: ChatAttachment[] = [];
      for (const file of incoming) created.push(await createAttachment(file));
      setPendingAttachments((current) => [...current, ...created]);
    } catch (caught) {
      notify(
        `${c.chat.attachmentFailed}: ${caught instanceof Error ? caught.message : String(caught)}`,
        'error'
      );
    } finally {
      setIsProcessingAttachments(false);
    }
  };

  const onFileInput = (event: ChangeEvent<HTMLInputElement>) => {
    void handleFiles(event.target.files);
    event.target.value = '';
  };

  const removeAttachment = (id: string) => {
    setPendingAttachments((current) => current.filter((item) => item.id !== id));
  };

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      notify(c.toast.copied, 'success');
    } catch {
      notify(c.toast.copyFailed, 'error');
    }
  };

  const ensureSession = (base: ChatStore): { store: ChatStore; sessionId: string } => {
    const existing = getActiveSession(base, modelTag);
    if (existing) return { store: base, sessionId: existing.id };
    const session = createSession([], Date.now());
    return { store: upsertSession(base, modelTag, session), sessionId: session.id };
  };

  const runCompletion = async (
    prompt: string,
    baseStore: ChatStore,
    sessionId: string,
    attachments: ChatAttachment[]
  ) => {
    if (!model || !modelTag || generatingRef.current) return;
    generatingRef.current = true;
    setIsGenerating(true);

    const startedAt = Date.now();
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const userMessage: ChatMessage = {
      id: createMessageId('user'),
      role: 'user',
      content: prompt,
      timestamp,
      attachments: attachments.length > 0 ? attachments : undefined
    };
    const assistantId = createMessageId('assistant');
    const assistantMessage: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp,
      modelName: model.name,
      thinkingContent: ''
    };

    const sessionMessages =
      getSessions(baseStore, modelTag).find((session) => session.id === sessionId)?.messages ?? [];
    const history: OllamaChatMessage[] = [
      ...(persona.trim() ? [{ role: 'system' as const, content: persona }] : []),
      ...sessionMessages
        .filter((message) => message.content.trim() || (message.attachments?.length ?? 0) > 0)
        .map((message) => ({
          role: message.role,
          content: message.content,
          ...(message.attachments?.length ? { images: attachmentImages(message.attachments) } : {})
        })),
      {
        role: 'user',
        content: prompt,
        ...(attachments.length > 0 ? { images: attachmentImages(attachments) } : {})
      }
    ];

    setStore((current) =>
      updateSessionMessages(current, modelTag, sessionId, (items) => [
        ...items,
        userMessage,
        assistantMessage
      ])
    );
    setInputText('');
    setPendingAttachments([]);
    autoScrollRef.current = true;

    const controller = new AbortController();
    abortRef.current = controller;
    const runId = ++runIdRef.current;
    let received = false;

    const applyChunk = (chunk: OllamaChatChunk, done: boolean) => {
      received = true;
      const delta = chunk.message?.content ?? '';
      const thinkingDelta = chunk.message?.thinking ?? '';
      const stats = chunkStats(chunk);
      const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);

      setStore((current) =>
        updateSessionMessages(current, modelTag, sessionId, (items) =>
          items.map((message) => {
            if (message.id !== assistantId) return message;
            const content = message.content + delta;
            const thinkingContent = (message.thinkingContent ?? '') + thinkingDelta;
            return {
              ...message,
              content,
              thinkingContent,
              totalTokens: stats.tokens ?? message.totalTokens,
              tokensPerSecond: stats.speed ?? message.tokensPerSecond,
              duration: done ? (stats.duration ?? `${elapsed}s`) : message.duration,
              thinkingTime: done && thinkingContent ? `${elapsed}s` : message.thinkingTime,
              thinkingTokens:
                done && thinkingContent
                  ? Math.max(1, Math.ceil(thinkingContent.length / 4))
                  : message.thinkingTokens
            };
          })
        )
      );
    };

    try {
      const request = {
        model: modelTag,
        messages: history,
        think: supportsThinking ? flags.showThinking : undefined,
        format: flags.forceJson ? ('json' as const) : undefined,
        keep_alive: settings.keepAlive,
        options: {
          temperature: settings.temperature,
          top_p: settings.topP,
          num_ctx: settings.numCtx,
          repeat_penalty: settings.repeatPenalty,
          ...(flags.numPredict > 0 ? { num_predict: flags.numPredict } : {})
        }
      };

      if (flags.stream) {
        await streamChat(
          request,
          {
            onChunk: (chunk) => applyChunk(chunk, chunk.done)
          },
          controller.signal
        );
      } else {
        const chunk = await chatOnce(request, controller.signal);
        applyChunk(chunk, true);
      }

      if (!received) {
        setStore((current) =>
          updateSessionMessages(current, modelTag, sessionId, (items) =>
            items.map((message) =>
              message.id === assistantId && !message.content
                ? { ...message, content: c.chat.emptyResponse }
                : message
            )
          )
        );
      }
    } catch (caught) {
      if (controller.signal.aborted) {
        setStore((current) =>
          updateSessionMessages(current, modelTag, sessionId, (items) =>
            items.map((message) =>
              message.id === assistantId
                ? { ...message, content: message.content || c.chat.stopped }
                : message
            )
          )
        );
        if (runIdRef.current === runId) notify(c.chat.stopped, 'info');
      } else {
        const detail =
          caught instanceof OllamaError || caught instanceof Error
            ? caught.message
            : String(caught);
        setStore((current) =>
          updateSessionMessages(current, modelTag, sessionId, (items) =>
            items.map((message) =>
              message.id === assistantId
                ? {
                    ...message,
                    content: message.content
                      ? `${message.content}\n\n[${c.chat.requestFailed}] ${detail}`
                      : `${c.chat.requestFailed}: ${detail}`
                  }
                : message
            )
          )
        );
        notify(c.chat.requestFailed, 'error');
      }
    } finally {
      if (runIdRef.current === runId) {
        generatingRef.current = false;
        setIsGenerating(false);
        abortRef.current = null;
      }
    }
  };

  const handleSend = (text?: string) => {
    const prompt = (text ?? inputText).trim();
    if (!model) {
      notify(c.toast.noModel, 'warn');
      return;
    }
    if (isGenerating || generatingRef.current || isProcessingAttachments) return;
    if (!prompt && pendingAttachments.length === 0) return;
    const attachments = pendingAttachments;
    const effectivePrompt = prompt || c.chat.placeholder;
    const { store: base, sessionId } = ensureSession(store);
    setStore(base);
    void runCompletion(effectivePrompt, base, sessionId, attachments);
  };

  const handleStop = () => abortRef.current?.abort();

  const handleRegenerate = (assistantId: string) => {
    if (!activeSession || isGenerating || generatingRef.current) return;
    const index = activeSession.messages.findIndex((message) => message.id === assistantId);
    if (index < 0) return;
    let userIndex = index - 1;
    while (userIndex >= 0 && activeSession.messages[userIndex].role !== 'user') userIndex -= 1;
    if (userIndex < 0) return;
    const userMessage = activeSession.messages[userIndex];
    const prompt = userMessage.content || c.chat.placeholder;
    const attachments = userMessage.attachments ?? [];
    const cleaned = updateSessionMessages(store, modelTag, activeSession.id, (items) =>
      items.slice(0, userIndex)
    );
    setStore(cleaned);
    void runCompletion(prompt, cleaned, activeSession.id, attachments);
  };

  const handleNewSession = () => {
    if (!modelTag) return;
    const session = createSession([], Date.now());
    setStore((current) => upsertSession(current, modelTag, session));
    setInputText('');
    setPendingAttachments([]);
  };

  const selectSession = (sessionId: string) => {
    setStore((current) => setActiveSession(current, modelTag, sessionId));
  };

  const deleteSession = () => {
    if (!activeSession || !modelTag) return;
    setStore((current) => removeSession(current, modelTag, activeSession.id));
    setConfirmDeleteSession(false);
    notify(c.chat.sessionDeleted, 'info');
  };

  const renameActiveSession = (title: string) => {
    if (!activeSession || !modelTag) return;
    setStore((current) => renameSession(current, modelTag, activeSession.id, title));
    setRenameOpen(false);
    notify(c.chat.sessionRenamed, 'success');
  };

  const openParams = () => setShowParamsSheet(true);

  const quickPrompts: Array<{ label: string; prompt: string; icon: string }> = [
    { label: c.chat.quickSummaryLabel, prompt: c.chat.quickSummaryPrompt, icon: 'description' },
    { label: c.chat.quickRustLabel, prompt: c.chat.quickRustPrompt, icon: 'terminal' },
    { label: c.chat.quickExplainLabel, prompt: c.chat.quickExplainPrompt, icon: 'help' },
    {
      label: c.chat.quickShortenLabel,
      prompt: c.chat.quickShortenPrompt,
      icon: 'format_align_left'
    }
  ];

  return (
    <div className={`chat-layout ${zenMode ? 'is-zen' : ''}`}>
      <section className="sessions-pane">
        <div className="pane-head">
          <span>{c.chat.sessions}</span>
          <button
            type="button"
            className="iconbtn small"
            onClick={() => {
              setSearchSessions((open) => !open);
              setSessionQuery('');
            }}
            aria-label={c.chat.searchSessions}
            title={c.chat.searchSessions}
          >
            <Icon name="search" size={18} />
          </button>
        </div>
        {searchSessions && (
          <input
            className="session-search"
            value={sessionQuery}
            onChange={(event) => setSessionQuery(event.target.value)}
            placeholder={c.chat.searchSessionsPlaceholder}
            aria-label={c.chat.searchSessionsPlaceholder}
          />
        )}
        <button type="button" className="new-chat" onClick={handleNewSession} disabled={!modelTag}>
          <Icon name="add" size={18} />
          {c.chat.newSession}
        </button>
        <div className="session-list">
          {filteredSessions.map((session: ChatSession) => (
            <button
              key={session.id}
              type="button"
              className={`session-item ${activeSession?.id === session.id ? 'is-active' : ''}`}
              onClick={() => selectSession(session.id)}
            >
              <span className="session-title">
                {activeSession?.id === session.id && <i className="session-dot" />}
                {session.title || c.chat.untitled}
              </span>
              <span className="session-meta">
                <span>{model ? shortModelName(model.fullTag) : '—'}</span>
                <span>{formatDateChip(session.updatedAt, language)}</span>
              </span>
            </button>
          ))}
          {filteredSessions.length === 0 && <p className="session-empty">{c.chat.noSession}</p>}
        </div>
      </section>

      <section className="chat-pane">
        <header className="chat-head">
          <div className="model-picker" ref={modelMenuRef}>
            <button
              type="button"
              className="model-pill"
              onClick={() => setShowModelMenu((open) => !open)}
              disabled={models.length === 0}
              title={c.chat.modelPicker}
            >
              <span className="model-dot" data-running={model?.status === 'running' || undefined} />
              <span className="model-pill-name">{model?.fullTag ?? c.chat.noModels}</span>
              <Icon name="expand_more" size={16} />
            </button>
            {showModelMenu && (
              <div className="model-menu" role="menu">
                {models.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    role="menuitem"
                    className={`model-menu-item ${item.fullTag === model?.fullTag ? 'is-active' : ''}`}
                    onClick={() => {
                      onSelectModel(item);
                      setShowModelMenu(false);
                    }}
                  >
                    <span
                      className="model-dot"
                      data-running={item.status === 'running' || undefined}
                    />
                    <span>{item.fullTag}</span>
                    <small>{item.size}</small>
                  </button>
                ))}
              </div>
            )}
          </div>
          {model && (
            <span className={`tag ${model.status === 'running' ? 'tag-sage' : 'tag-mist'}`}>
              {model.status === 'running' ? c.chat.loadedTag : c.chat.idleTag}
            </span>
          )}
          {model && <span className="head-ctx">{c.chat.ctxTag(contextLabel(model))}</span>}
          <span className="chat-head-spacer" />
          <button
            type="button"
            className="iconbtn small head-action"
            onClick={openParams}
            aria-label={c.chat.tune}
            title={c.chat.tune}
          >
            <Icon name="tune" size={19} />
          </button>
          <button
            type="button"
            className="iconbtn small"
            onClick={() => setZenMode((current) => !current)}
            aria-label={zenMode ? c.chat.shrink : c.chat.expand}
            title={zenMode ? c.chat.shrink : c.chat.expand}
          >
            <Icon name={zenMode ? 'fullscreen_exit' : 'fullscreen'} size={20} />
          </button>
          <button
            type="button"
            className="iconbtn small"
            onClick={() => setRenameOpen(true)}
            disabled={!activeSession}
            aria-label={c.chat.rename}
            title={c.chat.rename}
          >
            <Icon name="edit" size={18} />
          </button>
          <button
            type="button"
            className="iconbtn small danger-hover"
            onClick={() => setConfirmDeleteSession(true)}
            disabled={!activeSession}
            aria-label={c.chat.deleteSession}
            title={c.chat.deleteSession}
          >
            <Icon name="delete" size={18} />
          </button>
        </header>

        <div
          className="chat-scroll"
          ref={scrollRef}
          onScroll={(event) => {
            const element = event.currentTarget;
            autoScrollRef.current =
              element.scrollHeight - element.scrollTop - element.clientHeight < 120;
          }}
        >
          {messages.length === 0 ? (
            <div className="welcome">
              <span className="eyebrow">{c.app.localOnly}</span>
              <h1>
                {greeting(c)}，{c.chat.welcome}
              </h1>
              <p>{c.chat.subtitle}</p>
              {model ? (
                <div className="quick-row">
                  {quickPrompts.map((item) => (
                    <button
                      key={item.label}
                      type="button"
                      className="quick-chip"
                      onClick={() => handleSend(item.prompt)}
                      disabled={!model || isGenerating || isProcessingAttachments}
                    >
                      <Icon name={item.icon} size={16} />
                      {item.label}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="empty-model-card">
                  <span className="empty-model-icon">
                    <Icon name="deployed_code" size={24} />
                  </span>
                  <div>
                    <b>{c.chat.noModels}</b>
                    <p>{c.chat.noModelsHint}</p>
                  </div>
                  <button type="button" className="btn btn-primary" onClick={onGoPull}>
                    <Icon name="download" size={17} />
                    {c.chat.goPull}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="thread">
              {activeSession && (
                <div className="date-chip">{formatDateChip(activeSession.createdAt, language)}</div>
              )}
              {messages.map((message, index) => {
                const isUser = message.role === 'user';
                const assistant = !isUser;
                const isLastAssistant =
                  assistant && latestAssistant?.id === message.id && isGenerating;
                const thinking = message.thinkingContent?.trim() ?? '';
                const showThinking = thinking.length > 0;
                const expanded = expandedThinking[message.id] ?? false;
                return (
                  <article
                    key={message.id}
                    className={`msg ${isUser ? 'is-user' : 'is-ai'}`}
                    data-index={index}
                  >
                    <span className={`msg-avatar ${isUser ? 'is-user' : 'is-ai'}`}>
                      <Icon
                        name={isUser ? 'person' : 'sentiment_satisfied'}
                        size={18}
                        filled={isUser}
                      />
                    </span>
                    <div className="msg-body">
                      <div className="bubble">
                        {message.attachments && message.attachments.length > 0 && (
                          <div className="bubble-attachments">
                            {message.attachments.map((attachment) => (
                              <figure key={attachment.id} className="bubble-attachment">
                                <img
                                  src={attachment.dataUrls[0]}
                                  alt={attachment.name}
                                  loading="lazy"
                                />
                                {attachment.kind === 'video' && (
                                  <figcaption>
                                    <Icon name="movie" size={13} />
                                    {attachment.dataUrls.length} frames
                                  </figcaption>
                                )}
                              </figure>
                            ))}
                          </div>
                        )}
                        {showThinking && (
                          <div className="thinking">
                            <button
                              type="button"
                              className="thinking-summary"
                              onClick={() =>
                                setExpandedThinking((current) => ({
                                  ...current,
                                  [message.id]: !expanded
                                }))
                              }
                            >
                              <Icon name="auto_awesome" size={14} />
                              <span>
                                {isLastAssistant && !message.content
                                  ? c.chat.thinkingNow
                                  : c.chat.thoughtFor(message.thinkingTime ?? '—')}
                                {message.thinkingTokens
                                  ? ` · ${c.chat.thoughtSteps(Math.max(1, Math.round(message.thinkingTokens / 64)))}`
                                  : ''}
                              </span>
                              <Icon name={expanded ? 'expand_less' : 'expand_more'} size={15} />
                            </button>
                            {expanded && <pre className="thinking-body">{thinking}</pre>}
                          </div>
                        )}
                        <ChatBubbleContent
                          message={message}
                          isGenerating={Boolean(isLastAssistant)}
                          onCopy={(text) => void copyText(text)}
                        />
                      </div>
                      {isUser ? (
                        <div className="msg-meta">
                          <span>{message.timestamp}</span>
                        </div>
                      ) : (
                        <div className="msg-meta">
                          {message.content && (
                            <>
                              <button
                                type="button"
                                className="msg-action"
                                onClick={() => void copyText(message.content)}
                              >
                                <Icon name="content_copy" size={13} />
                                {c.chat.copy}
                              </button>
                              <button
                                type="button"
                                className="msg-action"
                                onClick={() => handleRegenerate(message.id)}
                                disabled={isGenerating}
                              >
                                <Icon name="refresh" size={13} />
                                {c.chat.regenerate}
                              </button>
                            </>
                          )}
                          {message.totalTokens ? (
                            <span>{c.chat.tokensLabel(message.totalTokens)}</span>
                          ) : null}
                          {message.tokensPerSecond ? (
                            <span>{c.chat.tokPerSec(message.tokensPerSecond)}</span>
                          ) : null}
                          {message.duration ? <span>{message.duration}</span> : null}
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
              <div ref={endRef} />
            </div>
          )}
        </div>

        <div className="composer">
          {pendingAttachments.length > 0 && (
            <div className="attachment-strip">
              {pendingAttachments.map((attachment) => (
                <div key={attachment.id} className="attachment-chip">
                  <img src={attachment.dataUrls[0]} alt={attachment.name} />
                  <span>{attachment.name}</span>
                  {attachment.kind === 'video' && <small>{attachment.dataUrls.length}f</small>}
                  <button
                    type="button"
                    onClick={() => removeAttachment(attachment.id)}
                    aria-label={c.chat.removeAttachment}
                  >
                    <Icon name="close" size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="composer-box">
            <textarea
              ref={textareaRef}
              className="composer-input"
              value={inputText}
              onChange={(event) => setInputText(event.target.value)}
              onKeyDown={(event: KeyboardEvent<HTMLTextAreaElement>) => {
                if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  handleSend();
                }
              }}
              placeholder={c.chat.placeholder}
              disabled={!model}
              rows={1}
            />
            <div className="composer-tools">
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={onFileInput}
              />
              <input
                ref={videoInputRef}
                type="file"
                accept="video/*"
                hidden
                onChange={onFileInput}
              />
              <button
                type="button"
                className="tool-chip"
                onClick={() => imageInputRef.current?.click()}
                disabled={!model || isProcessingAttachments}
              >
                <Icon name="image" size={15} />
                {c.chat.image}
              </button>
              <button
                type="button"
                className="tool-chip"
                onClick={() => videoInputRef.current?.click()}
                disabled={!model || isProcessingAttachments}
              >
                <Icon name="movie" size={15} />
                {c.chat.video}
              </button>
              <button
                type="button"
                className={`tool-chip ${flags.forceJson ? 'is-on' : ''}`}
                onClick={() => updateFlags({ forceJson: !flags.forceJson })}
                aria-pressed={flags.forceJson}
              >
                <Icon name="data_object" size={15} />
                {c.chat.forceJson}
              </button>
              {isProcessingAttachments && <span className="composer-note">{c.chat.attaching}</span>}
              <span className="composer-spacer" />
              {isGenerating ? (
                <button
                  type="button"
                  className="stop-btn"
                  onClick={handleStop}
                  aria-label={c.chat.stop}
                  title={c.chat.stop}
                >
                  <Icon name="stop" size={19} filled />
                </button>
              ) : (
                <button
                  type="button"
                  className="send-btn"
                  onClick={() => handleSend()}
                  disabled={!canSend}
                  aria-label={c.chat.send}
                  title={c.chat.send}
                >
                  <Icon name="arrow_upward" size={20} />
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      <aside className="rail">
        <ParamsPanel
          model={model}
          settings={settings}
          flags={flags}
          persona={persona}
          onSettings={updateSettings}
          onFlags={updateFlags}
          onPersona={updatePersona}
        />
      </aside>

      {showParamsSheet && (
        <div
          className="overlay sheet-overlay"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) setShowParamsSheet(false);
          }}
        >
          <div className="sheet" role="dialog" aria-modal="true" aria-label={c.chat.settingsSheet}>
            <div className="sheet-head">
              <h3>{c.chat.settingsSheet}</h3>
              <button
                type="button"
                className="iconbtn small"
                onClick={() => setShowParamsSheet(false)}
                aria-label={c.common.close}
              >
                <Icon name="close" size={18} />
              </button>
            </div>
            <div className="sheet-body">
              <ParamsPanel
                model={model}
                settings={settings}
                flags={flags}
                persona={persona}
                onSettings={updateSettings}
                onFlags={updateFlags}
                onPersona={updatePersona}
              />
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmDeleteSession}
        title={c.chat.deleteSession}
        confirmLabel={c.common.delete}
        cancelLabel={c.common.cancel}
        danger
        onConfirm={deleteSession}
        onCancel={() => setConfirmDeleteSession(false)}
      />
      <PromptDialog
        open={renameOpen}
        title={c.chat.rename}
        label={c.chat.sessions}
        defaultValue={activeSession?.title ?? ''}
        confirmLabel={c.common.save}
        cancelLabel={c.common.cancel}
        onConfirm={renameActiveSession}
        onCancel={() => setRenameOpen(false)}
      />
    </div>
  );
}
