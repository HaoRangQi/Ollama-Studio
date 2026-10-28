import React from 'react';
import type { CatalogSearchResult } from '../api/catalog';
import { useAppTheme } from '../context/ThemeContext';

interface CatalogResultRowProps {
  result: CatalogSearchResult;
  quantsExpanded: boolean;
  selectedQuant?: string;
  onToggleQuants: () => void;
  onSelectQuant: (quant: string) => void;
  onDownload: (quant?: string) => void;
  onFillCommand: (quant?: string) => void;
}

const QUANT_PREVIEW_COUNT = 8;

function formatCompact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

function formatDate(value: string | undefined, zh: boolean): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(zh ? 'zh-CN' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

export const CatalogResultRow: React.FC<CatalogResultRowProps> = ({
  result,
  quantsExpanded,
  selectedQuant,
  onToggleQuants,
  onSelectQuant,
  onDownload,
  onFillCommand
}) => {
  const { language } = useAppTheme();
  const zh = language === 'zh';
  const quants = result.quants ?? [];
  const visibleQuants = quantsExpanded ? quants : quants.slice(0, QUANT_PREVIEW_COUNT);
  const hiddenCount = quants.length - visibleQuants.length;
  const currentQuant = selectedQuant ?? quants[0] ?? '';
  const updatedAt = formatDate(result.lastModified, zh);
  const tags = (result.tags ?? []).filter((tag) => tag !== 'gguf').slice(0, 5);
  const sourceLabel = result.source === 'huggingface' ? 'Hugging Face' : 'Ollama';

  return (
    <article className="group flex flex-col lg:flex-row gap-4 lg:gap-6 rounded-3xl border border-[var(--app-border)] bg-[var(--app-surface)] p-4 sm:p-5 transition-all duration-200 hover:border-[var(--primary-accent)] hover:shadow-lg">
      <div className="flex items-start gap-4 min-w-0 flex-1">
        <div
          className="w-12 h-12 rounded-2xl bg-[var(--app-surface-high)] border border-[var(--app-border)] flex items-center justify-center shrink-0"
          style={{ color: 'var(--primary-accent)' }}
        >
          <span className="material-symbols-outlined text-[24px]">
            {result.source === 'huggingface' ? 'deployed_code' : 'travel_explore'}
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h5 className="font-headline text-[15px] sm:text-[17px] text-[var(--app-text)] font-bold break-all leading-snug">
              {result.name}
            </h5>
            <span className="px-2 py-0.5 rounded-full bg-[var(--app-surface-high)] border border-[var(--app-border)] text-[10px] font-code text-[var(--app-text-muted)]">
              {sourceLabel}
            </span>
            {result.source === 'huggingface' && (
              <span className="px-2 py-0.5 rounded-full bg-[#27c93f]/15 text-[#27c93f] text-[10px] font-code font-semibold">
                GGUF
              </span>
            )}
            {result.pipelineTag && (
              <span className="px-2 py-0.5 rounded-full bg-[var(--app-surface-high)] border border-[var(--app-border)] text-[10px] font-code text-[var(--app-text-muted)]">
                {result.pipelineTag.replace(/-/g, ' ')}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--app-text-muted)] mt-1.5">
            {result.author && <span className="font-code">@{result.author}</span>}
            {typeof result.downloads === 'number' && (
              <span className="inline-flex items-center gap-1">
                <span className="material-symbols-outlined text-[13px]">download</span>
                {formatCompact(result.downloads)}
              </span>
            )}
            {typeof result.likes === 'number' && (
              <span className="inline-flex items-center gap-1">
                <span className="material-symbols-outlined text-[13px]">favorite</span>
                {formatCompact(result.likes)}
              </span>
            )}
            {updatedAt && (
              <span className="inline-flex items-center gap-1">
                <span className="material-symbols-outlined text-[13px]">update</span>
                {updatedAt}
              </span>
            )}
          </div>

          <p className="text-[12px] text-[var(--app-text-muted)] line-clamp-2 mt-2 leading-relaxed">
            {result.description}
          </p>

          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-0.5 rounded-md bg-[var(--app-surface-high)] text-[10px] text-[var(--app-text-muted)] border border-[var(--app-border)]"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="lg:w-[320px] xl:w-[350px] shrink-0 flex flex-col gap-2.5 border-t lg:border-t-0 lg:border-l border-[var(--app-border)] pt-3 lg:pt-0 lg:pl-5">
        {result.source === 'huggingface' ? (
          quants.length > 0 ? (
            <>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--app-text-muted)]">
                  {zh ? '量化' : 'Quant'} · {quants.length}
                </span>
                <span className="text-[10px] text-[var(--app-text-muted)]">
                  {zh ? '选择量化后下载' : 'Select a quant, then download'}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {visibleQuants.map((quant) => {
                  const selected = quant === currentQuant;
                  return (
                    <button
                      key={quant}
                      type="button"
                      onClick={() => onSelectQuant(quant)}
                      aria-pressed={selected}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-code border transition-colors cursor-pointer ${
                        selected
                          ? 'text-white border-transparent font-semibold shadow-sm'
                          : 'border-[var(--app-border)] bg-[var(--app-surface-high)] text-[var(--app-text)] hover:border-[var(--primary-accent)] hover:text-[var(--primary-accent)]'
                      }`}
                      style={selected ? { backgroundColor: 'var(--primary-accent)' } : undefined}
                      title={`ollama pull hf.co/${result.name}:${quant}`}
                    >
                      {quant}
                    </button>
                  );
                })}
                {hiddenCount > 0 && (
                  <button
                    type="button"
                    onClick={onToggleQuants}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-code border border-dashed border-[var(--app-border)] text-[var(--app-text-muted)] hover:border-[var(--primary-accent)] hover:text-[var(--primary-accent)] transition-colors cursor-pointer"
                  >
                    +{hiddenCount}
                  </button>
                )}
                {quantsExpanded && quants.length > QUANT_PREVIEW_COUNT && (
                  <button
                    type="button"
                    onClick={onToggleQuants}
                    className="px-2.5 py-1 rounded-lg text-[11px] border border-[var(--app-border)] text-[var(--app-text-muted)] hover:text-[var(--app-text)] transition-colors cursor-pointer"
                  >
                    {zh ? '收起' : 'Less'}
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => onDownload(currentQuant)}
                className="w-full flex items-center justify-center gap-1.5 px-4 py-2 rounded-full text-white text-[12px] font-semibold transition-all active:scale-95 cursor-pointer shadow-md"
                style={{ backgroundColor: 'var(--primary-accent)' }}
              >
                <span className="material-symbols-outlined text-[17px]">download</span>
                <span>{zh ? `下载 ${currentQuant}` : `Download ${currentQuant}`}</span>
              </button>
              <p className="text-[10px] text-[var(--app-text-muted)] leading-relaxed">
                {zh
                  ? 'Ollama 拉取只接受模型标签，量化格式即下载参数。'
                  : 'Ollama pull only accepts a model tag; the quant is the download parameter.'}
              </p>
            </>
          ) : (
            <span className="text-[11px] text-[var(--app-text-muted)] leading-relaxed">
              {zh
                ? '未发现可识别的量化标签，请到模型页选择文件。'
                : 'No recognizable quantization tags; choose a file on the model page.'}
            </span>
          )
        ) : (
          <button
            type="button"
            onClick={() => onDownload()}
            className="w-full flex items-center justify-center gap-1.5 px-4 py-2 rounded-full text-white text-[12px] font-semibold transition-all active:scale-95 cursor-pointer shadow-md"
            style={{ backgroundColor: 'var(--primary-accent)' }}
          >
            <span className="material-symbols-outlined text-[17px]">download</span>
            <span>{zh ? '下载模型' : 'Download model'}</span>
          </button>
        )}

        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          {(result.source === 'ollama' || quants.length > 0) && (
            <button
              type="button"
              onClick={() =>
                onFillCommand(result.source === 'huggingface' ? currentQuant : undefined)
              }
              className="text-[11px] font-medium text-[var(--app-text-muted)] hover:text-[var(--primary-accent)] transition-colors cursor-pointer"
            >
              {zh ? '仅填入命令' : 'Fill command only'}
            </button>
          )}
          <a
            href={result.url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--app-text-muted)] hover:text-[var(--primary-accent)] transition-colors"
          >
            <span className="material-symbols-outlined text-[15px]">open_in_new</span>
            <span>
              {result.source === 'huggingface'
                ? zh
                  ? '在 Hugging Face 查看'
                  : 'View on Hugging Face'
                : zh
                  ? '在 ollama.com 查看'
                  : 'View on ollama.com'}
            </span>
          </a>
        </div>
      </div>
    </article>
  );
};
