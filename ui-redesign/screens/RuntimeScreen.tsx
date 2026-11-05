import { useState } from 'react';
import type { Copy, Lang } from '../copy';
import { fill } from '../copy';
import { useRuntimeData } from '../hooks/useRuntimeData';
import type { DownloadsData } from '../hooks/useDownloads';
import type { OllamaData } from '../hooks/useOllamaData';
import { unloadModel } from '../lib/legacy';
import type { OllamaModel, OllamaRunning } from '../lib/legacy';
import {
  displayValue,
  errorMessage,
  formatBytes,
  formatLoad,
  formatPercent,
  formatTime,
  ratio
} from '../lib/format';
import { categoryLabel, modelTraits, splitBytes } from '../lib/labels';
import { CachePanel } from '../components/CachePanel';
import { DaemonPanel } from '../components/DaemonPanel';
import { DownloadsList } from '../components/DownloadsList';
import { Icon } from '../components/Icon';
import { Meter } from '../components/Meter';
import { Sparkline } from '../components/Sparkline';
import { EmptyState, ErrorState, LoadingState } from '../components/StateBlock';

interface RuntimeScreenProps {
  t: Copy;
  lang: Lang;
  pollMs: number;
  ollama: OllamaData;
  downloads: DownloadsData;
  onOpenModels: () => void;
  onOpenPull: () => void;
  onChatModel: (model: OllamaModel) => void;
}

export function RuntimeScreen({
  t,
  lang,
  pollMs,
  ollama,
  downloads,
  onOpenModels,
  onOpenPull,
  onChatModel
}: RuntimeScreenProps) {
  const runtime = useRuntimeData(pollMs);
  const [busyTag, setBusyTag] = useState<string | null>(null);
  const [unloadError, setUnloadError] = useState<string | null>(null);

  const loaded = ollama.models.filter((model) => model.status === 'running');
  const rawByTag = new Map<string, OllamaRunning>();
  for (const item of ollama.running) {
    rawByTag.set(item.name, item);
    rawByTag.set(item.model, item);
  }

  const ollamaReady = ollama.status !== 'connecting' || ollama.lastUpdated != null;
  const vramBytes = loaded.reduce((sum, model) => {
    const raw = rawByTag.get(model.fullTag);
    return sum + (model.sizeVramBytes || raw?.size_vram || 0);
  }, 0);
  const metrics = runtime.metrics;
  const cache = runtime.cache;
  const sep = lang === 'zh' ? '，' : ', ';

  const lede =
    ollama.status === 'online'
      ? fill(t.runtime.ledeOnline, {
          version: ollama.version ?? t.common.notAvailable,
          models: ollama.models.length,
          running: loaded.length
        })
      : ollama.status === 'offline'
        ? t.runtime.ledeOffline
        : t.runtime.ledeConnecting;

  const vramParts = splitBytes(vramBytes);
  const diskParts = splitBytes(metrics?.disk.usedBytes);
  const cacheParts = splitBytes(cache?.reclaimableBytes);
  const ollamaTime = formatTime(ollama.lastUpdated, lang);
  const unifiedNote = metrics
    ? fill(t.runtime.unifiedOf, {
        total: formatBytes(metrics.memory.totalBytes) ?? t.common.notAvailable
      })
    : t.runtime.unifiedUnknown;
  const vramNote = ollamaTime
    ? `${unifiedNote}${sep}${t.common.updatedAt} ${ollamaTime}`
    : unifiedNote;
  const diskNote = metrics
    ? fill(t.runtime.diskFree, {
        free: formatBytes(metrics.disk.freeBytes) ?? t.common.notAvailable
      })
    : t.common.notAvailable;
  const cacheTime = formatTime(cache?.scannedAt, lang);
  const cacheNote = cacheTime
    ? fill(t.runtime.cacheScanned, { time: cacheTime })
    : runtime.loading.cache
      ? t.common.loading
      : t.common.notAvailable;

  const handleUnload = async (model: OllamaModel) => {
    setBusyTag(model.fullTag);
    setUnloadError(null);
    try {
      await unloadModel(model.fullTag, {
        kind: model.capabilities?.includes('embedding') ? 'embed' : 'generate'
      });
      await ollama.refresh();
    } catch (caught) {
      setUnloadError(errorMessage(caught) || t.common.unknownError);
    } finally {
      setBusyTag(null);
    }
  };

  const loadedCount = ollamaReady
    ? fill(t.runtime.loadedCount, { count: loaded.length })
    : t.common.loading;

  return (
    <div className="screen">
      <header className="screen__head">
        <div className="screen__head-main">
          <h1>{t.runtime.title}</h1>
          <p className="screen__lede">{lede}</p>
        </div>
        <div className="screen__actions">
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => void runtime.refreshReadings()}
            disabled={runtime.loading.metrics || runtime.loading.daemon}
          >
            <Icon name="refresh" />
            {t.runtime.refreshReadings}
          </button>
        </div>
      </header>

      <section className="panel-grid readings" aria-label={t.runtime.title}>
        <div className="reading">
          <span className="reading__label">{t.runtime.vram}</span>
          {!ollamaReady ? (
            <span className="reading__value reading__value--text">{t.common.notAvailable}</span>
          ) : vramParts ? (
            <span className="reading__value">
              {vramParts.value}
              <span className="reading__unit">{vramParts.unit}</span>
            </span>
          ) : (
            <span className="reading__value reading__value--text">{t.common.notAvailable}</span>
          )}
          <span className="reading__note">{ollamaReady ? vramNote : t.common.loading}</span>
        </div>

        <div className="reading">
          <span className="reading__label">{t.runtime.installed}</span>
          <span className="reading__value reading__value--plain">
            {ollamaReady ? ollama.models.length : t.common.notAvailable}
          </span>
          <span className="reading__note">{t.runtime.installedNote}</span>
        </div>

        <div className="reading">
          <span className="reading__label">{t.runtime.disk}</span>
          {diskParts ? (
            <span className="reading__value reading__value--plain">
              {diskParts.value}
              <span className="reading__unit">{diskParts.unit}</span>
            </span>
          ) : (
            <span className="reading__value reading__value--text">{t.common.notAvailable}</span>
          )}
          <span className="reading__note">{diskNote}</span>
        </div>

        <div className="reading">
          <span className="reading__label">{t.runtime.cache}</span>
          {cacheParts ? (
            <span className="reading__value reading__value--plain">
              {cacheParts.value}
              <span className="reading__unit">{cacheParts.unit}</span>
            </span>
          ) : (
            <span className="reading__value reading__value--text">{t.common.notAvailable}</span>
          )}
          <span className="reading__note">{cacheNote}</span>
        </div>
      </section>

      <section className="panel">
        <div className="panel__head">
          <h2 className="panel__title">{t.runtime.loadedModels}</h2>
          <span className="panel__meta">{loadedCount}</span>
        </div>

        {unloadError ? (
          <div className="panel__body">
            <p className="error-text" role="alert">
              {t.runtime.unloadError}: {unloadError}
            </p>
          </div>
        ) : null}

        {!ollamaReady && ollama.status === 'offline' ? (
          <ErrorState
            title={t.runtime.loadedModels}
            text={`${t.errors.ollama} ${ollama.error ?? ''}`}
            retry={() => void ollama.refresh()}
            retryLabel={t.common.retry}
          />
        ) : !ollamaReady ? (
          <LoadingState text={t.common.loading} rows={2} />
        ) : loaded.length === 0 ? (
          <EmptyState
            title={t.runtime.noLoadedTitle}
            text={t.runtime.noLoadedText}
            action={
              <button type="button" className="btn btn--quiet" onClick={onOpenModels}>
                {t.runtime.openModels}
              </button>
            }
          />
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">{t.common.model}</th>
                  <th scope="col">{t.common.quant}</th>
                  <th scope="col">{t.common.context}</th>
                  <th scope="col">{t.runtime.vram}</th>
                  <th scope="col">{t.runtime.expires}</th>
                  <th scope="col">{t.common.actions}</th>
                </tr>
              </thead>
              <tbody>
                {loaded.map((model) => {
                  const raw = rawByTag.get(model.fullTag);
                  const bytes = model.sizeVramBytes || raw?.size_vram || 0;
                  const sub = [categoryLabel(model.category, t), modelTraits(model)]
                    .filter(Boolean)
                    .join(', ');

                  return (
                    <tr key={model.id}>
                      <td data-label={t.common.model}>
                        <div className="cell-main">{model.fullTag}</div>
                        {sub ? <div className="cell-sub">{sub}</div> : null}
                      </td>
                      <td data-label={t.common.quant} className="num">
                        {displayValue(model.quantization) ?? t.common.notAvailable}
                      </td>
                      <td data-label={t.common.context} className="num">
                        {displayValue(model.context) ?? t.common.notAvailable}
                      </td>
                      <td data-label={t.runtime.vram} className="num">
                        {formatBytes(bytes) ?? t.common.notAvailable}
                      </td>
                      <td data-label={t.runtime.expires} className="num">
                        {raw?.expires_at ? (
                          <time dateTime={raw.expires_at}>
                            {formatTime(raw.expires_at, lang) ?? t.common.notAvailable}
                          </time>
                        ) : (
                          t.common.notAvailable
                        )}
                      </td>
                      <td data-actions data-label="">
                        <div className="actions-row actions-row--end">
                          <button
                            type="button"
                            className="btn btn--quiet btn--small"
                            onClick={() => onChatModel(model)}
                          >
                            {t.runtime.chat}
                          </button>
                          <button
                            type="button"
                            className="btn btn--quiet btn--small"
                            onClick={() => void handleUnload(model)}
                            disabled={busyTag !== null}
                          >
                            {busyTag === model.fullTag ? t.models.unloading : t.runtime.unload}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="runtime-grid">
        <section className="panel span-12">
          <div className="panel__head">
            <h2 className="panel__title">{t.runtime.resources}</h2>
            <span className="panel__meta">
              {metrics
                ? fill(t.runtime.resourcesAt, {
                    time: formatTime(metrics.collectedAt, lang) ?? t.common.notAvailable
                  })
                : runtime.loading.metrics
                  ? t.common.loading
                  : t.common.notAvailable}
            </span>
          </div>

          {runtime.errors.metrics && metrics ? (
            <div className="panel__body">
              <p className="error-text" role="alert">
                {t.errors.metrics} {runtime.errors.metrics}
              </p>
              <button
                type="button"
                className="btn btn--quiet"
                onClick={() => void runtime.refreshReadings()}
              >
                {t.common.retry}
              </button>
            </div>
          ) : null}

          {!metrics && runtime.loading.metrics ? (
            <LoadingState text={t.common.loading} reading rows={2} />
          ) : !metrics ? (
            <ErrorState
              title={t.runtime.resources}
              text={`${t.errors.metrics} ${runtime.errors.metrics ?? ''}`}
              retry={() => void runtime.refreshReadings()}
              retryLabel={t.common.retry}
            />
          ) : (
            <div className="resource-grid">
              <div className="resource">
                <span className="resource__label">{t.runtime.cpu}</span>
                <span className="resource__value">
                  {formatLoad(metrics.cpu.load1) ?? t.common.notAvailable}
                </span>
                <span className="resource__note">
                  {fill(t.runtime.cpuNote, { cores: metrics.cpu.cores })}
                </span>
                <Sparkline
                  values={runtime.samples.map((sample) => sample.cpuLoad)}
                  emptyText={t.runtime.collecting}
                />
              </div>

              <div className="resource">
                <span className="resource__label">{t.runtime.gpu}</span>
                <span className="resource__value">
                  {metrics.gpu.available
                    ? (formatPercent(metrics.gpu.utilizationPercent) ?? t.common.notAvailable)
                    : t.common.notAvailable}
                </span>
                <span className="resource__note">
                  {metrics.gpu.available
                    ? (metrics.gpu.name ?? t.runtime.gpu)
                    : t.runtime.gpuUnavailable}
                </span>
                <Sparkline
                  values={runtime.samples
                    .map((sample) => sample.gpuPercent)
                    .filter((value): value is number => value != null)}
                  emptyText={t.runtime.collecting}
                />
              </div>

              <div className="resource">
                <span className="resource__label">{t.runtime.memory}</span>
                <span className="resource__value">
                  {formatBytes(metrics.memory.usedBytes) ?? t.common.notAvailable}
                </span>
                <span className="resource__note">
                  {fill(t.runtime.memoryOf, {
                    total: formatBytes(metrics.memory.totalBytes) ?? t.common.notAvailable
                  })}
                </span>
                <Meter value={ratio(metrics.memory.usedBytes, metrics.memory.totalBytes)} />
              </div>

              <div className="resource">
                <span className="resource__label">{t.runtime.diskUsed}</span>
                <span className="resource__value">
                  {formatBytes(metrics.disk.usedBytes) ?? t.common.notAvailable}
                </span>
                <span className="resource__note">
                  {fill(t.runtime.diskOf, {
                    total: formatBytes(metrics.disk.totalBytes) ?? t.common.notAvailable
                  })}
                </span>
                <Meter value={ratio(metrics.disk.usedBytes, metrics.disk.totalBytes)} />
              </div>
            </div>
          )}
        </section>

        <div className="span-6">
          <DaemonPanel
            daemon={runtime.daemon}
            loading={runtime.loading.daemon}
            error={runtime.errors.daemon}
            t={t}
            onRetry={() => void runtime.refreshReadings()}
            onControl={runtime.control}
          />
        </div>

        <div className="span-6">
          <CachePanel
            cache={cache}
            loading={runtime.loading.cache}
            error={runtime.errors.cache}
            t={t}
            lang={lang}
            onRescan={() => void runtime.refreshCache()}
            onClean={runtime.cleanCache}
          />
        </div>

        <section className="panel span-12">
          <div className="panel__head">
            <h2 className="panel__title">{t.runtime.downloads}</h2>
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
              title={t.runtime.downloads}
              text={`${t.errors.downloads} ${downloads.error}`}
              retry={() => void downloads.refresh()}
              retryLabel={t.common.retry}
            />
          ) : (
            <DownloadsList
              jobs={downloads.jobs}
              t={t}
              limit={4}
              onCancel={(id) => void downloads.cancel(id)}
              onOpenPull={onOpenPull}
            />
          )}

          <div className="panel__foot">
            <span className="panel__meta">{t.runtime.downloadsNote}</span>
            <button type="button" className="btn btn--quiet" onClick={onOpenPull}>
              {t.runtime.viewAll}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
