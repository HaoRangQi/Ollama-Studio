import React from 'react';
import { useAppTheme } from '../context/ThemeContext';
import { OllamaStatus } from '../hooks/useOllama';

interface ConnectionBannerProps {
  status: OllamaStatus;
  version: string | null;
  modelCount: number;
  error: string | null;
  onRetry: () => void;
  onOpenPull: () => void;
}

export const ConnectionBanner: React.FC<ConnectionBannerProps> = ({
  status,
  version,
  modelCount,
  error,
  onRetry,
  onOpenPull
}) => {
  const { language } = useAppTheme();
  const zh = language === 'zh';

  if (status === 'online' && modelCount > 0) return null;

  const connecting = status === 'connecting';
  const empty = status === 'online' && modelCount === 0;
  const offline = !connecting && !empty;
  const title = connecting
    ? zh
      ? '正在连接 Ollama…'
      : 'Connecting to Ollama…'
    : empty
      ? zh
        ? 'Ollama 已连接，但没有本地模型'
        : 'Ollama connected, but no local models'
      : zh
        ? 'Ollama 未连接 · 当前显示演示数据'
        : 'Ollama offline · showing demo data';

  return (
    <div className="mx-6 lg:mx-8 mt-4 rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
      <span
        className={`material-symbols-outlined text-[20px] shrink-0 ${
          connecting ? 'animate-spin' : ''
        }`}
        style={{
          color: connecting || empty ? 'var(--primary-accent)' : '#ffbd2e'
        }}
      >
        {connecting ? 'progress_activity' : empty ? 'inbox' : 'cloud_off'}
      </span>
      <div className="flex flex-col min-w-0 flex-1">
        <span
          className={
            offline
              ? 'text-[16px] font-bold text-[var(--app-danger-text)]'
              : 'text-[13px] font-semibold text-[var(--app-text)]'
          }
        >
          {title}
        </span>
        <span className="text-[11px] text-[var(--app-text-muted)] mt-0.5 break-words">
          {connecting
            ? zh
              ? '正在读取 /api/version、/api/tags 和 /api/ps。'
              : 'Reading /api/version, /api/tags and /api/ps.'
            : empty
              ? zh
                ? '当前没有可用的本地模型，先拉取一个模型再开始对话。'
                : 'No local models are available. Pull one before chatting.'
              : error ||
                (zh
                  ? '请确认 Ollama 已启动，或检查代理地址 OLLAMA_HOST。'
                  : 'Make sure Ollama is running, or check OLLAMA_HOST.')}
          {!connecting && !empty && version && modelCount > 0
            ? zh
              ? ` 上次连接：v${version}，${modelCount} 个模型。`
              : ` Last seen: v${version}, ${modelCount} models.`
            : ''}
        </span>
      </div>
      <button
        onClick={empty ? onOpenPull : onRetry}
        disabled={connecting}
        className="self-start sm:self-auto px-3.5 py-1.5 rounded-full text-[11px] font-semibold border border-[var(--app-border)] bg-[var(--app-surface-high)] hover:bg-[var(--app-surface-highest)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        style={{ color: 'var(--primary-accent)' }}
      >
        {empty ? (zh ? '前往拉取' : 'Pull a model') : zh ? '重试连接' : 'Retry'}
      </button>
    </div>
  );
};
