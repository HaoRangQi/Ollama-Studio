import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { ChatMessage, OllamaModel } from '../types';
import { OllamaChatChunk, OllamaChatMessage, OllamaError, streamChat } from '../api/ollama';
import { useAppTheme } from '../context/ThemeContext';
import {
  createSession,
  getActiveSession,
  getSessions,
  loadChatStore,
  removeSession,
  renameSession,
  saveChatStore,
  setActiveSession,
  updateSessionMessages,
  upsertSession,
  type ChatSession,
  type ChatStore
} from '../lib/chatSessions';
import {
  defaultSettings,
  formatKeepAlive,
  loadModelSettings,
  saveModelSettings,
  type ModelSettings
} from '../lib/modelSettings';
import { parseMessageSegments } from '../lib/markdown';

const FALLBACK_SETTINGS: ModelSettings = {
  temperature: 0.6,
  topP: 0.9,
  numCtx: 8192,
  repeatPenalty: 1.1,
  keepAlive: '5m'
};

function createMessageId(prefix: string): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
    return `${prefix}-${cryptoApi.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

interface ChatScreenProps {
  currentModel: OllamaModel | null;
  models: OllamaModel[];
  onSelectModel: (model: OllamaModel) => void;
  onOpenPull?: () => void;
}

interface CodeBlockProps {
  code: string;
  language?: string;
  blockKey: string;
  copiedKey: string | null;
  onCopy: (key: string, code: string) => void;
  copyLabel: string;
  copiedLabel: string;
}

const CodeBlock: React.FC<CodeBlockProps> = ({
  code,
  language,
  blockKey,
  copiedKey,
  onCopy,
  copyLabel,
  copiedLabel
}) => {
  const copied = copiedKey === blockKey;
  return (
    <div className="w-full bg-[#0c0a12] border border-[var(--app-border)] rounded-2xl overflow-hidden shadow-xl text-white">
      <div className="flex items-center justify-between px-4 py-2.5 bg-[#1f1c2b] border-b border-white/5">
        <div className="flex items-center gap-2">
          <span
            className="material-symbols-outlined text-[16px]"
            style={{ color: 'var(--primary-tint)' }}
          >
            code
          </span>
          <span className="font-code text-[12px] font-bold text-white tracking-wide">
            {language || 'code'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {language && (
            <span className="bg-[#14121d] px-2.5 py-0.5 rounded-full text-[11px] font-code text-[#cac3d7] border border-white/5">
              {language}
            </span>
          )}
          <button
            type="button"
            onClick={() => onCopy(blockKey, code)}
            aria-label={copied ? copiedLabel : copyLabel}
            className={`flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-medium transition-all duration-150 cursor-pointer ${
              copied
                ? 'bg-[#27c93f] text-white shadow-sm'
                : 'bg-[#14121d] hover:bg-[#2b2834] text-white border border-white/5'
            }`}
          >
            <span className="material-symbols-outlined text-[14px]">
              {copied ? 'check' : 'content_copy'}
            </span>
            <span>{copied ? copiedLabel : copyLabel}</span>
          </button>
        </div>
      </div>
      <pre className="p-4 md:p-5 overflow-x-auto font-code text-[13px] text-[#e6e0f0] leading-6 bg-[#0c0a12]">
        <code>{code}</code>
      </pre>
    </div>
  );
};

export const ChatScreen: React.FC<ChatScreenProps> = ({
  currentModel,
  models,
  onSelectModel,
  onOpenPull
}) => {
  const { t, language } = useAppTheme();
  const [store, setStore] = useState<ChatStore>(() => loadChatStore());
  const [inputText, setInputText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [showParamsPanel, setShowParamsPanel] = useState(false);
  const [showSessions, setShowSessions] = useState(false);
  const [expandedThinking, setExpandedThinking] = useState<Record<string, boolean>>({});
  const [copiedCodeKey, setCopiedCodeKey] = useState<string | null>(null);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [settings, setSettings] = useState<ModelSettings>(() =>
    currentModel
      ? loadModelSettings(currentModel.fullTag, defaultSettings(currentModel))
      : FALLBACK_SETTINGS
  );

  const [systemPersona, setSystemPersona] = useState(() =>
    language === 'zh' ? '通用本地 AI 助手' : 'General local AI assistant'
  );
  const [forceJson, setForceJson] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const runIdRef = useRef(0);
  const generatingRef = useRef(false);
  const currentModelRef = useRef(currentModel);
  const storeRef = useRef(store);

  const modelTag = currentModel?.fullTag ?? '';
  const sessions = modelTag ? getSessions(store, modelTag) : [];
  const activeSession = modelTag ? getActiveSession(store, modelTag) : null;
  const messages = useMemo(() => activeSession?.messages ?? [], [activeSession]);
  const sortedSessions = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt);
  const latestAssistant = [...messages].reverse().find((message) => message.role === 'assistant');

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isGenerating]);

  // Persist sessions with a short debounce; streaming updates arrive per token.
  useEffect(() => {
    storeRef.current = store;
    const timer = window.setTimeout(() => saveChatStore(store), 300);
    return () => window.clearTimeout(timer);
  }, [store]);

  // Flush the latest sessions when the tab closes or the screen unmounts.
  useEffect(() => {
    const flush = () => saveChatStore(storeRef.current);
    window.addEventListener('beforeunload', flush);
    return () => {
      window.removeEventListener('beforeunload', flush);
      saveChatStore(storeRef.current);
    };
  }, []);

  useEffect(() => {
    currentModelRef.current = currentModel;
  }, [currentModel]);

  // Load per-model defaults and stop any in-flight generation on model switch.
  // Keyed by tag so a background refresh that recreates the object does not
  // abort an active stream.
  useEffect(() => {
    abortRef.current?.abort();
    runIdRef.current += 1;
    generatingRef.current = false;
    setIsGenerating(false);
    setShowModelDropdown(false);
    setShowSessions(false);
    setShowParamsPanel(false);
    setEditingSessionId(null);
    const model = currentModelRef.current;
    if (!model) return;
    setSettings(loadModelSettings(model.fullTag, defaultSettings(model)));
  }, [modelTag]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const updateSettings = (patch: Partial<ModelSettings>) => {
    if (!currentModel) return;
    const next = { ...settings, ...patch };
    setSettings(next);
    saveModelSettings(currentModel.fullTag, next);
  };

  const toggleThinking = (id: string) => {
    setExpandedThinking((previous) => ({ ...previous, [id]: !previous[id] }));
  };

  const handleCopyCode = (key: string, code: string) => {
    void navigator.clipboard?.writeText(code);
    setCopiedCodeKey(key);
    showToast(t.chat.codeCopied);
    window.setTimeout(() => setCopiedCodeKey(null), 2000);
  };

  const selectSession = (sessionId: string) => {
    setStore((previous) => setActiveSession(previous, modelTag, sessionId));
    setShowSessions(false);
  };

  const handleNewSession = () => {
    abortRef.current?.abort();
    runIdRef.current += 1;
    generatingRef.current = false;
    setIsGenerating(false);
    if (!modelTag) return;
    const session = createSession([], Date.now());
    setStore((previous) => upsertSession(previous, modelTag, session));
    setShowSessions(false);
    showToast(t.chat.newSession);
  };

  const handleDeleteSession = (sessionId: string) => {
    const confirmed = window.confirm(
      language === 'zh'
        ? '删除这个会话？此操作不可撤销。'
        : 'Delete this session? This cannot be undone.'
    );
    if (!confirmed) return;
    if (activeSession?.id === sessionId) {
      abortRef.current?.abort();
      runIdRef.current += 1;
      generatingRef.current = false;
      setIsGenerating(false);
    }
    setStore((previous) => removeSession(previous, modelTag, sessionId));
  };

  const beginRename = (session: ChatSession) => {
    setEditingSessionId(session.id);
    setRenameValue(session.title);
  };

  const commitRename = (sessionId: string) => {
    setStore((previous) => renameSession(previous, modelTag, sessionId, renameValue));
    setEditingSessionId(null);
  };

  const ensureSession = (base: ChatStore): { store: ChatStore; sessionId: string } => {
    const existing = getActiveSession(base, modelTag);
    if (existing) return { store: base, sessionId: existing.id };
    const session = createSession([], Date.now());
    return {
      store: upsertSession(base, modelTag, session),
      sessionId: session.id
    };
  };

  const startCompletion = async (prompt: string, baseStore: ChatStore, sessionId: string) => {
    if (!currentModel || !modelTag || generatingRef.current) return;
    generatingRef.current = true;

    const startedAt = Date.now();
    const timestamp = new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    });
    const userMsg: ChatMessage = {
      id: createMessageId('user'),
      role: 'user',
      content: prompt,
      timestamp
    };
    const assistantId = createMessageId('assistant');
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp,
      modelName: currentModel.name,
      thinkingContent: ''
    };

    const sessionMessages =
      getSessions(baseStore, modelTag).find((session) => session.id === sessionId)?.messages ?? [];
    const history: OllamaChatMessage[] = [
      ...(systemPersona.trim() ? [{ role: 'system' as const, content: systemPersona }] : []),
      ...sessionMessages
        .filter((message) => message.content.trim())
        .map((message) => ({
          role: message.role,
          content: message.content
        })),
      { role: 'user', content: prompt }
    ];

    setStore((previous) =>
      updateSessionMessages(previous, modelTag, sessionId, (current) => [
        ...current,
        userMsg,
        assistantMsg
      ])
    );
    setExpandedThinking((previous) => ({ ...previous, [assistantId]: true }));
    setIsGenerating(true);
    setInputText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    const controller = new AbortController();
    abortRef.current = controller;
    const runId = ++runIdRef.current;
    let received = false;

    try {
      await streamChat(
        {
          model: currentModel.fullTag,
          messages: history,
          think: currentModel.capabilities?.includes('thinking') ? true : undefined,
          format: forceJson ? 'json' : undefined,
          keep_alive: settings.keepAlive,
          options: {
            temperature: settings.temperature,
            top_p: settings.topP,
            num_ctx: settings.numCtx,
            repeat_penalty: settings.repeatPenalty
          }
        },
        {
          onChunk: (chunk: OllamaChatChunk) => {
            received = true;
            const delta = chunk.message?.content ?? '';
            const thinkingDelta = chunk.message?.thinking ?? '';
            const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
            const tokensPerSecond =
              typeof chunk.eval_count === 'number' &&
              typeof chunk.eval_duration === 'number' &&
              chunk.eval_duration > 0
                ? chunk.eval_count / (chunk.eval_duration / 1_000_000_000)
                : undefined;

            setStore((previous) =>
              updateSessionMessages(previous, modelTag, sessionId, (current) =>
                current.map((message) => {
                  if (message.id !== assistantId) return message;
                  const content = message.content + delta;
                  const thinkingContent = (message.thinkingContent ?? '') + thinkingDelta;
                  return {
                    ...message,
                    content,
                    thinkingContent,
                    totalTokens: chunk.eval_count ?? message.totalTokens,
                    tokensPerSecond: tokensPerSecond ?? message.tokensPerSecond,
                    duration: chunk.done
                      ? chunk.total_duration
                        ? `${(chunk.total_duration / 1_000_000_000).toFixed(1)}s`
                        : `${elapsed}s`
                      : message.duration,
                    thinkingTime:
                      chunk.done && thinkingContent ? `${elapsed}s` : message.thinkingTime,
                    thinkingTokens:
                      chunk.done && thinkingContent
                        ? Math.max(1, Math.ceil(thinkingContent.length / 4))
                        : message.thinkingTokens
                  };
                })
              )
            );
          }
        },
        controller.signal
      );

      if (!received) {
        setStore((previous) =>
          updateSessionMessages(previous, modelTag, sessionId, (current) =>
            current.map((message) =>
              message.id === assistantId && !message.content
                ? { ...message, content: t.chat.emptyResponse }
                : message
            )
          )
        );
      }
    } catch (error) {
      if (controller.signal.aborted) {
        setStore((previous) =>
          updateSessionMessages(previous, modelTag, sessionId, (current) =>
            current.map((message) =>
              message.id === assistantId
                ? {
                    ...message,
                    content: message.content || t.chat.generationStopped
                  }
                : message
            )
          )
        );
        if (runIdRef.current === runId) showToast(t.chat.generationStopped);
      } else {
        const detail =
          error instanceof OllamaError || error instanceof Error ? error.message : String(error);
        setStore((previous) =>
          updateSessionMessages(previous, modelTag, sessionId, (current) =>
            current.map((message) =>
              message.id === assistantId
                ? {
                    ...message,
                    content: message.content
                      ? `${message.content}

[${language === 'zh' ? '请求中断' : 'Request interrupted'}：${detail}]`
                      : `${language === 'zh' ? '请求失败' : 'Request failed'}：${detail}`
                  }
                : message
            )
          )
        );
        if (runIdRef.current === runId) showToast(t.chat.requestFailed);
      }
    } finally {
      if (runIdRef.current === runId) {
        generatingRef.current = false;
        setIsGenerating(false);
        abortRef.current = null;
      }
    }
  };

  const handleSendMessage = (textToSend?: string) => {
    const prompt = (textToSend ?? inputText).trim();
    if (!prompt || isGenerating || generatingRef.current || !currentModel) return;
    const { store: baseStore, sessionId } = ensureSession(store);
    setStore(baseStore);
    void startCompletion(prompt, baseStore, sessionId);
  };

  const handleStop = () => {
    abortRef.current?.abort();
  };

  const handleRegenerate = (assistantId: string) => {
    if (!activeSession || isGenerating || generatingRef.current) return;
    const index = activeSession.messages.findIndex((message) => message.id === assistantId);
    if (index < 0) return;

    let userIndex = index - 1;
    while (userIndex >= 0 && activeSession.messages[userIndex].role !== 'user') {
      userIndex -= 1;
    }
    if (userIndex < 0) return;

    const prompt = activeSession.messages[userIndex].content;
    const cleaned = updateSessionMessages(store, modelTag, activeSession.id, (current) =>
      current.slice(0, userIndex)
    );
    setStore(cleaned);
    void startCompletion(prompt, cleaned, activeSession.id);
  };

  const personas =
    language === 'zh'
      ? [
          '通用本地 AI 助手',
          '资深 macOS / Metal 工程师',
          '通用全栈软件架构师',
          '严谨数学推导与算法专家',
          'Rust 底层高性能系统开发大师'
        ]
      : [
          'General local AI assistant',
          'Senior macOS / Metal engineer',
          'Full-stack software architect',
          'Rigorous math and algorithms expert',
          'Rust high-performance systems engineer'
        ];

  if (!currentModel) {
    return (
      <div className="flex flex-col w-full min-h-screen items-center justify-center px-6 text-center gap-4">
        <div
          className="w-16 h-16 rounded-3xl flex items-center justify-center border border-[var(--app-border)]"
          style={{ backgroundColor: 'var(--app-surface-high)', color: 'var(--primary-accent)' }}
        >
          <span className="material-symbols-outlined text-[34px]">chat_spark</span>
        </div>
        <h1 className="font-headline text-[22px] text-[var(--app-text)] font-bold">
          {t.chat.noModelTitle}
        </h1>
        <p className="text-[13px] text-[var(--app-text-muted)] max-w-md leading-relaxed">
          {t.chat.noModelDesc}
        </p>
        {onOpenPull && (
          <button
            onClick={onOpenPull}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-white text-[13px] font-bold cursor-pointer"
            style={{ backgroundColor: 'var(--primary-accent)' }}
          >
            <span className="material-symbols-outlined text-[20px]">cloud_download</span>
            <span>{t.chat.goPull}</span>
          </button>
        )}
      </div>
    );
  }

  const tokensPerSecondLabel =
    latestAssistant?.tokensPerSecond && latestAssistant.tokensPerSecond > 0
      ? `${latestAssistant.tokensPerSecond.toFixed(1)} tok/s`
      : '—';

  return (
    <div className="flex flex-col w-full relative min-h-screen">
      {toastMessage && (
        <div
          className="fixed top-20 right-8 z-50 text-white px-5 py-2.5 rounded-full shadow-2xl flex items-center gap-2 text-[13px] font-medium border border-white/20 animate-in slide-in-from-top-4 duration-150"
          style={{ backgroundColor: 'var(--primary-accent)' }}
        >
          <span className="material-symbols-outlined text-[18px]">verified</span>
          <span>{toastMessage}</span>
        </div>
      )}

      <div
        className="pointer-events-none absolute -top-12 left-1/4 w-96 h-96 rounded-full blur-[100px] opacity-20"
        style={{ backgroundColor: 'var(--primary-accent)' }}
      />
      <div className="pointer-events-none absolute top-1/3 -right-20 w-80 h-80 bg-[#ba4385]/15 rounded-full blur-[90px]" />

      <header className="sticky top-16 z-30 w-full px-3 sm:px-6 py-2.5 backdrop-blur-md bg-[var(--app-bg)]/85 border-b border-[var(--app-border)] select-none">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-2 sm:gap-3">
          <div className="relative">
            <button
              onClick={() => {
                setShowModelDropdown(!showModelDropdown);
                setShowParamsPanel(false);
                setShowSessions(false);
              }}
              aria-expanded={showModelDropdown}
              className="flex items-center gap-2.5 bg-[var(--app-surface-high)] hover:bg-[var(--app-surface-highest)] text-[var(--app-text)] px-4 py-2 rounded-full shadow-md transition-all duration-200 border border-[var(--app-border)] cursor-pointer max-w-[calc(100vw-2rem)]"
            >
              <div className="relative flex items-center justify-center shrink-0">
                <span className="w-2.5 h-2.5 rounded-full bg-[#27c93f] animate-pulse" />
                <span className="absolute w-4 h-4 rounded-full bg-[#27c93f]/30 animate-ping" />
              </div>
              <span className="font-headline text-[14px] sm:text-[15px] font-bold tracking-tight truncate">
                {currentModel.fullTag}
              </span>
              <span
                className="hidden sm:inline bg-[var(--app-surface)] px-2.5 py-0.5 rounded-full text-[11px] font-code tracking-wide border border-[var(--app-border)] shrink-0"
                style={{ color: 'var(--primary-accent)' }}
              >
                {currentModel.vramUsage ?? '—'}
              </span>
              <span className="material-symbols-outlined text-[18px] text-[var(--app-text-muted)] transition-transform shrink-0">
                {showModelDropdown ? 'expand_less' : 'expand_more'}
              </span>
            </button>

            {showModelDropdown && (
              <div className="absolute top-full mt-2 left-0 w-80 max-w-[calc(100vw-2rem)] bg-[var(--app-surface-high)] text-[var(--app-text)] rounded-3xl p-3 shadow-2xl z-50 border border-[var(--app-border)] animate-in fade-in zoom-in-95 duration-100">
                <div className="px-3 py-1 text-[11px] font-bold text-[var(--app-text-muted)] tracking-wider uppercase">
                  {t.cmdPalette.localWeights}
                </div>
                <div className="flex flex-col gap-1 mt-1 max-h-72 overflow-y-auto">
                  {models.map((m) => {
                    const isCurrent = m.id === currentModel.id;
                    return (
                      <button
                        key={m.id}
                        onClick={() => {
                          onSelectModel(m);
                          setShowModelDropdown(false);
                        }}
                        className={`flex items-center justify-between w-full p-2.5 rounded-2xl text-left text-[13px] transition-all cursor-pointer ${
                          isCurrent
                            ? 'text-white font-semibold shadow-md'
                            : 'hover:bg-[var(--app-surface-highest)] text-[var(--app-text-muted)]'
                        }`}
                        style={isCurrent ? { backgroundColor: 'var(--primary-accent)' } : {}}
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <span
                            className={`w-2 h-2 rounded-full shrink-0 ${
                              m.status === 'running' ? 'bg-[#27c93f]' : 'bg-[#948ea0]'
                            }`}
                          />
                          <span className="font-medium truncate">{m.fullTag}</span>
                        </span>
                        <span className="font-code text-[11px] opacity-80 shrink-0">{m.size}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center flex-wrap gap-2">
            <div className="flex items-center gap-1.5 bg-[var(--app-surface)] border border-[var(--app-border)] px-3.5 py-1.5 rounded-full shadow-sm">
              <span
                className="material-symbols-outlined text-[18px]"
                style={{ color: 'var(--primary-accent)' }}
              >
                bolt
              </span>
              <span className="text-[11px] text-[var(--app-text-muted)]">
                {t.chat.tokensPerSecond}
              </span>
              <span
                className="font-code text-[12px] font-bold"
                style={{ color: 'var(--primary-accent)' }}
              >
                {tokensPerSecondLabel}
              </span>
            </div>

            <div className="relative">
              <button
                onClick={() => {
                  setShowParamsPanel(!showParamsPanel);
                  setShowModelDropdown(false);
                  setShowSessions(false);
                }}
                aria-expanded={showParamsPanel}
                className="flex items-center gap-1.5 bg-[var(--app-surface-high)] hover:bg-[var(--app-surface-highest)] text-[var(--app-text)] px-3.5 py-1.5 rounded-full shadow-sm transition-colors border border-[var(--app-border)] cursor-pointer"
              >
                <span
                  className="material-symbols-outlined text-[18px]"
                  style={{ color: 'var(--primary-accent)' }}
                >
                  tune
                </span>
                <span className="text-[11px] font-medium">{t.models.drawerTitle}</span>
                <span className="font-code text-[10px] text-[#ffafd3] font-bold">
                  {settings.temperature.toFixed(1)} / {settings.topP.toFixed(2)} / {settings.numCtx}
                </span>
              </button>

              {showParamsPanel && (
                <div className="absolute top-full right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] bg-[var(--app-surface-high)] text-[var(--app-text)] rounded-3xl p-5 shadow-2xl z-50 border border-[var(--app-border)] flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-100">
                  <div className="flex items-center justify-between pb-1 border-b border-[var(--app-border)]">
                    <span className="font-headline text-[15px] font-bold">
                      {t.models.samplingTitle}
                    </span>
                    <button
                      onClick={() => setShowParamsPanel(false)}
                      aria-label={language === 'zh' ? '关闭' : 'Close'}
                      className="text-[var(--app-text-muted)] hover:text-[var(--app-text)] cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[18px]">close</span>
                    </button>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between text-[12px]">
                      <span className="text-[var(--app-text-muted)]">{t.models.temp}</span>
                      <span
                        className="font-code font-bold"
                        style={{ color: 'var(--primary-accent)' }}
                      >
                        {settings.temperature.toFixed(2)}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="2"
                      step="0.05"
                      aria-label={t.models.temp}
                      value={settings.temperature}
                      onChange={(e) => updateSettings({ temperature: parseFloat(e.target.value) })}
                      className="cursor-pointer w-full h-1.5 bg-[var(--app-surface)] rounded-full"
                      style={{ accentColor: 'var(--primary-accent)' }}
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between text-[12px]">
                      <span className="text-[var(--app-text-muted)]">{t.models.topP}</span>
                      <span
                        className="font-code font-bold"
                        style={{ color: 'var(--primary-accent)' }}
                      >
                        {settings.topP.toFixed(2)}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      aria-label={t.models.topP}
                      value={settings.topP}
                      onChange={(e) => updateSettings({ topP: parseFloat(e.target.value) })}
                      className="cursor-pointer w-full h-1.5 bg-[var(--app-surface)] rounded-full"
                      style={{ accentColor: 'var(--primary-accent)' }}
                    />
                  </div>

                  <div className="flex items-center justify-between gap-2 bg-[var(--app-surface)] px-4 py-2 rounded-2xl border border-[var(--app-border)]">
                    <span className="text-[11px] text-[var(--app-text-muted)]">
                      {t.models.numCtx}
                    </span>
                    <input
                      type="number"
                      min={128}
                      aria-label={t.models.numCtx}
                      value={settings.numCtx}
                      onChange={(e) => updateSettings({ numCtx: parseInt(e.target.value) || 2048 })}
                      className="w-24 bg-[var(--app-surface-high)] text-[var(--app-text)] font-code text-[12px] px-2 py-1 rounded-lg outline-none border border-[var(--app-border)]"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <span className="text-[11px] text-[var(--app-text-muted)]">
                      {t.chat.keepAlive}
                    </span>
                    <div className="grid grid-cols-4 gap-2">
                      {(['5m', '15m', '1h', -1] as const).map((value) => {
                        const active = settings.keepAlive === value;
                        return (
                          <button
                            key={String(value)}
                            type="button"
                            onClick={() => updateSettings({ keepAlive: value })}
                            className={`py-1.5 rounded-full text-[11px] font-medium transition-colors cursor-pointer ${
                              active
                                ? 'text-white'
                                : 'bg-[var(--app-surface)] text-[var(--app-text-muted)] border border-[var(--app-border)]'
                            }`}
                            style={active ? { backgroundColor: 'var(--primary-accent)' } : {}}
                          >
                            {formatKeepAlive(value)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="relative">
              <button
                onClick={() => {
                  setShowSessions(!showSessions);
                  setShowModelDropdown(false);
                  setShowParamsPanel(false);
                }}
                aria-expanded={showSessions}
                aria-label={t.chat.sessions}
                className="flex items-center gap-1.5 bg-[var(--app-surface)] hover:bg-[var(--app-surface-highest)] border border-[var(--app-border)] px-3 py-1.5 rounded-full text-[var(--app-text-muted)] hover:text-[var(--app-text)] transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">forum</span>
                <span className="text-[11px] font-bold">{sessions.length}</span>
              </button>

              {showSessions && (
                <div className="absolute top-full right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] bg-[var(--app-surface-high)] text-[var(--app-text)] rounded-3xl p-3 shadow-2xl z-50 border border-[var(--app-border)] animate-in fade-in zoom-in-95 duration-100">
                  <div className="flex items-center justify-between px-2 pb-2 border-b border-[var(--app-border)]">
                    <span className="text-[12px] font-bold">{t.chat.sessions}</span>
                    <button
                      onClick={handleNewSession}
                      className="flex items-center gap-1 px-3 py-1 rounded-full text-white text-[11px] font-bold cursor-pointer"
                      style={{ backgroundColor: 'var(--primary-accent)' }}
                    >
                      <span className="material-symbols-outlined text-[15px]">add</span>
                      <span>{t.chat.newSession}</span>
                    </button>
                  </div>
                  <div className="flex flex-col gap-1 mt-2 max-h-72 overflow-y-auto">
                    {sortedSessions.length === 0 && (
                      <p className="px-2 py-3 text-[11px] text-[var(--app-text-muted)]">
                        {t.chat.untitledSession}
                      </p>
                    )}
                    {sortedSessions.map((session) => {
                      const active = session.id === activeSession?.id;
                      const editing = editingSessionId === session.id;
                      return (
                        <div
                          key={session.id}
                          className={`flex items-center gap-1 rounded-2xl p-1 ${
                            active
                              ? 'bg-[var(--app-surface)] border border-[var(--app-border)]'
                              : ''
                          }`}
                        >
                          {editing ? (
                            <input
                              autoFocus
                              value={renameValue}
                              onChange={(e) => setRenameValue(e.target.value)}
                              onBlur={() => commitRename(session.id)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') commitRename(session.id);
                                if (e.key === 'Escape') setEditingSessionId(null);
                              }}
                              className="flex-1 min-w-0 bg-[var(--app-surface-high)] text-[12px] px-2.5 py-1.5 rounded-xl outline-none border border-[var(--primary-accent)]"
                            />
                          ) : (
                            <button
                              onClick={() => selectSession(session.id)}
                              className="flex-1 min-w-0 text-left px-2.5 py-1.5 rounded-xl hover:bg-[var(--app-surface)] cursor-pointer"
                            >
                              <span className="block text-[12px] font-medium truncate">
                                {session.title || t.chat.untitledSession}
                              </span>
                              <span className="block text-[10px] text-[var(--app-text-muted)]">
                                {new Date(session.updatedAt).toLocaleString()}
                              </span>
                            </button>
                          )}
                          <button
                            onClick={() => beginRename(session)}
                            aria-label={t.chat.renameSession}
                            title={t.chat.renameSession}
                            className="w-7 h-7 rounded-full flex items-center justify-center text-[var(--app-text-muted)] hover:text-[var(--app-text)] hover:bg-[var(--app-surface)] cursor-pointer"
                          >
                            <span className="material-symbols-outlined text-[15px]">edit</span>
                          </button>
                          <button
                            onClick={() => handleDeleteSession(session.id)}
                            aria-label={t.chat.deleteSession}
                            title={t.chat.deleteSession}
                            className="w-7 h-7 rounded-full flex items-center justify-center text-[var(--app-text-muted)] hover:text-[#ffb4ab] hover:bg-[var(--app-surface)] cursor-pointer"
                          >
                            <span className="material-symbols-outlined text-[15px]">delete</span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={handleNewSession}
              aria-label={t.chat.newSession}
              title={t.chat.newSession}
              className="w-8 h-8 rounded-full bg-[var(--app-surface)] hover:bg-[var(--app-surface-highest)] border border-[var(--app-border)] flex items-center justify-center text-[var(--app-text-muted)] hover:text-[var(--app-text)] transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">add_comment</span>
            </button>
          </div>
        </div>
      </header>

      <div className="w-full flex-1 max-w-4xl mx-auto px-4 py-8 flex flex-col gap-8 pb-56">
        <div className="flex items-center justify-center my-1">
          <span className="px-4 py-1 rounded-full bg-[var(--app-surface)] border border-[var(--app-border)] text-[11px] text-[var(--app-text-muted)] tracking-wider uppercase font-semibold">
            {t.chat.privacyBanner}
          </span>
        </div>

        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
            <div
              className="w-16 h-16 rounded-3xl flex items-center justify-center mb-2 border border-[var(--app-border)] shadow-md"
              style={{ backgroundColor: 'var(--app-surface-high)', color: 'var(--primary-accent)' }}
            >
              <span className="material-symbols-outlined text-[34px]">chat_spark</span>
            </div>
            <h3 className="font-headline text-[20px] text-[var(--app-text)] font-bold">
              {t.chat.emptyWelcome} {currentModel.name}
            </h3>
            <p className="text-[13px] text-[var(--app-text-muted)] max-w-md leading-relaxed">
              {t.chat.emptyDesc}
            </p>
          </div>
        )}

        {messages.map((msg) => {
          if (msg.role === 'user') {
            return (
              <div
                key={msg.id}
                className="flex flex-col items-end gap-1.5 max-w-2xl ml-auto w-full group"
              >
                <div className="flex items-center gap-2 pr-2">
                  <span className="text-[11px] text-[var(--app-text-muted)] font-medium">
                    {t.chat.you}
                  </span>
                  <span className="text-[11px] text-[var(--app-text-muted)] opacity-70">
                    {msg.timestamp}
                  </span>
                </div>
                <div
                  className="text-white p-4 md:p-5 rounded-3xl rounded-br-sm shadow-md transition-transform leading-relaxed text-[15px] font-normal"
                  style={{ backgroundColor: 'var(--primary-accent)' }}
                >
                  <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                </div>
              </div>
            );
          }

          const isThinkOpen = expandedThinking[msg.id] ?? false;
          const segments = parseMessageSegments(msg.content);
          const hasFencedCode = segments.some((segment) => segment.type === 'code');

          return (
            <div key={msg.id} className="flex flex-col items-start gap-3 w-full group">
              <div className="flex items-center gap-2 pl-1 flex-wrap">
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-white shadow-sm"
                  style={{ backgroundColor: 'var(--primary-accent)' }}
                >
                  <span className="material-symbols-outlined text-[14px]">neurology</span>
                </div>
                <span className="font-headline text-[15px] font-bold text-[var(--app-text)]">
                  {msg.modelName || currentModel.name}
                </span>
                {msg.duration && (
                  <span className="px-2.5 py-0.5 rounded-full bg-[#ba4385]/20 text-[#ffafd3] text-[11px] font-bold border border-[#ba4385]/30">
                    {msg.duration}
                  </span>
                )}
                {msg.tokensPerSecond && msg.tokensPerSecond > 0 && (
                  <span className="font-code text-[11px] text-[var(--app-text-muted)]">
                    {msg.tokensPerSecond.toFixed(1)} tok/s
                  </span>
                )}
              </div>

              {msg.thinkingContent && (
                <div className="w-full bg-[var(--app-surface)] border border-[var(--app-border)] rounded-2xl p-3.5 shadow-sm transition-all duration-300">
                  <button
                    onClick={() => toggleThinking(msg.id)}
                    className="flex items-center justify-between w-full text-left group/think cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5">
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center text-white"
                        style={{ backgroundColor: 'var(--primary-accent)' }}
                      >
                        <span className="material-symbols-outlined text-[18px]">psychology</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[13px] text-[var(--app-text)] font-bold flex items-center gap-2">
                          {t.chat.thinkingBadge}
                          <span className="text-[#ffafd3] font-code text-[11px] font-normal">
                            {t.chat.thinkingTime} {msg.thinkingTime || '—'} ·{' '}
                            {msg.thinkingTokens ?? '—'} {t.chat.thinkingTokens}
                          </span>
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 bg-[var(--app-surface-high)] px-3 py-1 rounded-full text-[var(--app-text-muted)] group-hover/think:text-[var(--app-text)] transition-colors border border-[var(--app-border)]">
                      <span className="text-[11px] font-medium">
                        {isThinkOpen ? t.chat.collapseDetails : t.chat.expandDetails}
                      </span>
                      <span
                        className="material-symbols-outlined text-[16px] transition-transform duration-200"
                        style={{ transform: isThinkOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
                      >
                        expand_more
                      </span>
                    </div>
                  </button>

                  {isThinkOpen && (
                    <div className="mt-3 pt-2 flex flex-col gap-2 font-code text-[12px] text-[var(--app-text-muted)] bg-[var(--app-sidebar)]/70 p-3.5 rounded-xl border border-[var(--app-border)] animate-in fade-in duration-150 leading-relaxed whitespace-pre-line">
                      {msg.thinkingContent}
                    </div>
                  )}
                </div>
              )}

              <div className="w-full flex flex-col gap-4 text-[15px] text-[var(--app-text)] leading-relaxed pl-1">
                {segments.map((segment, index) =>
                  segment.type === 'code' ? (
                    <CodeBlock
                      key={`${msg.id}-code-${index}`}
                      blockKey={`${msg.id}-code-${index}`}
                      code={segment.content}
                      language={segment.language}
                      copiedKey={copiedCodeKey}
                      onCopy={handleCopyCode}
                      copyLabel={t.chat.copyCode}
                      copiedLabel={t.chat.codeCopied}
                    />
                  ) : (
                    <p key={`${msg.id}-text-${index}`} className="whitespace-pre-wrap break-words">
                      {segment.content}
                    </p>
                  )
                )}

                {!hasFencedCode && msg.codeSnippet && (
                  <CodeBlock
                    blockKey={`${msg.id}-legacy-code`}
                    code={msg.codeSnippet.code}
                    language={msg.codeSnippet.language}
                    copiedKey={copiedCodeKey}
                    onCopy={handleCopyCode}
                    copyLabel={t.chat.copyCode}
                    copiedLabel={t.chat.codeCopied}
                  />
                )}
              </div>

              <div className="flex items-center gap-2 mt-2 pl-1 flex-wrap">
                <button
                  onClick={() => handleRegenerate(msg.id)}
                  disabled={isGenerating}
                  className="flex items-center gap-1 px-3 py-1 rounded-full bg-[var(--app-surface)] hover:bg-[var(--app-surface-high)] disabled:opacity-50 text-[var(--app-text-muted)] hover:text-[var(--app-text)] text-[11px] border border-[var(--app-border)] transition-colors cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[15px]">replay</span>
                  <span>{t.chat.regenerate}</span>
                </button>
                <span className="text-[var(--app-text-muted)] font-code text-[11px] ml-auto">
                  {msg.totalTokens ? `${msg.totalTokens} ${t.chat.tokens}` : ''}
                </span>
              </div>
            </div>
          );
        })}

        {isGenerating && (
          <div className="flex items-center gap-3 p-4 bg-[var(--app-surface)] border border-[var(--app-border)] rounded-2xl w-fit">
            <span
              className="w-3 h-3 rounded-full animate-ping"
              style={{ backgroundColor: 'var(--primary-accent)' }}
            />
            <span className="text-[13px] font-medium" style={{ color: 'var(--primary-accent)' }}>
              {t.chat.generatingStatus}
            </span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="fixed bottom-16 lg:bottom-0 left-0 lg:left-64 right-0 z-40 p-3 sm:p-4 flex flex-col items-center pointer-events-none">
        <div className="w-full max-w-4xl flex flex-col gap-2 pointer-events-auto">
          <div className="flex items-center gap-2 overflow-x-auto px-2 py-1 no-scrollbar">
            <button
              onClick={() => {
                const currentIdx = personas.indexOf(systemPersona);
                const nextPersona = personas[(currentIdx + 1) % personas.length];
                setSystemPersona(nextPersona);
                showToast(`${t.chat.systemPersona} ${nextPersona}`);
              }}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-[var(--app-surface-high)]/95 hover:bg-[var(--app-surface-highest)] text-[var(--app-text)] text-[12px] font-medium backdrop-blur-md shadow-sm border border-[var(--app-border)] transition-colors cursor-pointer shrink-0"
            >
              <span
                className="material-symbols-outlined text-[15px]"
                style={{ color: 'var(--primary-accent)' }}
              >
                psychology_alt
              </span>
              <span>
                {t.chat.systemPersona} {systemPersona}
              </span>
              <span className="material-symbols-outlined text-[14px] text-[var(--app-text-muted)]">
                swap_horiz
              </span>
            </button>

            <button
              onClick={() => {
                setForceJson(!forceJson);
                showToast(
                  forceJson
                    ? language === 'zh'
                      ? '已关闭强制 JSON'
                      : 'JSON mode disabled'
                    : t.chat.forceJson
                );
              }}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[12px] font-medium backdrop-blur-md shadow-sm transition-all cursor-pointer shrink-0 border ${
                forceJson
                  ? 'text-white border-transparent shadow-md'
                  : 'bg-[var(--app-surface-high)]/95 hover:bg-[var(--app-surface-highest)] text-[var(--app-text-muted)] border-[var(--app-border)]'
              }`}
              style={forceJson ? { backgroundColor: 'var(--primary-accent)' } : {}}
            >
              <span className="material-symbols-outlined text-[15px]">data_object</span>
              <span>{t.chat.forceJson}</span>
            </button>
          </div>

          <div className="relative bg-[var(--app-surface-high)]/95 backdrop-blur-2xl rounded-3xl p-2.5 shadow-2xl border border-[var(--app-border)] transition-all duration-200">
            <div className="flex items-end gap-2">
              <button
                disabled
                title={t.chat.attachmentUnavailable}
                aria-label={t.chat.attachmentUnavailable}
                className="w-10 h-10 rounded-full flex items-center justify-center text-[var(--app-text-muted)] opacity-50 cursor-not-allowed shrink-0"
              >
                <span className="material-symbols-outlined text-[20px]">attach_file</span>
              </button>

              <div className="flex-1 py-1 px-2">
                <textarea
                  ref={textareaRef}
                  value={inputText}
                  onChange={(e) => {
                    setInputText(e.target.value);
                    e.target.style.height = 'auto';
                    e.target.style.height = Math.min(e.target.scrollHeight, 140) + 'px';
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  rows={1}
                  aria-label={t.chat.inputPlaceholder}
                  placeholder={`${currentModel.name} ${t.chat.inputPlaceholder}`}
                  className="w-full bg-transparent border-none outline-none text-[var(--app-text)] placeholder:text-[var(--app-text-muted)] text-[14px] resize-none max-h-36 leading-relaxed"
                />
              </div>

              <button
                onClick={() => {
                  if (isGenerating) {
                    handleStop();
                  } else {
                    handleSendMessage();
                  }
                }}
                disabled={!isGenerating && !inputText.trim()}
                aria-label={
                  isGenerating ? t.chat.stopGeneration : language === 'zh' ? '发送' : 'Send'
                }
                className={`w-11 h-11 rounded-full text-white flex items-center justify-center shadow-lg transition-all duration-150 shrink-0 cursor-pointer ${
                  !isGenerating && !inputText.trim()
                    ? 'opacity-50 cursor-not-allowed'
                    : 'hover:scale-105 active:scale-95'
                }`}
                style={{
                  backgroundColor: 'var(--primary-accent)',
                  boxShadow: '0 0 16px var(--primary-glow)'
                }}
                title={
                  isGenerating
                    ? t.chat.stopGeneration
                    : language === 'zh'
                      ? '发送 (Enter)'
                      : 'Send (Enter)'
                }
              >
                <span className="material-symbols-outlined text-[22px]">
                  {isGenerating ? 'stop' : 'arrow_upward'}
                </span>
              </button>
            </div>
          </div>

          <div className="flex items-center justify-center gap-2 pt-0.5">
            <div className="flex items-center gap-2 bg-[var(--app-surface)]/90 backdrop-blur-md px-4 py-1 rounded-full text-[var(--app-text-muted)] font-code text-[11px] shadow-sm border border-[var(--app-border)] max-w-full overflow-hidden">
              <span className="flex items-center gap-1.5 shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-[#27c93f]" />
                <span>{t.chat.contextWindow}</span>
              </span>
              <span className="text-[var(--app-text-muted)] opacity-60">·</span>
              <span className="truncate">{settings.numCtx}</span>
              <span className="text-[var(--app-text-muted)] opacity-60">·</span>
              <span className="truncate">
                {t.chat.keepAlive} {formatKeepAlive(settings.keepAlive)}
              </span>
              <span className="text-[var(--app-text-muted)] opacity-60">·</span>
              <span className="truncate" style={{ color: 'var(--primary-accent)' }}>
                {currentModel.quantization}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
