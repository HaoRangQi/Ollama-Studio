import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import type { Copy, Lang } from '../copy';
import { fill } from '../copy';
import type { DownloadsData } from '../hooks/useDownloads';
import {
  findQuantFile,
  searchHuggingFaceCatalog,
  searchModelScopeCatalog,
  searchOllamaCatalog,
  startDownloadJob
} from '../lib/legacy';
import type { CatalogSearchResult, CatalogSource, DownloadJob } from '../lib/legacy';
import { errorMessage, formatCount, sanitizeMeta } from '../lib/format';
import { DownloadsList } from '../components/DownloadsList';
import { EmptyState, ErrorState, LoadingState } from '../components/StateBlock';

interface PullScreenProps {
  t: Copy;
  lang: Lang;
  downloads: DownloadsData;
}

const CHANNELS: readonly CatalogSource[] = ['modelscope', 'huggingface', 'ollama'];

function sourceLabel(source: CatalogSource, t: Copy): string {
  if (source === 'modelscope') return t.pull.sourceModelScope;
  if (source === 'huggingface') return t.pull.sourceHuggingFace;
  return t.pull.sourceOllama;
}

export function PullScreen({ t, lang, downloads }: PullScreenProps) {
  const [tag, setTag] = useState('');
  const [tagBusy, setTagBusy] = useState(false);
  const [tagMessage, setTagMessage] = useState<string | null>(null);
  const [tagError, setTagError] = useState<string | null>(null);

  const [channel, setChannel] = useState<CatalogSource>('modelscope');
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [results, setResults] = useState<CatalogSearchResult[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [quantByResult, setQuantByResult] = useState<Record<string, string>>({});
  const [startingKey, setStartingKey] = useState<string | null>(null);
  const [jobMessage, setJobMessage] = useState<string | null>(null);
  const [jobError, setJobError] = useState<string | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => searchAbortRef.current?.abort();
  }, []);

  const runSearch = useCallback(
    async (rawQuery: string, source: CatalogSource) => {
      const trimmed = rawQuery.trim();
      if (!trimmed) return;

      searchAbortRef.current?.abort();
      const controller = new AbortController();
      searchAbortRef.current = controller;
      setSearching(true);
      setSearchError(null);
      setHasSearched(true);
      setResults([]);

      try {
        const found =
          source === 'ollama'
            ? await searchOllamaCatalog(trimmed, controller.signal)
            : source === 'huggingface'
              ? await searchHuggingFaceCatalog(trimmed, controller.signal)
              : await searchModelScopeCatalog(trimmed, controller.signal);

        if (searchAbortRef.current !== controller) return;
        setResults(found);
        setQuantByResult((previous) => {
          const next = { ...previous };
          for (const result of found) {
            if (result.source === 'ollama') continue;
            const key = `${result.source}:${result.name}`;
            if (!next[key] && result.quants?.[0]) next[key] = result.quants[0];
          }
          return next;
        });
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === 'AbortError') return;
        if (searchAbortRef.current !== controller) return;
        setSearchError(errorMessage(caught) || t.common.unknownError);
      } finally {
        if (searchAbortRef.current === controller) setSearching(false);
      }
    },
    [t.common.unknownError]
  );

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void runSearch(query, channel);
  };

  const changeChannel = (next: CatalogSource) => {
    if (next === channel) return;
    searchAbortRef.current?.abort();
    setChannel(next);
    setResults([]);
    setSearchError(null);
    setHasSearched(false);
    setSearching(false);
  };

  const handleTagPull = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const model = tag.trim();
    if (!model) return;

    setTagBusy(true);
    setTagError(null);
    setTagMessage(null);
    try {
      const job = await startDownloadJob({ kind: 'pull', model });
      setTagMessage(fill(t.pull.started, { model: job.model }));
      setTag('');
      await downloads.refresh();
    } catch (caught) {
      setTagError(errorMessage(caught) || t.common.unknownError);
    } finally {
      setTagBusy(false);
    }
  };

  const startCatalog = async (result: CatalogSearchResult) => {
    const key = `${result.source}:${result.name}`;
    const quant = quantByResult[key] ?? result.quants?.[0] ?? '';
    setStartingKey(key);
    setJobError(null);
    setJobMessage(null);

    try {
      let job: DownloadJob;
      if (result.source === 'ollama') {
        job = await startDownloadJob({ kind: 'pull', model: result.name });
      } else if (result.source === 'huggingface') {
        if (!quant) throw new Error(t.pull.noQuants);
        const file = findQuantFile(result.files, quant);
        job = await startDownloadJob({
          kind: 'huggingface',
          repo: result.name,
          file,
          quant,
          model: `${result.name}:${quant}`
        });
      } else {
        if (!quant) throw new Error(t.pull.noQuants);
        const slash = result.name.indexOf('/');
        if (slash <= 0) throw new Error(t.pull.invalidRepo);
        const namespace = result.name.slice(0, slash);
        const name = result.name.slice(slash + 1);
        const file = findQuantFile(result.files, quant);
        if (!file) throw new Error(t.pull.noFile);
        job = await startDownloadJob({
          kind: 'modelscope',
          namespace,
          name,
          file,
          model: result.name
        });
      }

      setJobMessage(fill(t.pull.downloadStarted, { model: job.model }));
      await downloads.refresh();
    } catch (caught) {
      setJobError(errorMessage(caught) || t.common.unknownError);
    } finally {
      setStartingKey(null);
    }
  };

  return (
    <div className="screen">
      <header className="screen__head">
        <div className="screen__head-main">
          <h1>{t.pull.title}</h1>
          <p className="screen__lede">{t.pull.lede}</p>
        </div>
      </header>

      <section className="panel">
        <div className="panel__head">
          <h2 className="panel__title">{t.pull.byTag}</h2>
        </div>
        <div className="panel__body stack">
          <form className="stack" onSubmit={handleTagPull}>
            <div className="pull-form">
              <div className="field">
                <label className="field__label" htmlFor="pull-tag">
                  {t.pull.tagLabel}
                </label>
                <input
                  id="pull-tag"
                  className="input"
                  value={tag}
                  onChange={(event) => setTag(event.target.value)}
                  placeholder={t.pull.tagPlaceholder}
                  autoComplete="off"
                  spellCheck={false}
                  disabled={tagBusy}
                />
              </div>
              <button type="submit" className="btn btn--primary" disabled={tagBusy || !tag.trim()}>
                {tagBusy ? t.pull.starting : t.pull.start}
              </button>
            </div>
            <p className="field__help">{t.pull.tagHelp}</p>
          </form>
          {tagMessage ? (
            <p className="success-text" role="status">
              {tagMessage}
            </p>
          ) : null}
          {tagError ? (
            <p className="error-text" role="alert">
              {t.pull.startError}: {tagError}
            </p>
          ) : null}
        </div>
      </section>

      <div className="pull-layout">
        <section className="panel">
          <div className="panel__head">
            <h2 className="panel__title">{t.pull.catalog}</h2>
            <span className="panel__meta">
              {hasSearched
                ? fill(t.pull.resultsCount, { count: results.length })
                : sourceLabel(channel, t)}
            </span>
          </div>

          <div className="panel__body stack">
            <div className="catalog-toolbar">
              <div className="segmented" role="group" aria-label={t.pull.channel}>
                {CHANNELS.map((source) => (
                  <button
                    key={source}
                    type="button"
                    className="seg"
                    aria-pressed={channel === source}
                    onClick={() => changeChannel(source)}
                  >
                    {sourceLabel(source, t)}
                  </button>
                ))}
              </div>

              <form className="catalog-search" onSubmit={handleSearch}>
                <div className="field">
                  <label className="field__label" htmlFor="catalog-query">
                    {t.pull.searchLabel}
                  </label>
                  <input
                    id="catalog-query"
                    className="input"
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={t.pull.searchPlaceholder}
                    autoComplete="off"
                    spellCheck={false}
                  />
                </div>
                <button
                  type="submit"
                  className="btn btn--quiet"
                  disabled={searching || !query.trim()}
                >
                  {searching ? t.pull.searching : t.pull.search}
                </button>
              </form>
            </div>

            {jobMessage ? (
              <p className="success-text" role="status">
                {jobMessage}
              </p>
            ) : null}
            {jobError ? (
              <p className="error-text" role="alert">
                {jobError}
              </p>
            ) : null}

            {searching ? (
              <LoadingState text={t.pull.searching} rows={3} />
            ) : searchError ? (
              <ErrorState
                title={t.pull.searchError}
                text={searchError}
                retry={() => void runSearch(query, channel)}
                retryLabel={t.common.retry}
              />
            ) : !hasSearched ? (
              <div className="state state--compact">
                <p className="state__text">{t.pull.searchIdle}</p>
              </div>
            ) : results.length === 0 ? (
              <EmptyState title={t.pull.searchEmpty} />
            ) : (
              <div className="catalog-list">
                {results.map((result, index) => {
                  const key = `${result.source}:${result.name}`;
                  const quants = result.quants ?? [];
                  const quant = quantByResult[key] ?? quants[0] ?? '';
                  const file = findQuantFile(result.files, quant);
                  const starting = startingKey === key;
                  const needsQuant = result.source !== 'ollama';
                  const disabled =
                    starting || (needsQuant && !quant) || (result.source === 'modelscope' && !file);
                  const selectId = `catalog-quant-${index}`;
                  const downloadsLabel = formatCount(result.downloads ?? 0, lang);

                  return (
                    <div className="catalog-row" key={key}>
                      <div className="catalog-row__main">
                        <a
                          className="catalog-row__name"
                          href={result.url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {result.name}
                        </a>
                        <div className="catalog-row__meta">
                          <span className="chip chip--plain">{sourceLabel(result.source, t)}</span>
                          {result.author ? <span>{result.author}</span> : null}
                          {result.downloads != null && downloadsLabel ? (
                            <span>
                              {t.common.downloads} {downloadsLabel}
                            </span>
                          ) : null}
                        </div>
                        {result.description ? (
                          <p className="catalog-row__desc">{sanitizeMeta(result.description)}</p>
                        ) : null}
                      </div>

                      <div className="catalog-row__actions">
                        {needsQuant ? (
                          quants.length > 0 ? (
                            <>
                              <label className="catalog-quant-label" htmlFor={selectId}>
                                {t.pull.quant}
                              </label>
                              <select
                                id={selectId}
                                className="select"
                                value={quant}
                                onChange={(event) =>
                                  setQuantByResult((previous) => ({
                                    ...previous,
                                    [key]: event.target.value
                                  }))
                                }
                                disabled={startingKey !== null}
                              >
                                {quants.map((item) => (
                                  <option key={item} value={item}>
                                    {item}
                                  </option>
                                ))}
                              </select>
                            </>
                          ) : (
                            <span className="field__help">{t.pull.noQuants}</span>
                          )
                        ) : null}
                        <button
                          type="button"
                          className="btn btn--quiet btn--small"
                          onClick={() => void startCatalog(result)}
                          disabled={disabled}
                        >
                          {starting
                            ? t.pull.starting
                            : result.source === 'ollama'
                              ? t.pull.start
                              : t.pull.download}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="panel__foot">
            <span className="panel__note">{t.pull.classicMore}</span>
            <a className="link" href="/">
              {t.app.classic}
            </a>
          </div>
        </section>

        <section className="panel">
          <div className="panel__head">
            <h2 className="panel__title">{t.pull.jobs}</h2>
            <span className="panel__meta">{downloads.jobs.length}</span>
          </div>

          {downloads.error && downloads.jobs.length > 0 ? (
            <div className="panel__body">
              <p className="error-text" role="alert">
                {t.errors.downloads} {downloads.error}
              </p>
            </div>
          ) : null}

          {downloads.loading && downloads.jobs.length === 0 ? (
            <LoadingState text={t.common.loading} rows={2} />
          ) : downloads.error && downloads.jobs.length === 0 ? (
            <ErrorState
              title={t.pull.jobs}
              text={`${t.errors.downloads} ${downloads.error}`}
              retry={() => void downloads.refresh()}
              retryLabel={t.common.retry}
            />
          ) : (
            <DownloadsList
              jobs={downloads.jobs}
              t={t}
              onCancel={(id) => void downloads.cancel(id)}
            />
          )}

          <div className="panel__foot">
            <span className="panel__meta">{t.pull.jobsNote}</span>
          </div>
        </section>
      </div>
    </div>
  );
}
