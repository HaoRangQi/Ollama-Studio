import { useState } from 'react';
import type { Copy, Lang } from '../copy';
import { fill } from '../copy';
import { errorMessage, formatBytes, formatTime } from '../lib/format';
import type { CacheReport, CleanupResult, CleanupTarget } from '../lib/legacy';
import { ConfirmDialog } from './ConfirmDialog';
import { ErrorState, LoadingState } from './StateBlock';

interface CachePanelProps {
  cache: CacheReport | null;
  loading: boolean;
  error: string | null;
  t: Copy;
  lang: Lang;
  onRescan: () => void;
  onClean: (targets: CleanupTarget[]) => Promise<CleanupResult>;
}

const TARGETS: readonly CleanupTarget[] = ['orphan', 'partial', 'temp'];

function targetLabel(target: CleanupTarget, t: Copy): string {
  if (target === 'orphan') return t.runtime.cleanTargetOrphan;
  if (target === 'partial') return t.runtime.cleanTargetPartial;
  return t.runtime.cleanTargetTemp;
}

export function CachePanel({ cache, loading, error, t, lang, onRescan, onClean }: CachePanelProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selected, setSelected] = useState<Record<CleanupTarget, boolean>>({
    orphan: true,
    partial: true,
    temp: true
  });
  const [cleaning, setCleaning] = useState(false);
  const [cleanError, setCleanError] = useState<string | null>(null);
  const [cleanResult, setCleanResult] = useState<CleanupResult | null>(null);

  const bytesFor = (target: CleanupTarget): number => {
    if (!cache) return 0;
    if (target === 'orphan') return cache.blobs.orphan.bytes;
    if (target === 'partial') return cache.blobs.partial.bytes;
    return cache.temp.bytes;
  };

  const selectedTargets = TARGETS.filter((target) => selected[target] && bytesFor(target) > 0);

  const handleClean = async () => {
    if (selectedTargets.length === 0) return;
    setCleaning(true);
    setCleanError(null);
    try {
      const result = await onClean(selectedTargets);
      setCleanResult(result);
      setDialogOpen(false);
    } catch (caught) {
      setCleanError(errorMessage(caught) || t.common.unknownError);
    } finally {
      setCleaning(false);
    }
  };

  return (
    <section className="panel">
      <div className="panel__head">
        <h2 className="panel__title">{t.runtime.cacheTitle}</h2>
        <span className="panel__meta">
          {cache
            ? fill(t.runtime.cacheScanned, {
                time: formatTime(cache.scannedAt, lang) ?? t.common.notAvailable
              })
            : loading
              ? t.common.loading
              : t.common.notAvailable}
        </span>
      </div>

      {!cache && loading ? (
        <LoadingState text={t.common.loading} rows={3} />
      ) : !cache && error ? (
        <ErrorState
          title={t.runtime.cacheTitle}
          text={`${t.errors.cache} ${error}`}
          retry={onRescan}
          retryLabel={t.common.retry}
        />
      ) : cache ? (
        <>
          <div className="stat-grid">
            <div className="stat">
              <div className="stat__label">{t.runtime.cacheOrphan}</div>
              <div className="stat__value">
                {formatBytes(cache.blobs.orphan.bytes) ?? t.common.notAvailable}
              </div>
            </div>
            <div className="stat">
              <div className="stat__label">{t.runtime.cachePartial}</div>
              <div className="stat__value">
                {formatBytes(cache.blobs.partial.bytes) ?? t.common.notAvailable}
              </div>
            </div>
            <div className="stat">
              <div className="stat__label">{t.runtime.cacheTemp}</div>
              <div className="stat__value">
                {formatBytes(cache.temp.bytes) ?? t.common.notAvailable}
              </div>
            </div>
          </div>

          <div className="panel__body stack">
            {error ? (
              <p className="error-text" role="alert">
                {t.errors.cache} {error}
              </p>
            ) : null}
            {cache.activeDownloads ? (
              <p className="warn-text">{t.runtime.cacheActiveDownloads}</p>
            ) : null}
            {!cache.scanComplete ? (
              <p className="warn-text">{t.runtime.cacheScanIncomplete}</p>
            ) : null}

            {cleanResult ? (
              <p className="success-text" role="status">
                {fill(t.runtime.cleanResult, {
                  bytes: formatBytes(cleanResult.freedBytes) ?? t.common.notAvailable,
                  quarantined: formatBytes(cleanResult.quarantinedBytes) ?? t.common.notAvailable
                })}
              </p>
            ) : null}
            {cleanResult && cleanResult.errors.length > 0 ? (
              <details className="details">
                <summary className="details__summary">
                  {t.common.error} ({cleanResult.errors.length})
                </summary>
                <div className="details__body">
                  <ul className="error-list">
                    {cleanResult.errors.map((item, index) => (
                      <li key={`${index}-${item}`}>{item}</li>
                    ))}
                  </ul>
                </div>
              </details>
            ) : null}
          </div>

          <div className="panel__foot">
            <span className="panel__meta">
              {t.runtime.cacheReclaimable}:{' '}
              <span className="measured">
                {formatBytes(cache.reclaimableBytes) ?? t.common.notAvailable}
              </span>
            </span>
            <div className="actions-row">
              <button
                type="button"
                className="btn btn--quiet"
                onClick={onRescan}
                disabled={loading}
              >
                {t.runtime.rescan}
              </button>
              <button
                type="button"
                className="btn btn--danger"
                onClick={() => {
                  setCleanError(null);
                  setDialogOpen(true);
                }}
                disabled={loading || cache.reclaimableBytes <= 0}
              >
                {t.runtime.clean}
              </button>
            </div>
          </div>
        </>
      ) : (
        <LoadingState text={t.common.loading} rows={3} />
      )}

      <ConfirmDialog
        open={dialogOpen}
        title={t.runtime.cleanTitle}
        confirmLabel={t.runtime.clean}
        busyLabel={t.runtime.cleaning}
        cancelLabel={t.common.cancel}
        busy={cleaning}
        confirmDisabled={selectedTargets.length === 0}
        danger
        onCancel={() => {
          if (!cleaning) setDialogOpen(false);
        }}
        onConfirm={() => void handleClean()}
      >
        <p className="state__text">{t.runtime.cleanText}</p>
        <div className="check-grid">
          {TARGETS.map((target) => {
            const bytes = bytesFor(target);
            return (
              <label className="check-row" key={target}>
                <input
                  type="checkbox"
                  checked={selected[target]}
                  disabled={bytes <= 0 || cleaning}
                  onChange={(event) =>
                    setSelected((previous) => ({ ...previous, [target]: event.target.checked }))
                  }
                />
                <span>{targetLabel(target, t)}</span>
                <span className="check-row__value">
                  {formatBytes(bytes) ?? t.common.notAvailable}
                </span>
              </label>
            );
          })}
        </div>
        {cleanError ? (
          <p className="error-text" role="alert">
            {cleanError}
          </p>
        ) : null}
      </ConfirmDialog>
    </section>
  );
}
