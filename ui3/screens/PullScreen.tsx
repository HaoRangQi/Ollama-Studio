import { useEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { useTheme } from '../context/ThemeContext';
import {
  favoriteKeyOf,
  findQuantFile,
  loadFavoriteModels,
  readStorageJson,
  resolveFavoriteQuant,
  saveFavoriteModels,
  searchHuggingFaceCatalog,
  searchModelScopeCatalog,
  searchOllamaCatalog,
  toggleFavoriteModel,
  writeStorageJson
} from '../lib/legacy';
import type { CatalogSearchResult, CatalogSource, FavoriteModel } from '../lib/legacy';
import { bytesToGb, formatBytes, formatEta, formatPercent, shortModelName } from '../lib/format';
import type { DownloadRecord } from '../hooks/useDownloads';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Icon } from '../components/Icon';
import { QuantPickerModal } from '../components/QuantPickerModal';

const QUERY_KEY = 'ollama_ui3_catalog_query_v1';
const SOURCE_KEY = 'ollama_ui3_catalog_source_v1';
const PULL_INPUT_KEY = 'ollama_ui3_pull_input_v1';
const QUANT_PREF_KEY = 'ollama_ui3_quant_pref_v1';

const STANDARD_QUANTS = ['Q4_K_M', 'Q5_K_M', 'Q8_0', 'FP16'] as const;

const SOURCES: Array<{
  id: CatalogSource;
  key: 'sourceOllama' | 'sourceModelScope' | 'sourceHuggingFace';
}> = [
  { id: 'ollama', key: 'sourceOllama' },
  { id: 'modelscope', key: 'sourceModelScope' },
  { id: 'huggingface', key: 'sourceHuggingFace' }
];

export interface PullScreenProps {
  records: DownloadRecord[];
  onStartPull: (model: string, quant?: string) => Promise<unknown>;
  onStartModelScope: (target: {
    namespace: string;
    name: string;
    file: string;
    quant: string;
    modelName: string;
  }) => Promise<unknown>;
  onStartHuggingFace: (target: {
    repo: string;
    file: string;
    quant: string;
    modelName: string;
  }) => Promise<unknown>;
  onPause: (record: DownloadRecord) => Promise<void>;
  onResume: (record: DownloadRecord) => Promise<unknown>;
  onCancel: (record: DownloadRecord) => Promise<void>;
  onImportGguf: (file: File) => Promise<void>;
  onGoModels: () => void;
  notify: (message: string, tone?: 'info' | 'success' | 'warn' | 'error') => void;
}

interface QuantTarget {
  result: CatalogSearchResult;
  quants: string[];
}

function readSource(): CatalogSource {
  const stored = readStorageJson<unknown>(SOURCE_KEY, 'ollama');
  return stored === 'modelscope' || stored === 'huggingface' || stored === 'ollama'
    ? stored
    : 'ollama';
}

function readPreferredQuant(): string {
  const stored = readStorageJson<unknown>(QUANT_PREF_KEY, 'Q4_K_M');
  return typeof stored === 'string' && stored.trim() ? stored.trim() : 'Q4_K_M';
}

function statusKey(record: DownloadRecord): string {
  if (record.status === 'paused') return 'paused';
  if (record.status === 'success') return 'complete';
  if (record.status === 'error') return 'failed';
  if (record.status === 'cancelled') return 'cancelled';
  return 'running';
}

function taskPriority(record: DownloadRecord): number {
  if (record.status === 'running') return 0;
  if (record.status === 'paused') return 1;
  if (record.status === 'error') return 2;
  if (record.status === 'success') return 3;
  return 4;
}

export function PullScreen({
  records,
  onStartPull,
  onStartModelScope,
  onStartHuggingFace,
  onPause,
  onResume,
  onCancel,
  onImportGguf,
  onGoModels,
  notify
}: PullScreenProps) {
  const { c, language } = useTheme();
  const [source, setSourceState] = useState<CatalogSource>(readSource);
  const [query, setQueryState] = useState(() => readStorageJson<string>(QUERY_KEY, ''));
  const [pullInput, setPullInputState] = useState(() =>
    readStorageJson<string>(PULL_INPUT_KEY, '')
  );
  const [preferredQuant, setPreferredQuantState] = useState(readPreferredQuant);
  const [results, setResults] = useState<CatalogSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selectedQuants, setSelectedQuants] = useState<Record<string, string>>({});
  const [quantTarget, setQuantTarget] = useState<QuantTarget | null>(null);
  const [cancelTarget, setCancelTarget] = useState<DownloadRecord | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [favorites, setFavorites] = useState<FavoriteModel[]>(loadFavoriteModels);
  // 收藏夹默认收起，避免占用搜索结果的空间；用户展开后仅本次挂载有效。
  const [favoritesOpen, setFavoritesOpen] = useState(false);
  const searchAbortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(
    () => () => {
      searchAbortRef.current?.abort();
    },
    []
  );

  const setSource = (next: CatalogSource) => {
    searchAbortRef.current?.abort();
    setSourceState(next);
    writeStorageJson(SOURCE_KEY, next);
    setResults([]);
    setSearchError(null);
    setSearched(false);
    setSelectedQuants({});
  };

  const setQuery = (value: string) => {
    setQueryState(value);
    writeStorageJson(QUERY_KEY, value);
  };

  const setPullInput = (value: string) => {
    setPullInputState(value);
    writeStorageJson(PULL_INPUT_KEY, value);
  };

  const setPreferredQuant = (value: string) => {
    setPreferredQuantState(value);
    writeStorageJson(QUANT_PREF_KEY, value);
  };

  const favoriteKeys = useMemo(
    () => new Set(favorites.map((favorite) => favoriteKeyOf(favorite))),
    [favorites]
  );

  const persistFavorites = (next: FavoriteModel[], message: string) => {
    setFavorites(next);
    if (!saveFavoriteModels(next)) notify(c.pull.favoriteSaveFailed, 'warn');
    else notify(message, 'success');
  };

  const toggleFavorite = (result: CatalogSearchResult, quant?: string) => {
    const key = favoriteKeyOf(result);
    const wasFavorite = favoriteKeys.has(key);
    persistFavorites(
      toggleFavoriteModel(favorites, result, quant),
      wasFavorite ? c.pull.unfavorited(result.name) : c.pull.favorited(result.name)
    );
  };

  const removeFavorite = (favorite: FavoriteModel) => {
    persistFavorites(
      favorites.filter((item) => favoriteKeyOf(item) !== favoriteKeyOf(favorite)),
      c.pull.unfavorited(favorite.name)
    );
  };

  const search = async () => {
    const keyword = query.trim();
    if (!keyword || loading) return;
    searchAbortRef.current?.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;
    setLoading(true);
    setSearched(true);
    setSearchError(null);
    setSelectedQuants({});
    try {
      const found =
        source === 'modelscope'
          ? await searchModelScopeCatalog(keyword, controller.signal)
          : source === 'huggingface'
            ? await searchHuggingFaceCatalog(keyword, controller.signal)
            : await searchOllamaCatalog(keyword, controller.signal);
      if (controller.signal.aborted) return;
      setResults(found);
      if (found.length === 0) setSearchError(c.pull.noResults);
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === 'AbortError') return;
      setResults([]);
      setSearchError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  };

  const startPull = async (model: string, quant?: string) => {
    try {
      await onStartPull(model, quant);
      notify(c.pull.started(model), 'success');
    } catch (caught) {
      notify(
        `${c.pull.startFailed}: ${caught instanceof Error ? caught.message : String(caught)}`,
        'error'
      );
    }
  };

  const runPullInput = async () => {
    const raw = pullInput
      .trim()
      .replace(/^ollama\s+(pull|run)\s+/i, '')
      .replace(/^["']|["']$/g, '')
      .trim();
    if (!raw) {
      notify(c.pull.emptyCommand, 'warn');
      return;
    }
    if (/^hf\.co\//i.test(raw)) {
      const target = raw.replace(/^hf\.co\//i, '');
      const colon = target.lastIndexOf(':');
      const repo = (colon > 0 ? target.slice(0, colon) : target).trim();
      const quant = colon > 0 ? target.slice(colon + 1).trim() : '';
      if (repo.includes('/')) {
        try {
          await onStartHuggingFace({
            repo,
            file: '',
            quant,
            modelName: `${repo}${quant ? `:${quant}` : ''}`
          });
          notify(c.pull.started(`${repo}${quant ? `:${quant}` : ''}`), 'success');
        } catch (caught) {
          notify(
            `${c.pull.startFailed}: ${caught instanceof Error ? caught.message : String(caught)}`,
            'error'
          );
        }
        return;
      }
    }
    await startPull(raw);
  };

  const downloadResult = async (result: CatalogSearchResult, quant: string) => {
    if (result.source === 'modelscope') {
      if (!quant) {
        notify(c.pull.noQuantSelected, 'warn');
        return;
      }
      const file = findQuantFile(result.files, quant);
      const [namespace, name] = result.name.split('/');
      if (!file || !namespace || !name) {
        notify(c.pull.noQuants, 'warn');
        return;
      }
      try {
        await onStartModelScope({
          namespace,
          name,
          file,
          quant,
          modelName: result.name
        });
        notify(c.pull.started(result.name), 'success');
      } catch (caught) {
        notify(
          `${c.pull.startFailed}: ${caught instanceof Error ? caught.message : String(caught)}`,
          'error'
        );
      }
      return;
    }

    if (result.source === 'huggingface') {
      if (!quant) {
        notify(c.pull.noQuantSelected, 'warn');
        return;
      }
      const file = findQuantFile(result.files, quant) ?? '';
      try {
        await onStartHuggingFace({
          repo: result.name,
          file,
          quant,
          modelName: `${result.name}:${quant}`
        });
        notify(c.pull.started(`${result.name}:${quant}`), 'success');
      } catch (caught) {
        notify(
          `${c.pull.startFailed}: ${caught instanceof Error ? caught.message : String(caught)}`,
          'error'
        );
      }
      return;
    }

    await startPull(result.name, quant);
  };

  const requestDownload = (result: CatalogSearchResult) => {
    const quants = result.quants?.length ? result.quants : [];
    if (quants.length > 0) {
      setQuantTarget({ result, quants });
      return;
    }
    if (result.source !== 'ollama') {
      notify(c.pull.noQuants, 'warn');
      return;
    }
    void downloadResult(result, '');
  };

  const resultKey = (result: CatalogSearchResult) => `${result.source}:${result.name}`;

  const fillCommand = (result: CatalogSearchResult) => {
    if (result.source === 'ollama') {
      setPullInput(`ollama pull ${result.name}`);
      return;
    }
    if (result.source === 'huggingface') {
      const quant = selectedQuants[resultKey(result)] || result.quants?.[0] || preferredQuant;
      setPullInput(`ollama pull hf.co/${result.name}:${quant}`);
    }
  };

  const importFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.gguf')) {
      notify(language === 'zh' ? '仅支持 .gguf 文件' : 'Only .gguf files are supported', 'warn');
      return;
    }
    setImporting(true);
    try {
      await onImportGguf(file);
    } catch {
      // App 已提示。
    } finally {
      setImporting(false);
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void importFile(file);
  };

  const sortedTasks = useMemo(
    () =>
      [...records].sort((a, b) => {
        const priority = taskPriority(a) - taskPriority(b);
        if (priority !== 0) return priority;
        return b.startedAt - a.startedAt;
      }),
    [records]
  );

  const totalTaskBytes = useMemo(
    () => records.reduce((sum, record) => sum + (record.total || 0), 0),
    [records]
  );

  const handlePause = async (record: DownloadRecord) => {
    setPendingId(record.id);
    try {
      await onPause(record);
      notify(c.pull.paused(shortModelName(record.model)), 'info');
    } catch (caught) {
      notify(
        c.pull.startFailed + ': ' + (caught instanceof Error ? caught.message : String(caught)),
        'error'
      );
    } finally {
      setPendingId(null);
    }
  };

  const handleResume = async (record: DownloadRecord) => {
    setPendingId(record.id);
    try {
      await onResume(record);
      notify(c.pull.resumed(shortModelName(record.model)), 'success');
    } catch (caught) {
      notify(
        c.pull.startFailed + ': ' + (caught instanceof Error ? caught.message : String(caught)),
        'error'
      );
    } finally {
      setPendingId(null);
    }
  };

  const handleCancel = async (record: DownloadRecord) => {
    setPendingId(record.id);
    try {
      await onCancel(record);
      notify(c.pull.cancelled(shortModelName(record.model)), 'info');
    } catch (caught) {
      notify(
        c.pull.startFailed + ': ' + (caught instanceof Error ? caught.message : String(caught)),
        'error'
      );
    } finally {
      setPendingId(null);
      setCancelTarget(null);
    }
  };

  const sourceLabel: Record<CatalogSource, string> = {
    ollama: c.pull.sourceOllama,
    modelscope: c.pull.sourceModelScope,
    huggingface: c.pull.sourceHuggingFace
  };

  const quantOptions = useMemo(
    () =>
      STANDARD_QUANTS.map((quant) => ({
        quant,
        label:
          quant === 'Q4_K_M'
            ? c.quant.optionQ4
            : quant === 'Q5_K_M'
              ? c.quant.optionQ5
              : quant === 'Q8_0'
                ? c.quant.optionQ8
                : c.quant.optionFP16,
        desc:
          quant === 'Q4_K_M'
            ? c.quant.descQ4
            : quant === 'Q5_K_M'
              ? c.quant.descQ5
              : quant === 'Q8_0'
                ? c.quant.descQ8
                : c.quant.descFP16,
        recommended: quant === 'Q4_K_M'
      })),
    [c]
  );

  return (
    <div className="pull-layout">
      <div className="pull-main">
        <header className="page-head">
          <div>
            <span className="eyebrow">{c.pull.eyebrow}</span>
            <h2>{c.pull.title}</h2>
            <p>{c.pull.subtitle}</p>
          </div>
        </header>

        <div className="cli-bar">
          <span className="cli-prompt">$</span>
          <input
            value={pullInput}
            onChange={(event) => setPullInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void runPullInput();
              }
            }}
            placeholder={c.pull.cliPlaceholder}
            className="cli-input"
            spellCheck={false}
            aria-label={c.pull.cliPlaceholder}
          />
          <button type="button" className="cli-run" onClick={() => void runPullInput()}>
            <Icon name="play_arrow" size={15} filled />
            {c.pull.run}
          </button>
        </div>

        <div className="search-row">
          <div className="source-tabs" role="tablist" aria-label={c.pull.source}>
            {SOURCES.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={source === item.id}
                className={source === item.id ? 'is-active' : ''}
                onClick={() => setSource(item.id)}
              >
                {c.pull[item.key]}
              </button>
            ))}
          </div>
          <div className="catalog-search">
            <Icon name="search" size={18} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void search();
                }
              }}
              placeholder={c.pull.searchPlaceholder}
              aria-label={c.pull.search}
              spellCheck={false}
            />
            <button
              type="button"
              className="btn btn-sage btn-sm"
              onClick={() => void search()}
              disabled={loading || !query.trim()}
            >
              {loading ? <Icon name="progress_activity" size={16} /> : c.pull.searchShort}
            </button>
          </div>
        </div>

        {favorites.length > 0 && (
          <section className="pull-section favorites-section">
            <div className="section-head">
              <h3>{c.pull.favorites}</h3>
              <span className="muted">{favorites.length}</span>
              <span className="muted favorites-hint">{c.pull.favoritesHint}</span>
              <span className="spacer" />
              <button
                type="button"
                className="text-button"
                aria-expanded={favoritesOpen}
                onClick={() => setFavoritesOpen((open) => !open)}
              >
                <Icon name={favoritesOpen ? 'expand_less' : 'expand_more'} size={15} />
                {favoritesOpen ? c.pull.favoritesCollapse : c.pull.favoritesExpand}
              </button>
            </div>

            {favoritesOpen && (
              <div className="favorites-grid">
                {favorites.map((favorite) => {
                  const quant = resolveFavoriteQuant(favorite) ?? '';
                  const canDownload = favorite.source === 'ollama' || Boolean(quant);
                  return (
                    <article className="favorite-card" key={favoriteKeyOf(favorite)}>
                      <div className="favorite-head">
                        <span className="result-glyph">
                          <Icon
                            name={
                              favorite.source === 'huggingface'
                                ? 'image'
                                : favorite.source === 'modelscope'
                                  ? 'deployed_code'
                                  : 'cloud'
                            }
                            size={18}
                          />
                        </span>
                        <div className="favorite-title">
                          <h4 title={favorite.name}>{favorite.name}</h4>
                          {favorite.description && <p>{favorite.description}</p>}
                          <div className="favorite-tags">
                            <span
                              className={`tag ${
                                favorite.source === 'huggingface' ? 'tag-apricot' : 'tag-sage'
                              }`}
                            >
                              {sourceLabel[favorite.source]}
                            </span>
                            {quant && <span className="tag tag-mist">{quant}</span>}
                          </div>
                        </div>
                        <button
                          type="button"
                          className="iconbtn small favorite-toggle is-active"
                          onClick={() => removeFavorite(favorite)}
                          aria-label={c.pull.unfavorite}
                          title={c.pull.unfavorite}
                        >
                          <Icon name="star" size={17} filled />
                        </button>
                      </div>
                      <div className="favorite-actions">
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          disabled={!canDownload}
                          onClick={() => void downloadResult(favorite, quant)}
                        >
                          <Icon name="download" size={15} />
                          {c.pull.download}
                        </button>
                        {favorite.source !== 'modelscope' && (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => fillCommand(favorite)}
                          >
                            <Icon name="terminal" size={15} />
                            {c.pull.fillCommand}
                          </button>
                        )}
                        <button
                          type="button"
                          className="iconbtn small"
                          onClick={() => window.open(favorite.url, '_blank', 'noopener,noreferrer')}
                          aria-label={c.pull.favoriteOpenSource}
                          title={c.pull.favoriteOpenSource}
                        >
                          <Icon name="open_in_new" size={17} />
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        )}

        <section className="pull-section">
          <div className="section-head">
            <h3>{c.pull.downloads}</h3>
            <span className="muted">
              {c.pull.taskCount(records.length)}
              {totalTaskBytes > 0
                ? ` · ${c.pull.taskBytes(`${bytesToGb(totalTaskBytes)} GB`)}`
                : ''}
            </span>
            <span className="spacer" />
            {records.some((record) => record.status === 'success') && (
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  for (const record of records) {
                    if (record.status !== 'running' && record.status !== 'paused') {
                      void onCancel(record);
                    }
                  }
                }}
              >
                {c.pull.cancelled('')}
              </button>
            )}
          </div>

          {sortedTasks.length === 0 ? (
            <div className="task-empty">
              <span className="task-empty-icon">
                <Icon name="download" size={22} />
              </span>
              <div>
                <b>{c.pull.noTasks}</b>
                <p>{c.pull.noTasksHint}</p>
              </div>
            </div>
          ) : (
            <div className="task-list">
              {sortedTasks.map((record) => {
                const percent =
                  record.status === 'success'
                    ? 100
                    : record.total > 0
                      ? (record.completed / record.total) * 100
                      : 0;
                const eta =
                  record.speedBps > 0 && record.total > record.completed
                    ? formatEta((record.total - record.completed) / record.speedBps, language)
                    : '—';
                const isPending = pendingId === record.id;
                return (
                  <article key={record.id} className={`task-card task-${statusKey(record)}`}>
                    <div className="task-head">
                      <div className="task-title">
                        <span>{record.model}</span>
                        {record.quant && <span className="tag tag-mist">{record.quant}</span>}
                        <span className={`tag task-status task-status-${statusKey(record)}`}>
                          {record.status === 'running'
                            ? c.status.running
                            : record.status === 'paused'
                              ? c.status.paused
                              : record.status === 'success'
                                ? c.status.complete
                                : record.status === 'error'
                                  ? c.status.failed
                                  : c.status.cancelled}
                        </span>
                      </div>
                      <span className="task-percent">
                        {record.status === 'success' ? '100%' : formatPercent(percent)}
                      </span>
                    </div>
                    <div
                      className={`task-bar ${record.status === 'running' && record.total <= 0 ? 'is-indeterminate' : ''}`}
                    >
                      <i
                        style={{
                          width: `${record.status === 'success' ? 100 : Math.max(1.5, percent)}%`
                        }}
                      />
                    </div>
                    <div className="task-meta">
                      <span>
                        {record.total > 0
                          ? `${bytesToGb(record.completed)} / ${bytesToGb(record.total)} GB`
                          : formatBytes(record.completed)}
                      </span>
                      {record.status === 'running' && record.speedBps > 0 && (
                        <span>{(record.speedBps / 1_000_000).toFixed(1)} MB/s</span>
                      )}
                      {record.status === 'running' && eta !== '—' && <span>{eta}</span>}
                      {record.layerStatus && record.status !== 'success' && (
                        <span className="task-layer">
                          {translateLayer(record.layerStatus, language)}
                        </span>
                      )}
                      <span className="task-meta-spacer" />
                      {record.status === 'running' && (
                        <>
                          <button
                            type="button"
                            className="task-action"
                            disabled={isPending}
                            onClick={() => void handlePause(record)}
                          >
                            <Icon name="pause" size={14} />
                            {c.pull.pause}
                          </button>
                          <button
                            type="button"
                            className="task-action"
                            disabled={isPending}
                            onClick={() => setCancelTarget(record)}
                          >
                            <Icon name="close" size={14} />
                            {c.pull.cancel}
                          </button>
                        </>
                      )}
                      {record.status === 'paused' && (
                        <>
                          <button
                            type="button"
                            className="task-action"
                            disabled={isPending}
                            onClick={() => void handleResume(record)}
                          >
                            <Icon name="play_arrow" size={14} />
                            {c.pull.resume}
                          </button>
                          <button
                            type="button"
                            className="task-action"
                            disabled={isPending}
                            onClick={() => void handleCancel(record)}
                          >
                            <Icon name="close" size={14} />
                            {c.pull.cancel}
                          </button>
                        </>
                      )}
                      {record.status === 'success' && (
                        <button type="button" className="task-action" onClick={onGoModels}>
                          <Icon name="arrow_forward" size={14} />
                          {c.pull.goModels}
                        </button>
                      )}
                      {record.status === 'error' && (
                        <>
                          <button
                            type="button"
                            className="task-action"
                            disabled={isPending}
                            onClick={() => void handleResume(record)}
                          >
                            <Icon name="refresh" size={14} />
                            {c.pull.retry}
                          </button>
                          <button
                            type="button"
                            className="task-action"
                            disabled={isPending}
                            onClick={() => setCancelTarget(record)}
                          >
                            <Icon name="delete" size={14} />
                            {c.pull.cancel}
                          </button>
                        </>
                      )}
                      {record.status === 'cancelled' && (
                        <button
                          type="button"
                          className="task-action"
                          disabled={isPending}
                          onClick={() => void handleCancel(record)}
                        >
                          <Icon name="delete" size={14} />
                          {c.pull.cancel}
                        </button>
                      )}
                    </div>
                    {record.error && (
                      <details className="task-error">
                        <summary>{c.common.details}</summary>
                        <p>{record.error}</p>
                      </details>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section className="pull-section">
          <div className="section-head">
            <h3>
              {searched && results.length > 0 ? c.pull.resultsTitle(results.length) : c.pull.search}
            </h3>
            <span className="muted">{c.pull.searchHint}</span>
          </div>

          {searchError && <div className="inline-error">{searchError}</div>}

          {results.length > 0 && (
            <div className="catalog-results">
              {results.map((result) => {
                const key = resultKey(result);
                const quants = result.quants ?? [];
                const selected = selectedQuants[key] || quants[0] || preferredQuant;
                return (
                  <article key={key} className="result-card">
                    <div className="result-head">
                      <span className="result-glyph">
                        <Icon
                          name={
                            result.source === 'huggingface'
                              ? 'image'
                              : result.source === 'modelscope'
                                ? 'deployed_code'
                                : 'cloud'
                          }
                          size={20}
                        />
                      </span>
                      <div className="result-title">
                        <h4>{result.name}</h4>
                        <p>{result.description}</p>
                      </div>
                      <span
                        className={`tag ${result.source === 'huggingface' ? 'tag-apricot' : 'tag-sage'}`}
                      >
                        {sourceLabel[result.source]}
                      </span>
                      <button
                        type="button"
                        className={`iconbtn small favorite-toggle${
                          favoriteKeys.has(key) ? ' is-active' : ''
                        }`}
                        aria-pressed={favoriteKeys.has(key)}
                        aria-label={favoriteKeys.has(key) ? c.pull.unfavorite : c.pull.favorite}
                        title={favoriteKeys.has(key) ? c.pull.unfavorite : c.pull.favorite}
                        onClick={() => toggleFavorite(result, selected)}
                      >
                        <Icon name="star" size={17} filled={favoriteKeys.has(key)} />
                      </button>
                    </div>
                    <div className="result-meta">
                      {result.author && <span>{result.author}</span>}
                      {typeof result.downloads === 'number' && (
                        <span>
                          {c.pull.downloadsLabel}{' '}
                          {result.downloads.toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US')}
                        </span>
                      )}
                      {typeof result.likes === 'number' && (
                        <span>♥ {result.likes.toLocaleString()}</span>
                      )}
                    </div>
                    {quants.length > 0 && (
                      <div className="result-quants">
                        <span className="result-quants-label">{c.pull.chooseQuant}:</span>
                        {quants.map((quant) => (
                          <button
                            key={quant}
                            type="button"
                            className={`quant-chip ${selected === quant ? 'is-active' : ''}`}
                            onClick={() =>
                              setSelectedQuants((current) => ({ ...current, [key]: quant }))
                            }
                            aria-pressed={selected === quant}
                          >
                            {quant}
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="result-actions">
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => requestDownload(result)}
                      >
                        <Icon name="download" size={15} />
                        {c.pull.download}
                      </button>
                      {result.source !== 'modelscope' && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => fillCommand(result)}
                        >
                          <Icon name="terminal" size={15} />
                          {c.pull.fillCommand}
                        </button>
                      )}
                      <button
                        type="button"
                        className="iconbtn small"
                        onClick={() => window.open(result.url, '_blank', 'noopener,noreferrer')}
                        aria-label={c.pull.source}
                      >
                        <Icon name="open_in_new" size={17} />
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {!searched && results.length === 0 && (
            <div className="search-hint-card">
              <Icon name="travel_explore" size={22} />
              <div>
                <b>{c.pull.search}</b>
                <p>{c.pull.searchHint}</p>
              </div>
            </div>
          )}
        </section>
      </div>

      <aside className="pull-side">
        <h4>{c.pull.featured}</h4>
        <section className="feature-card">
          <div className="feature-glow">
            <Icon name="auto_awesome" size={84} />
          </div>
          <span className="feature-badge">{c.pull.featured}</span>
          <h3>{c.pull.featuredTitle}</h3>
          <p>{c.pull.featuredDesc}</p>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => void startPull('llama3.2-vision:11b')}
          >
            <Icon name="download" size={15} />
            {c.pull.pullModel}
          </button>
        </section>

        <h4>{c.pull.quantPref}</h4>
        <section className="quant-panel">
          <div className="quant-panel-head">
            <div>
              <b>{c.pull.quantPref}</b>
              <p>{c.pull.quantPrefDesc}</p>
            </div>
            <span className="tag tag-apricot">{c.quant.preferred}</span>
          </div>
          {quantOptions.map((option) => (
            <button
              key={option.quant}
              type="button"
              className={`quant-option compact ${preferredQuant === option.quant ? 'is-active' : ''}`}
              onClick={() => setPreferredQuant(option.quant)}
              aria-pressed={preferredQuant === option.quant}
            >
              <span className="radio" />
              <span className="quant-name">{option.label}</span>
              <span className="quant-desc">{option.desc}</span>
              {option.recommended && <span className="tag tag-sage">{c.quant.recommended}</span>}
            </button>
          ))}
          <p className="quant-note">{c.pull.quantPrefDesc}</p>
        </section>

        <div
          className={`dropzone ${dragging ? 'is-dragging' : ''}`}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              fileInputRef.current?.click();
            }
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".gguf"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) void importFile(file);
            }}
          />
          <span className="dropzone-icon">
            <Icon name={importing ? 'progress_activity' : 'upload'} size={21} />
          </span>
          <b>{importing ? c.pull.importing : c.pull.dropTitle}</b>
          <p>{importing ? c.pull.importHint : c.pull.dropHint}</p>
        </div>
      </aside>

      <QuantPickerModal
        open={Boolean(quantTarget)}
        modelName={quantTarget?.result.name ?? ''}
        quants={quantTarget?.quants ?? []}
        preferred={preferredQuant}
        onClose={() => setQuantTarget(null)}
        onConfirm={(quant) => {
          if (quantTarget) void downloadResult(quantTarget.result, quant);
        }}
      />

      <ConfirmDialog
        open={Boolean(cancelTarget)}
        title={cancelTarget ? c.pull.cancelTitle(cancelTarget.model) : ''}
        description={c.pull.cancelDesc}
        confirmLabel={c.pull.cancel}
        cancelLabel={c.common.cancel}
        danger
        busy={pendingId === cancelTarget?.id}
        onConfirm={() => {
          if (cancelTarget) void handleCancel(cancelTarget);
        }}
        onCancel={() => setCancelTarget(null)}
      />
    </div>
  );
}

function translateLayer(layer: string, language: 'zh' | 'en'): string {
  const zh = language === 'zh';
  if (layer === 'pulling manifest') return zh ? '读取 manifest…' : 'Pulling manifest…';
  if (layer === 'downloading') return zh ? '下载中…' : 'Downloading…';
  if (layer === 'creating') return zh ? 'ollama create 注册中…' : 'Registering with ollama create…';
  if (layer === 'resolving') return zh ? '解析 GGUF 文件…' : 'Resolving GGUF file…';
  if (layer === 'paused') return zh ? '已暂停' : 'Paused';
  return layer;
}
