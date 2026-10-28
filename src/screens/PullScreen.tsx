import React, { useState } from 'react';
import { CuratedHubModel, DownloadTask } from '../types';
import { INITIAL_CURATED_MODELS } from '../data/mockData';
import { searchHuggingFaceCatalog, searchOllamaCatalog } from '../api/catalog';
import type { CatalogSearchResult, CatalogSource } from '../api/catalog';
import { CatalogResultRow } from '../components/CatalogResultRow';
import { useAppTheme } from '../context/ThemeContext';

const CATALOG_PAGE_SIZE = 6;

interface PullScreenProps {
  downloadTask: DownloadTask;
  onPauseDownload: () => void;
  onResumeDownload: () => void;
  onCancelDownload: () => void;
  onOpenQuantPicker: () => void;
  selectedQuant: string;
  onImportGguf: (file: File) => Promise<void>;
  onStartNewDownload: (modelName: string) => void;
}

export const PullScreen: React.FC<PullScreenProps> = ({
  downloadTask,
  onPauseDownload,
  onResumeDownload,
  onCancelDownload,
  onOpenQuantPicker,
  selectedQuant,
  onImportGguf,
  onStartNewDownload
}) => {
  const { t, language } = useAppTheme();
  const [pullInput, setPullInput] = useState('ollama pull deepseek-r1:14b');
  const [activeCategory, setActiveCategory] = useState<
    'all' | 'reason' | 'code' | 'vision' | 'general'
  >('all');
  const [curatedList, setCuratedList] = useState<CuratedHubModel[]>(INITIAL_CURATED_MODELS);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [catalogQuery, setCatalogQuery] = useState('');
  const [catalogSource, setCatalogSource] = useState<CatalogSource>('huggingface');
  const [catalogResults, setCatalogResults] = useState<CatalogSearchResult[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [importingGguf, setImportingGguf] = useState(false);
  const [catalogSearched, setCatalogSearched] = useState(false);
  const [catalogPage, setCatalogPage] = useState(1);
  const [expandedQuants, setExpandedQuants] = useState<Record<string, boolean>>({});

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  const handleClearInput = () => {
    setPullInput('ollama pull ');
  };

  const handleStartPull = () => {
    const raw = pullInput.replace(/^ollama\s+(pull|run)\s+/i, '').trim();
    if (!raw) return;
    onStartNewDownload(raw);
    showToast(language === 'zh' ? `正在开始拉取: ${raw}` : `Starting pull: ${raw}`);
  };

  const handleQuickPullModel = (modelTag: string) => {
    setPullInput(`ollama pull ${modelTag}`);
    onStartNewDownload(modelTag);
    showToast(
      language === 'zh' ? `已添加至拉取队列: ${modelTag}` : `Added to pull queue: ${modelTag}`
    );
  };

  const handleSizeChange = (modelId: string, size: string) => {
    setCuratedList((prev) => prev.map((m) => (m.id === modelId ? { ...m, activeSize: size } : m)));
  };

  // Category chips only scope the local curated list. Catalog search results
  // are shown in a separate mode so the chips cannot be mistaken for filters
  // that apply to remote results.
  const filteredCurated = curatedList.filter(
    (m) => activeCategory === 'all' || m.category === activeCategory
  );

  const catalogPageCount = Math.max(1, Math.ceil(catalogResults.length / CATALOG_PAGE_SIZE));
  const safeCatalogPage = Math.min(catalogPage, catalogPageCount);
  const visibleCatalogResults = catalogResults.slice(
    (safeCatalogPage - 1) * CATALOG_PAGE_SIZE,
    safeCatalogPage * CATALOG_PAGE_SIZE
  );
  const catalogFirstIndex =
    catalogResults.length === 0 ? 0 : (safeCatalogPage - 1) * CATALOG_PAGE_SIZE + 1;
  const catalogLastIndex = Math.min(safeCatalogPage * CATALOG_PAGE_SIZE, catalogResults.length);

  const goToCatalogPage = (page: number) => {
    const next = Math.min(Math.max(page, 1), catalogPageCount);
    setCatalogPage(next);
    window.requestAnimationFrame(() => {
      document
        .getElementById('catalog-results')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const resetCatalogSearch = () => {
    setCatalogQuery('');
    setCatalogResults([]);
    setCatalogError(null);
    setCatalogSearched(false);
    setCatalogPage(1);
    setExpandedQuants({});
  };

  const handleCatalogSourceChange = (source: CatalogSource) => {
    setCatalogSource(source);
    resetCatalogSearch();
  };

  const handleCatalogSearch = async () => {
    const query = catalogQuery.trim();
    if (!query || catalogLoading) return;

    setCatalogLoading(true);
    setCatalogError(null);
    setCatalogSearched(true);
    setCatalogPage(1);
    setExpandedQuants({});
    try {
      const results =
        catalogSource === 'huggingface'
          ? await searchHuggingFaceCatalog(query)
          : await searchOllamaCatalog(query);
      setCatalogResults(results);
      if (results.length === 0) {
        setCatalogError(
          language === 'zh'
            ? '没有找到匹配模型，试试更短的关键词。'
            : 'No models found. Try a shorter keyword.'
        );
      }
    } catch (error) {
      setCatalogResults([]);
      setCatalogError(error instanceof Error ? error.message : String(error));
    } finally {
      setCatalogLoading(false);
    }
  };

  const handleUseCatalogModel = (result: CatalogSearchResult, quant?: string) => {
    if (result.source === 'huggingface' && !quant) {
      showToast(language === 'zh' ? '请先选择一个量化标签' : 'Choose a quantization tag first');
      return;
    }

    const command =
      result.source === 'huggingface'
        ? `ollama pull hf.co/${result.name}:${quant}`
        : `ollama pull ${result.name}`;

    setPullInput(command);
    showToast(language === 'zh' ? `已填入命令：${command}` : `Command filled: ${command}`);
  };

  const importGgufFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.gguf')) {
      showToast(language === 'zh' ? '仅支持 .gguf 文件' : 'Only .gguf files are supported');
      return;
    }

    setImportingGguf(true);
    try {
      await onImportGguf(file);
      showToast(
        language === 'zh' ? `已导入本地权重: ${file.name}` : `Imported local weights: ${file.name}`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      showToast(language === 'zh' ? `GGUF 导入失败: ${message}` : `GGUF import failed: ${message}`);
    } finally {
      setImportingGguf(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (importingGguf) return;
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      void importGgufFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      void importGgufFile(e.target.files[0]);
      e.target.value = '';
    }
  };

  return (
    <div className="flex flex-col w-full p-6 lg:p-8 max-w-7xl mx-auto gap-8 animate-in fade-in duration-200">
      {/* Toast Alert */}
      {toastMessage && (
        <div
          className="fixed top-20 right-8 z-50 text-white px-5 py-2.5 rounded-full shadow-2xl flex items-center gap-2 text-[13px] font-medium border border-white/20 animate-in slide-in-from-top-4 duration-150"
          style={{ backgroundColor: 'var(--primary-accent)' }}
        >
          <span className="material-symbols-outlined text-[18px]">cloud_done</span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* 1. 顶部操作区: CLI 灵动拉取胶囊 & 下载队列卡片 */}
      <section className="flex flex-col gap-6">
        {/* 搜索与拉取交互药丸容器 */}
        <div className="relative bg-[var(--app-surface)] rounded-3xl p-3 sm:p-4 shadow-xl overflow-hidden border border-[var(--app-border)]">
          <div
            className="absolute -right-20 -top-24 w-80 h-80 rounded-full blur-3xl pointer-events-none opacity-20"
            style={{ backgroundColor: 'var(--primary-accent)' }}
          />
          <div className="relative flex flex-col md:flex-row items-center gap-3 w-full">
            <div className="flex items-center gap-2 pl-4 py-1.5 text-[var(--app-text)] flex-1 w-full bg-[var(--app-surface-high)] rounded-full focus-within:bg-[var(--app-surface-highest)] border border-[var(--app-border)] transition-colors">
              <span
                className="material-symbols-outlined text-[22px]"
                style={{ color: 'var(--primary-accent)' }}
              >
                terminal
              </span>
              <span className="font-code text-[14px] text-[var(--app-text-muted)] font-medium select-none">
                $
              </span>
              <input
                type="text"
                value={pullInput}
                onChange={(e) => setPullInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleStartPull()}
                placeholder={t.pull.cliPlaceholder}
                className="bg-transparent border-none outline-none font-code text-[14px] font-medium w-full text-[var(--app-text)] placeholder:text-[var(--app-text-muted)]"
              />
              <button
                onClick={handleClearInput}
                className="p-1.5 rounded-full text-[var(--app-text-muted)] hover:text-[var(--app-text)] hover:bg-[var(--app-surface-highest)] transition-colors mr-1 cursor-pointer"
                title={language === 'zh' ? '清空' : 'Clear'}
              >
                <span className="material-symbols-outlined text-[18px]">backspace</span>
              </button>
            </div>

            <div className="flex items-center gap-2 w-full md:w-auto justify-end">
              <button
                onClick={onOpenQuantPicker}
                className="flex items-center gap-1.5 px-4 h-11 rounded-full bg-[var(--app-surface-high)] text-[var(--app-text)] hover:bg-[var(--app-surface-highest)] transition-all cursor-pointer border border-[var(--app-border)]"
              >
                <span className="material-symbols-outlined text-[18px] text-[#ffafd3]">tune</span>
                <span className="text-[13px] font-medium">
                  {t.pull.quantConfigBtn} ({selectedQuant})
                </span>
              </button>
              <button
                onClick={handleStartPull}
                className="flex items-center gap-2 px-6 h-11 rounded-full text-white font-semibold transition-all active:scale-95 cursor-pointer shadow-md"
                style={{
                  backgroundColor: 'var(--primary-accent)',
                  boxShadow: '0 0 20px var(--primary-glow)'
                }}
              >
                <span className="material-symbols-outlined text-[20px]">download</span>
                <span className="text-[13px]">{t.pull.runPullBtn}</span>
              </button>
            </div>
          </div>
        </div>

        {/* 动态下载任务浮动面板 (Active Task Card) */}
        {downloadTask.isActive && (
          <div className="relative bg-[var(--app-surface-high)] rounded-3xl p-6 shadow-xl overflow-hidden border border-[var(--app-border)] transition-transform">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-4">
              <div className="flex items-start sm:items-center gap-4">
                <div
                  className="relative w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border border-[var(--app-border)]"
                  style={{ backgroundColor: 'var(--app-surface)' }}
                >
                  <span
                    className={`material-symbols-outlined text-[28px] ${
                      downloadTask.isPaused || downloadTask.isComplete || downloadTask.error
                        ? ''
                        : 'animate-bounce'
                    }`}
                    style={{ color: 'var(--primary-accent)' }}
                  >
                    {downloadTask.isComplete
                      ? 'check_circle'
                      : downloadTask.error
                        ? 'error'
                        : 'cloud_download'}
                  </span>
                  {!downloadTask.isPaused && !downloadTask.isComplete && !downloadTask.error && (
                    <div
                      className="absolute inset-0 rounded-2xl border animate-ping"
                      style={{ borderColor: 'var(--primary-accent)' }}
                    />
                  )}
                </div>
                <div className="flex flex-col min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-headline text-[18px] text-[var(--app-text)] font-bold tracking-tight">
                      {downloadTask.modelName}
                    </span>
                    <span className="bg-[var(--app-surface-highest)] text-[var(--app-text)] font-code text-[11px] px-2.5 py-0.5 rounded-full font-medium">
                      {downloadTask.quant}
                    </span>
                    <span className="bg-[var(--app-surface)] text-[var(--app-text)] text-[11px] px-2.5 py-0.5 rounded-full flex items-center gap-1.5 font-semibold border border-[var(--app-border)]">
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          downloadTask.error
                            ? 'bg-[#ffb4ab]'
                            : downloadTask.isComplete
                              ? 'bg-[#27c93f]'
                              : downloadTask.isPaused
                                ? 'bg-[#ffbd2e]'
                                : 'bg-[#27c93f] animate-pulse'
                        }`}
                      />
                      {downloadTask.error
                        ? language === 'zh'
                          ? '拉取失败'
                          : 'Pull failed'
                        : downloadTask.isComplete
                          ? language === 'zh'
                            ? '拉取完成'
                            : 'Pull complete'
                          : downloadTask.isPaused
                            ? downloadTask.isInterrupted
                              ? language === 'zh'
                                ? '上次任务已中断，可继续'
                                : 'Interrupted; resume available'
                              : t.pull.activeTaskPaused
                            : downloadTask.layerStatus}
                    </span>
                  </div>
                  <span className="text-[12px] text-[var(--app-text-muted)] truncate mt-1 font-code">
                    {downloadTask.targetPath}
                  </span>
                </div>
              </div>

              {/* 右侧速率指标与控制器 */}
              <div className="flex items-center gap-4 self-end lg:self-center">
                <div className="flex items-baseline gap-2 bg-[var(--app-surface)] px-4 py-1.5 rounded-full border border-[var(--app-border)]">
                  <span className="text-[11px] text-[var(--app-text-muted)]">{t.pull.rate}</span>
                  <span
                    className="font-code text-[13px] font-bold"
                    style={{ color: 'var(--primary-accent)' }}
                  >
                    {downloadTask.isPaused || downloadTask.isComplete || downloadTask.error
                      ? '—'
                      : downloadTask.speed}
                  </span>
                  <span className="text-[var(--app-text-muted)] text-xs">·</span>
                  <span className="text-[11px] text-[#ffafd3] font-medium">
                    {downloadTask.error
                      ? '—'
                      : downloadTask.isComplete
                        ? language === 'zh'
                          ? '已完成'
                          : 'Done'
                        : downloadTask.isPaused
                          ? language === 'zh'
                            ? '已暂停'
                            : 'Paused'
                          : downloadTask.remainingTime}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  {!downloadTask.isComplete && !downloadTask.error && (
                    <button
                      onClick={() => {
                        if (downloadTask.isPaused) {
                          onResumeDownload();
                          showToast(t.pull.resume);
                        } else {
                          onPauseDownload();
                          showToast(t.pull.pause);
                        }
                      }}
                      className="w-9 h-9 rounded-full bg-[var(--app-surface)] hover:bg-[var(--app-surface-highest)] text-[var(--app-text-muted)] hover:text-[var(--app-text)] flex items-center justify-center transition-all cursor-pointer border border-[var(--app-border)]"
                      title={downloadTask.isPaused ? t.pull.resume : t.pull.pause}
                    >
                      <span className="material-symbols-outlined text-[18px]">
                        {downloadTask.isPaused ? 'play_arrow' : 'pause'}
                      </span>
                    </button>
                  )}
                  <button
                    onClick={() => {
                      onCancelDownload();
                      showToast(t.pull.cancelTask);
                    }}
                    className="w-9 h-9 rounded-full bg-[var(--app-surface)] hover:bg-[#93000a] text-[var(--app-text-muted)] hover:text-white flex items-center justify-center transition-all cursor-pointer border border-[var(--app-border)]"
                    title={
                      downloadTask.isComplete
                        ? language === 'zh'
                          ? '关闭'
                          : 'Close'
                        : t.pull.cancelTask
                    }
                  >
                    <span className="material-symbols-outlined text-[18px]">close</span>
                  </button>
                </div>
              </div>
            </div>

            {/* 进度条 */}
            <div className="flex flex-col gap-1.5">
              <div className="w-full bg-[var(--app-surface)] h-3 rounded-full overflow-hidden p-0.5">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${Math.min(Math.max(downloadTask.progress, 0), 100)}%`,
                    backgroundColor: downloadTask.error
                      ? '#ffb4ab'
                      : downloadTask.isComplete
                        ? '#27c93f'
                        : 'var(--primary-accent)'
                  }}
                />
              </div>
              <div className="flex justify-between items-center text-[var(--app-text-muted)] font-code text-[11px] px-1 gap-3">
                <span className="flex items-center gap-1 shrink-0">
                  <span
                    className="material-symbols-outlined text-[14px]"
                    style={{ color: 'var(--primary-accent)' }}
                  >
                    data_usage
                  </span>
                  {t.pull.downloaded} {downloadTask.downloadedGb.toFixed(2)} GB / {t.pull.total}{' '}
                  {downloadTask.totalGb.toFixed(2)} GB ({downloadTask.progress.toFixed(1)}%)
                </span>
                <span className="text-[var(--app-text-muted)] truncate">{downloadTask.sha256}</span>
              </div>
              {downloadTask.error && (
                <p className="text-[11px] text-[#ffb4ab] px-1 break-words">{downloadTask.error}</p>
              )}
            </div>
          </div>
        )}
      </section>

      {/* 2. 推荐主打横幅 (Hero Feature Card): DeepSeek-R1 全系列蒸馏版 */}
      <section className="relative bg-[var(--app-surface-high)] rounded-3xl p-6 sm:p-8 overflow-hidden shadow-xl border border-[var(--app-border)]">
        <div
          className="absolute -right-12 -top-16 w-96 h-96 rounded-full blur-3xl pointer-events-none opacity-20"
          style={{ backgroundColor: 'var(--primary-accent)' }}
        />
        <div className="absolute right-48 -bottom-24 w-80 h-80 bg-[#ba4385]/20 rounded-full blur-3xl pointer-events-none" />

        <div className="relative grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          <div className="lg:col-span-8 flex flex-col gap-4">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="bg-[#ffafd3]/20 text-[#ffafd3] text-[11px] px-3 py-1 rounded-full font-bold flex items-center gap-1 border border-[#ffafd3]/30">
                <span className="material-symbols-outlined text-[14px]">auto_awesome</span>
                {t.pull.heroTag1}
              </span>
              <span className="bg-[var(--app-surface)] text-[var(--app-text)] text-[11px] px-3 py-1 rounded-full border border-[var(--app-border)]">
                {t.pull.heroTag2}
              </span>
              <span className="bg-[var(--app-surface)] text-[var(--app-text)] text-[11px] px-3 py-1 rounded-full font-medium border border-[var(--app-border)]">
                {t.pull.heroTag3}
              </span>
            </div>

            <div>
              <h2 className="font-headline text-[26px] sm:text-[32px] text-[var(--app-text)] font-bold tracking-tight">
                {t.pull.heroTitle}
              </h2>
              <p className="text-[15px] text-[var(--app-text-muted)] max-w-2xl mt-2 leading-relaxed">
                {t.pull.heroDesc}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-4 pt-1">
              <button
                onClick={() => handleQuickPullModel('deepseek-r1:8b')}
                className="flex items-center gap-2 px-6 h-12 rounded-full text-white font-semibold transition-all transform active:scale-95 cursor-pointer shadow-md"
                style={{
                  backgroundColor: 'var(--primary-accent)',
                  boxShadow: '0 0 20px var(--primary-glow)'
                }}
              >
                <span className="material-symbols-outlined text-[20px]">bolt</span>
                <span className="text-[13px]">{t.pull.oneClickPull8b}</span>
              </button>
              <button
                onClick={() => handleQuickPullModel('deepseek-r1:1.5b')}
                className="flex items-center gap-1.5 px-5 h-12 rounded-full bg-[var(--app-surface)] hover:bg-[var(--app-surface-highest)] text-[var(--app-text)] transition-all cursor-pointer border border-[var(--app-border)]"
              >
                <span className="text-[13px] font-medium">{t.pull.quickTry1_5b}</span>
              </button>
              <div className="flex items-center gap-1.5 text-[var(--app-text-muted)] font-code text-[13px] pl-2">
                <span className="material-symbols-outlined text-[16px] text-[#ffafd3]">
                  verified
                </span>
                <span>{t.pull.privacy100}</span>
              </div>
            </div>
          </div>

          {/* 显存开销矩阵卡片 */}
          <div className="lg:col-span-4 bg-[var(--app-surface)]/90 backdrop-blur-md rounded-2xl p-5 flex flex-col gap-3 shadow-md border border-[var(--app-border)]">
            <div className="flex items-center justify-between pb-1 border-b border-[var(--app-border)]">
              <span className="text-[10px] text-[var(--app-text-muted)] uppercase tracking-wider font-bold">
                {t.pull.vramEstimate}
              </span>
              <span
                className="font-code text-[12px] font-semibold"
                style={{ color: 'var(--primary-accent)' }}
              >
                Unified VRAM
              </span>
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between items-center text-xs">
                <span className="text-[var(--app-text)] font-medium">1.5B (Q4_K_M)</span>
                <span className="text-[#27c93f] font-code font-bold">
                  1.8 GB · {t.pull.fastSmooth}
                </span>
              </div>
              <div className="w-full bg-[var(--app-surface-highest)] h-1.5 rounded-full overflow-hidden">
                <div className="bg-[#27c93f] h-full rounded-full" style={{ width: '15%' }} />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between items-center text-xs">
                <span className="text-[var(--app-text)] font-medium">8B (Q4_K_M) ⭐ 推荐</span>
                <span className="font-code font-bold" style={{ color: 'var(--primary-accent)' }}>
                  5.2 GB · {t.pull.sweetBalance}
                </span>
              </div>
              <div className="w-full bg-[var(--app-surface-highest)] h-1.5 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{ width: '42%', backgroundColor: 'var(--primary-accent)' }}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between items-center text-xs">
                <span className="text-[var(--app-text)] font-medium">14B (Q4_K_M)</span>
                <span className="text-[#ffafd3] font-code font-bold">
                  9.4 GB · {t.pull.precisionInference}
                </span>
              </div>
              <div className="w-full bg-[var(--app-surface-highest)] h-1.5 rounded-full overflow-hidden">
                <div className="bg-[#ba4385] h-full rounded-full" style={{ width: '74%' }} />
              </div>
            </div>

            <p className="text-[11px] text-[var(--app-text-muted)] pt-1 leading-normal">
              {t.pull.vramFootnote}
            </p>
          </div>
        </div>
      </section>

      {/* 3. 发现分类与卡片矩阵 (Model Hub Directory) */}
      <section className="flex flex-col gap-5">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <h3 className="font-headline text-[22px] text-[var(--app-text)] font-bold">
              {catalogSearched
                ? catalogSource === 'huggingface'
                  ? language === 'zh'
                    ? 'Hugging Face 搜索结果'
                    : 'Hugging Face results'
                  : language === 'zh'
                    ? 'Ollama 库搜索结果'
                    : 'Ollama library results'
                : t.pull.hubTitle}
            </h3>
            <p className="text-[13px] text-[var(--app-text-muted)]">
              {catalogSearched
                ? catalogSource === 'huggingface'
                  ? language === 'zh'
                    ? '来自 huggingface.co，仅 GGUF 仓库，按下载量排序'
                    : 'From huggingface.co, GGUF repos only, sorted by downloads'
                  : language === 'zh'
                    ? '来自 ollama.com，按关键词匹配'
                    : 'From ollama.com, matched by keyword'
                : t.pull.hubSubtitle}
            </p>
          </div>
          {catalogSearched && (
            <button
              type="button"
              onClick={resetCatalogSearch}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-[var(--app-surface-high)] text-[var(--app-text)] text-[12px] font-semibold border border-[var(--app-border)] hover:bg-[var(--app-surface-highest)] transition-colors cursor-pointer w-fit shrink-0"
            >
              <span className="material-symbols-outlined text-[16px]">arrow_back</span>
              <span>{language === 'zh' ? '返回本地精选' : 'Back to curated'}</span>
            </button>
          )}
        </div>

        {/* 关键字搜索：本地精选即时过滤 + Ollama / Hugging Face 公共目录 */}
        <div className="flex flex-col gap-2 bg-[var(--app-surface)] border border-[var(--app-border)] rounded-2xl p-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-1 p-1 rounded-full bg-[var(--app-surface-high)] border border-[var(--app-border)] w-fit">
              <button
                onClick={() => handleCatalogSourceChange('huggingface')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold transition-colors cursor-pointer ${
                  catalogSource === 'huggingface'
                    ? 'text-white'
                    : 'text-[var(--app-text-muted)] hover:text-[var(--app-text)]'
                }`}
                style={
                  catalogSource === 'huggingface'
                    ? { backgroundColor: 'var(--primary-accent)' }
                    : {}
                }
              >
                <span className="material-symbols-outlined text-[15px]">deployed_code</span>
                <span>Hugging Face</span>
              </button>
              <button
                onClick={() => handleCatalogSourceChange('ollama')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold transition-colors cursor-pointer ${
                  catalogSource === 'ollama'
                    ? 'text-white'
                    : 'text-[var(--app-text-muted)] hover:text-[var(--app-text)]'
                }`}
                style={
                  catalogSource === 'ollama' ? { backgroundColor: 'var(--primary-accent)' } : {}
                }
              >
                <span className="material-symbols-outlined text-[15px]">travel_explore</span>
                <span>Ollama 官方</span>
              </button>
            </div>
            <span className="text-[10px] text-[var(--app-text-muted)] px-1">
              {catalogSource === 'huggingface'
                ? language === 'zh'
                  ? 'Hugging Face JSON API · 仅 GGUF 仓库'
                  : 'Hugging Face JSON API · GGUF repos only'
                : language === 'zh'
                  ? 'ollama.com 网页搜索 · 只读'
                  : 'ollama.com web search · read-only'}
            </span>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <div className="flex items-center gap-2 flex-1 bg-[var(--app-surface-high)] rounded-full px-4 py-2 border border-[var(--app-border)] focus-within:border-[var(--primary-accent)] transition-colors">
              <span
                className="material-symbols-outlined text-[19px]"
                style={{ color: 'var(--primary-accent)' }}
              >
                search
              </span>
              <input
                value={catalogQuery}
                onChange={(e) => {
                  const value = e.target.value;
                  setCatalogQuery(value);
                  if (!value.trim()) {
                    setCatalogResults([]);
                    setCatalogError(null);
                    setCatalogSearched(false);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void handleCatalogSearch();
                  }
                }}
                placeholder={
                  catalogSource === 'huggingface'
                    ? language === 'zh'
                      ? '搜索 Hugging Face GGUF，例如 qwen、coder、vision…'
                      : 'Search Hugging Face GGUF, e.g. qwen, coder, vision…'
                    : language === 'zh'
                      ? '搜索 Ollama 模型库，例如 qwen、coder、vision…'
                      : 'Search Ollama models, e.g. qwen, coder, vision…'
                }
                className="bg-transparent border-none outline-none focus-visible:outline-none focus-ring-none text-[13px] w-full text-[var(--app-text)] placeholder:text-[var(--app-text-muted)]"
              />
              {catalogQuery && (
                <button
                  onClick={resetCatalogSearch}
                  className="p-1 rounded-full text-[var(--app-text-muted)] hover:text-[var(--app-text)] hover:bg-[var(--app-surface-highest)] transition-colors cursor-pointer"
                  title={language === 'zh' ? '清空搜索' : 'Clear search'}
                >
                  <span className="material-symbols-outlined text-[16px]">close</span>
                </button>
              )}
            </div>
            <div className="flex items-center gap-2 justify-end">
              <button
                onClick={() => void handleCatalogSearch()}
                disabled={!catalogQuery.trim() || catalogLoading}
                className="flex items-center gap-1.5 px-4 h-9 rounded-full text-[12px] font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
                style={{ backgroundColor: 'var(--primary-accent)' }}
              >
                <span
                  className={`material-symbols-outlined text-[16px] ${catalogLoading ? 'animate-spin' : ''}`}
                >
                  {catalogLoading ? 'progress_activity' : 'travel_explore'}
                </span>
                <span>
                  {catalogLoading
                    ? language === 'zh'
                      ? '搜索中…'
                      : 'Searching…'
                    : catalogSource === 'huggingface'
                      ? language === 'zh'
                        ? '搜索 Hugging Face'
                        : 'Search Hugging Face'
                      : language === 'zh'
                        ? '搜索 Ollama 库'
                        : 'Search Ollama'}
                </span>
              </button>
              <a
                href={
                  catalogSource === 'huggingface'
                    ? `https://huggingface.co/models?search=${encodeURIComponent(catalogQuery.trim())}&library=gguf`
                    : `https://ollama.com/search?q=${encodeURIComponent(catalogQuery.trim())}`
                }
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 px-3 h-9 rounded-full text-[11px] font-medium bg-[var(--app-surface-high)] text-[var(--app-text-muted)] hover:text-[var(--app-text)] border border-[var(--app-border)] transition-colors"
              >
                <span className="material-symbols-outlined text-[15px]">open_in_new</span>
                <span>
                  {catalogSource === 'huggingface'
                    ? 'Hugging Face'
                    : language === 'zh'
                      ? '官网'
                      : 'Website'}
                </span>
              </a>
            </div>
          </div>
          <p className="text-[11px] text-[var(--app-text-muted)] px-1">
            {catalogSource === 'huggingface'
              ? language === 'zh'
                ? '输入关键词搜索 Hugging Face 的 GGUF 仓库；搜索时下方会切换为搜索结果，清空或点击“返回本地精选”可回到精选列表。选择量化标签后填入 ollama pull hf.co/<repo>:<quant>。'
                : 'Search Hugging Face GGUF repos. While searching, the curated list is replaced by results; clear the query or choose “Back to curated” to return. Pick a quant tag to fill ollama pull hf.co/<repo>:<quant>.'
              : language === 'zh'
                ? '输入关键词搜索 ollama.com 的公共模型库；搜索时下方会切换为搜索结果，清空或点击“返回本地精选”可回到精选列表。'
                : 'Search the public ollama.com catalog. While searching, the curated list is replaced by results; clear the query or choose “Back to curated” to return.'}
          </p>
        </div>

        {/* 本地精选分类：只作用于精选列表，搜索模式下隐藏 */}
        {!catalogSearched && (
          <div className="flex flex-col gap-2">
            <span className="text-[11px] font-semibold text-[var(--app-text-muted)] px-1 uppercase tracking-wider">
              {language === 'zh' ? '本地精选分类' : 'Curated categories'}
            </span>
            <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
              <button
                onClick={() => setActiveCategory('all')}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-[13px] font-medium transition-all cursor-pointer ${
                  activeCategory === 'all'
                    ? 'text-white font-semibold shadow-md'
                    : 'bg-[var(--app-surface-high)] text-[var(--app-text-muted)] hover:bg-[var(--app-surface-highest)]'
                }`}
                style={activeCategory === 'all' ? { backgroundColor: 'var(--primary-accent)' } : {}}
              >
                <span className="material-symbols-outlined text-[16px]">stars</span>
                <span>{t.pull.hubAll}</span>
              </button>
              <button
                onClick={() => setActiveCategory('reason')}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-[13px] font-medium transition-all cursor-pointer ${
                  activeCategory === 'reason'
                    ? 'text-white font-semibold shadow-md'
                    : 'bg-[var(--app-surface-high)] text-[var(--app-text-muted)] hover:bg-[var(--app-surface-highest)]'
                }`}
                style={
                  activeCategory === 'reason' ? { backgroundColor: 'var(--primary-accent)' } : {}
                }
              >
                <span className="material-symbols-outlined text-[16px]">psychology</span>
                <span>{t.pull.hubReason}</span>
              </button>
              <button
                onClick={() => setActiveCategory('code')}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-[13px] font-medium transition-all cursor-pointer ${
                  activeCategory === 'code'
                    ? 'text-white font-semibold shadow-md'
                    : 'bg-[var(--app-surface-high)] text-[var(--app-text-muted)] hover:bg-[var(--app-surface-highest)]'
                }`}
                style={
                  activeCategory === 'code' ? { backgroundColor: 'var(--primary-accent)' } : {}
                }
              >
                <span className="material-symbols-outlined text-[16px]">terminal</span>
                <span>{t.pull.hubCode}</span>
              </button>
              <button
                onClick={() => setActiveCategory('vision')}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-[13px] font-medium transition-all cursor-pointer ${
                  activeCategory === 'vision'
                    ? 'text-white font-semibold shadow-md'
                    : 'bg-[var(--app-surface-high)] text-[var(--app-text-muted)] hover:bg-[var(--app-surface-highest)]'
                }`}
                style={
                  activeCategory === 'vision' ? { backgroundColor: 'var(--primary-accent)' } : {}
                }
              >
                <span className="material-symbols-outlined text-[16px]">visibility</span>
                <span>{t.pull.hubVision}</span>
              </button>
              <button
                onClick={() => setActiveCategory('general')}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-[13px] font-medium transition-all cursor-pointer ${
                  activeCategory === 'general'
                    ? 'text-white font-semibold shadow-md'
                    : 'bg-[var(--app-surface-high)] text-[var(--app-text-muted)] hover:bg-[var(--app-surface-highest)]'
                }`}
                style={
                  activeCategory === 'general' ? { backgroundColor: 'var(--primary-accent)' } : {}
                }
              >
                <span className="material-symbols-outlined text-[16px]">forum</span>
                <span>{t.pull.hubGeneral}</span>
              </button>
            </div>
          </div>
        )}

        {catalogSearched && (
          <div className="flex flex-col gap-3">
            {catalogLoading && (
              <div className="flex items-center justify-end">
                <span className="text-[11px] text-[var(--app-text-muted)] flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[15px] animate-spin">
                    progress_activity
                  </span>
                  {language === 'zh' ? '查询中…' : 'Loading…'}
                </span>
              </div>
            )}

            {catalogError && (
              <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] p-3 text-[12px] text-[var(--app-text-muted)]">
                {catalogError}{' '}
                <a
                  href={
                    catalogSource === 'huggingface'
                      ? `https://huggingface.co/models?search=${encodeURIComponent(catalogQuery.trim())}&library=gguf`
                      : `https://ollama.com/search?q=${encodeURIComponent(catalogQuery.trim())}`
                  }
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold underline underline-offset-2"
                  style={{ color: 'var(--primary-accent)' }}
                >
                  {catalogSource === 'huggingface'
                    ? language === 'zh'
                      ? '去 Hugging Face 搜索'
                      : 'Search on Hugging Face'
                    : language === 'zh'
                      ? '去官网搜索'
                      : 'Search on ollama.com'}
                </a>
              </div>
            )}

            {catalogResults.length > 0 && (
              <div id="catalog-results" className="flex flex-col gap-3 scroll-mt-24">
                <div className="flex flex-col gap-3">
                  {visibleCatalogResults.map((result) => {
                    const key = `${result.source}:${result.name}`;
                    return (
                      <CatalogResultRow
                        key={key}
                        result={result}
                        quantsExpanded={Boolean(expandedQuants[key])}
                        onToggleQuants={() =>
                          setExpandedQuants((previous) => ({
                            ...previous,
                            [key]: !previous[key]
                          }))
                        }
                        onUseModel={handleUseCatalogModel}
                      />
                    );
                  })}
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
                  <span className="text-[11px] text-[var(--app-text-muted)] font-code">
                    {catalogFirstIndex}–{catalogLastIndex} / {catalogResults.length}
                  </span>
                  {catalogPageCount > 1 && (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => goToCatalogPage(safeCatalogPage - 1)}
                        disabled={safeCatalogPage === 1}
                        aria-label={language === 'zh' ? '上一页' : 'Previous page'}
                        className="w-8 h-8 rounded-full flex items-center justify-center bg-[var(--app-surface-high)] text-[var(--app-text-muted)] hover:text-[var(--app-text)] border border-[var(--app-border)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[18px]">chevron_left</span>
                      </button>
                      {Array.from({ length: catalogPageCount }, (_, index) => index + 1).map(
                        (page) => (
                          <button
                            key={page}
                            type="button"
                            onClick={() => goToCatalogPage(page)}
                            aria-current={page === safeCatalogPage ? 'page' : undefined}
                            className={`w-8 h-8 rounded-full text-[12px] font-code font-semibold transition-colors cursor-pointer ${
                              page === safeCatalogPage
                                ? 'text-white'
                                : 'bg-[var(--app-surface-high)] text-[var(--app-text-muted)] hover:text-[var(--app-text)] border border-[var(--app-border)]'
                            }`}
                            style={
                              page === safeCatalogPage
                                ? { backgroundColor: 'var(--primary-accent)' }
                                : {}
                            }
                          >
                            {page}
                          </button>
                        )
                      )}
                      <button
                        type="button"
                        onClick={() => goToCatalogPage(safeCatalogPage + 1)}
                        disabled={safeCatalogPage === catalogPageCount}
                        aria-label={language === 'zh' ? '下一页' : 'Next page'}
                        className="w-8 h-8 rounded-full flex items-center justify-center bg-[var(--app-surface-high)] text-[var(--app-text-muted)] hover:text-[var(--app-text)] border border-[var(--app-border)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[18px]">chevron_right</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {!catalogSearched && (
          <>
            {filteredCurated.length === 0 && (
              <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] p-4 text-[12px] text-[var(--app-text-muted)]">
                {language === 'zh'
                  ? '该分类下没有本地精选；切换到“全部精选”，或使用上方搜索。'
                  : 'No curated models in this category. Choose “All” or use search above.'}
              </div>
            )}

            {/* 模型卡片栅格 */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {filteredCurated.map((m) => (
                <div
                  key={m.id}
                  className="flex flex-col justify-between bg-[var(--app-surface)] rounded-3xl p-6 hover:-translate-y-1 transition-all duration-200 shadow-md group border border-[var(--app-border)]"
                >
                  <div className="flex flex-col gap-3">
                    <div className="flex items-start justify-between">
                      <div
                        className={`w-10 h-10 rounded-2xl ${m.iconBg} ${m.iconColor} flex items-center justify-center border border-[var(--app-border)]`}
                      >
                        <span className="material-symbols-outlined text-[24px]">{m.icon}</span>
                      </div>
                      <span
                        className={`text-[11px] px-2.5 py-0.5 rounded-full font-bold border ${
                          m.hardwareFitColor === 'green'
                            ? 'bg-[#27c93f]/15 text-[#27c93f] border-[#27c93f]/30'
                            : 'bg-[#ba4385]/20 text-[#ffafd3] border-[#ba4385]/30'
                        }`}
                      >
                        {language === 'zh' ? m.hardwareFit : (m.hardwareFitEn ?? m.hardwareFit)}
                      </span>
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-headline text-[18px] text-[var(--app-text)] font-bold transition-colors">
                          {m.name}
                        </h4>
                        <span className="text-[var(--app-text-muted)] text-xs font-code">
                          {m.version}
                        </span>
                      </div>
                      <p className="text-[12px] text-[var(--app-text-muted)] line-clamp-2 mt-1 leading-relaxed">
                        {language === 'zh' ? m.description : (m.descriptionEn ?? m.description)}
                      </p>
                    </div>

                    {/* 尺寸选择胶囊 */}
                    <div className="flex items-center gap-1.5 flex-wrap pt-1">
                      {m.sizes.map((s) => {
                        const isSelected = m.activeSize === s;
                        return (
                          <button
                            key={s}
                            onClick={() => handleSizeChange(m.id, s)}
                            className={`px-2.5 py-0.5 rounded-full text-[11px] font-code transition-colors cursor-pointer ${
                              isSelected
                                ? 'text-white font-bold shadow-sm'
                                : 'bg-[var(--app-surface-high)] text-[var(--app-text-muted)] hover:text-[var(--app-text)]'
                            }`}
                            style={isSelected ? { backgroundColor: 'var(--primary-accent)' } : {}}
                          >
                            {s}
                          </button>
                        );
                      })}
                      {m.tagNote && (
                        <span className="text-[11px] text-[var(--app-text-muted)] font-code pl-1">
                          {language === 'zh' ? m.tagNote : (m.tagNoteEn ?? m.tagNote)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 卡片底栏 */}
                  <div className="flex items-center justify-between pt-4 mt-4 bg-[var(--app-surface-high)] -mx-6 -mb-6 p-4 rounded-b-3xl border-t border-[var(--app-border)]">
                    <div className="flex flex-col">
                      <span className="font-code text-[11px] text-[var(--app-text-muted)]">
                        {t.pull.volume} {m.sizeGb}
                      </span>
                      <span className="text-[10px] text-[var(--app-text-muted)]">
                        {t.pull.pullCount} {m.pullCount}
                      </span>
                    </div>
                    <button
                      onClick={() => handleQuickPullModel(`${m.name}:${m.activeSize}`)}
                      className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-white transition-all font-semibold active:scale-95 text-[12px] cursor-pointer shadow-sm"
                      style={{ backgroundColor: 'var(--primary-accent)' }}
                    >
                      <span className="material-symbols-outlined text-[16px]">download</span>
                      <span>
                        {t.pull.pullBtnPrefix} {m.activeSize.toUpperCase()}
                      </span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      {/* 4. 本地 GGUF 导入面板 (Local Model File Hub) */}
      <section className="bg-[var(--app-surface-high)] rounded-3xl p-6 sm:p-8 flex flex-col gap-4 shadow-lg border border-[var(--app-border)]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="font-headline text-[18px] text-[var(--app-text)] font-bold flex items-center gap-2">
              <span
                className="material-symbols-outlined text-[22px]"
                style={{ color: 'var(--primary-accent)' }}
              >
                extension
              </span>
              {t.pull.importTitle}
            </h3>
            <p className="text-[13px] text-[var(--app-text-muted)]">{t.pull.importSubtitle}</p>
          </div>
          <button
            onClick={() => showToast(t.pull.importDocLink)}
            className="self-start sm:self-center flex items-center gap-1 text-[13px] hover:underline cursor-pointer"
            style={{ color: 'var(--primary-accent)' }}
          >
            <span>{t.pull.importDocLink}</span>
            <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
          </button>
        </div>

        {/* 拖拽区域 */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => {
            if (!importingGguf) document.getElementById('ggufFileInput')?.click();
          }}
          className={`group relative rounded-2xl bg-[var(--app-surface)] hover:bg-[var(--app-surface-highest)] border-2 border-dashed border-[var(--app-border)] transition-all p-8 flex flex-col items-center justify-center text-center shadow-inner ${importingGguf ? 'opacity-70 cursor-wait' : 'cursor-pointer'}`}
        >
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center mb-3 group-hover:scale-110 transition-transform"
            style={{
              backgroundColor: 'var(--app-surface-highest)',
              color: 'var(--primary-accent)'
            }}
          >
            <span className="material-symbols-outlined text-[32px]">upload_file</span>
          </div>
          <h4 className="font-headline text-[16px] text-[var(--app-text)] font-medium">
            {importingGguf
              ? language === 'zh'
                ? '正在上传并注册 GGUF…'
                : 'Uploading and registering GGUF…'
              : t.pull.dropzoneTitle}
          </h4>
          <p className="text-[12px] text-[var(--app-text-muted)] max-w-md mt-1 leading-relaxed">
            {t.pull.dropzoneDesc}
          </p>
          <div className="flex items-center gap-2 mt-4 flex-wrap justify-center">
            <span className="bg-[var(--app-surface-high)] text-[var(--app-text-muted)] font-code text-[11px] px-3 py-1 rounded-full border border-[var(--app-border)]">
              {t.pull.tagFrom}
            </span>
            <span className="bg-[var(--app-surface-high)] text-[var(--app-text-muted)] font-code text-[11px] px-3 py-1 rounded-full border border-[var(--app-border)]">
              {t.pull.tagSystem}
            </span>
          </div>
          <input
            id="ggufFileInput"
            type="file"
            accept=".gguf"
            disabled={importingGguf}
            onChange={handleFileInputChange}
            className="hidden"
          />
        </div>
      </section>
    </div>
  );
};
