import React, { useState } from 'react';
import { useAppTheme } from '../context/ThemeContext';

interface PullModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStartPull: (modelName: string) => void;
}

export const PullModal: React.FC<PullModalProps> = ({ isOpen, onClose, onStartPull }) => {
  const { t, language } = useAppTheme();
  const [modelTag, setModelTag] = useState('');

  if (!isOpen) return null;

  const popularTags = [
    'gemma2:27b',
    'phi4:14b',
    'nomic-embed-text',
    'deepseek-r1:8b',
    'qwen2.5-coder:7b',
    'mistral-nemo:12b'
  ];

  const handleStart = () => {
    const value = modelTag.trim();
    if (!value) return;
    onStartPull(value);
    setModelTag('');
    onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 flex items-center justify-center p-4 transition-all"
      onClick={onClose}
    >
      <div
        className="bg-[var(--app-surface-high)] border border-[var(--app-border)] text-[var(--app-text)] rounded-[2.5rem] p-6 lg:p-8 max-w-lg w-full shadow-2xl flex flex-col gap-6 transform transition-transform"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-full text-white flex items-center justify-center shadow-md"
              style={{ backgroundColor: 'var(--primary-accent)' }}
            >
              <span className="material-symbols-outlined text-[20px]">cloud_download</span>
            </div>
            <div>
              <h3 className="font-headline text-[18px] text-[var(--app-text)] font-bold">
                {language === 'zh'
                  ? '拉取远程模型 (ollama pull)'
                  : 'Pull a remote model (ollama pull)'}
              </h3>
              <p className="text-[12px] text-[var(--app-text-muted)]">
                {language === 'zh'
                  ? '从 Ollama 官方镜像或 Hugging Face 拉取 GGUF 格式'
                  : 'Pull GGUF weights from the Ollama registry or Hugging Face'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label={language === 'zh' ? '关闭' : 'Close'}
            className="w-8 h-8 rounded-full hover:bg-[var(--app-surface-highest)] flex items-center justify-center text-[var(--app-text-muted)] hover:text-[var(--app-text)] cursor-pointer transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* Input Field */}
        <div className="flex flex-col gap-2">
          <label
            htmlFor="pull-model-tag"
            className="text-[12px] text-[var(--app-text)] font-semibold"
          >
            {language === 'zh' ? '模型标识符或 Manifest 标签' : 'Model identifier or manifest tag'}
          </label>
          <div className="relative">
            <input
              id="pull-model-tag"
              type="text"
              value={modelTag}
              onChange={(e) => setModelTag(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleStart()}
              placeholder={
                language === 'zh'
                  ? '例如: gemma2:9b 或 mistral-nemo'
                  : 'e.g. gemma2:9b or mistral-nemo'
              }
              className="w-full bg-[var(--app-surface)] text-[var(--app-text)] font-code text-[14px] px-4 py-3 rounded-2xl outline-none ring-1 ring-[var(--app-border)] focus:ring-2 transition-all"
              style={{ outlineColor: 'var(--primary-accent)' }}
            />
          </div>
        </div>

        {/* Popular Tags */}
        <div className="flex flex-col gap-2">
          <span className="text-[11px] text-[var(--app-text-muted)] font-medium">
            {language === 'zh' ? '热门预置标签:' : 'Popular tags:'}
          </span>
          <div className="flex flex-wrap gap-2">
            {popularTags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => setModelTag(tag)}
                className="px-3 py-1 rounded-full bg-[var(--app-surface)] hover:bg-[var(--app-surface-highest)] text-[var(--app-text)] font-code text-[12px] border border-[var(--app-border)] transition-colors cursor-pointer"
              >
                {tag}
              </button>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 rounded-full bg-[var(--app-surface-highest)] text-[var(--app-text)] text-[13px] font-medium hover:opacity-90 transition-colors cursor-pointer"
          >
            {t.models.cancel}
          </button>
          <button
            type="button"
            disabled={!modelTag.trim()}
            onClick={handleStart}
            className="px-6 py-2.5 rounded-full text-white text-[13px] font-semibold flex items-center gap-1.5 shadow-md transition-all cursor-pointer"
            style={{ backgroundColor: 'var(--primary-accent)' }}
          >
            <span className="material-symbols-outlined text-[18px]">downloading</span>
            <span>{language === 'zh' ? '开始后台拉取' : 'Start pull'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
