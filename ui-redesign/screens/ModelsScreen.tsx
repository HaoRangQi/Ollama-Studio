import { useState } from 'react';
import type { Copy, Lang } from '../copy';
import { fill } from '../copy';
import type { OllamaData } from '../hooks/useOllamaData';
import { deleteModel, loadModel, unloadModel } from '../lib/legacy';
import type { OllamaModel } from '../lib/legacy';
import { displayValue, errorMessage, formatBytes, formatTime } from '../lib/format';
import { categoryLabel, modelTraits } from '../lib/labels';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Icon } from '../components/Icon';
import { EmptyState, ErrorState, LoadingState } from '../components/StateBlock';

interface ModelsScreenProps {
  t: Copy;
  lang: Lang;
  ollama: OllamaData;
  selectedTag: string | null;
  onSelect: (model: OllamaModel) => void;
  onChatModel: (model: OllamaModel) => void;
  onModelfileModel: (model: OllamaModel) => void;
  onOpenPull: () => void;
}

export function ModelsScreen({
  t,
  lang,
  ollama,
  selectedTag,
  onSelect,
  onChatModel,
  onModelfileModel,
  onOpenPull
}: ModelsScreenProps) {
  const [filter, setFilter] = useState('');
  const [busyTag, setBusyTag] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteInput, setDeleteInput] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const selected = ollama.models.find((model) => model.fullTag === selectedTag) ?? null;
  const runningRaw = selected
    ? ollama.running.find(
        (item) => item.name === selected.fullTag || item.model === selected.fullTag
      )
    : undefined;
  const query = filter.trim().toLowerCase();
  const filtered = query
    ? ollama.models.filter(
        (model) =>
          model.fullTag.toLowerCase().includes(query) ||
          model.name.toLowerCase().includes(query) ||
          model.category.includes(query)
      )
    : ollama.models;
  const ollamaReady = ollama.status !== 'connecting' || ollama.lastUpdated != null;

  const selectModel = (model: OllamaModel) => {
    setActionError(null);
    onSelect(model);
  };

  const handleToggle = async () => {
    if (!selected) return;
    const kind = selected.capabilities?.includes('embedding') ? 'embed' : 'generate';
    setBusyTag(selected.fullTag);
    setActionError(null);
    try {
      if (selected.status === 'running') {
        await unloadModel(selected.fullTag, { kind });
      } else {
        await loadModel(selected.fullTag, -1, { kind });
      }
      await ollama.refresh();
    } catch (caught) {
      setActionError(errorMessage(caught) || t.common.unknownError);
    } finally {
      setBusyTag(null);
    }
  };

  const handleDelete = async () => {
    if (!selected || deleteInput !== selected.fullTag) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await deleteModel(selected.fullTag);
      setDeleteOpen(false);
      setDeleteInput('');
      await ollama.refresh();
    } catch (caught) {
      setDeleteError(errorMessage(caught) || t.common.unknownError);
    } finally {
      setDeleteBusy(false);
    }
  };

  const vramValue = selected
    ? selected.status === 'running'
      ? (formatBytes(selected.sizeVramBytes || runningRaw?.size_vram || 0) ?? t.common.notAvailable)
      : t.common.notLoaded
    : t.common.notAvailable;
  const expiresValue =
    selected && runningRaw?.expires_at
      ? (formatTime(runningRaw.expires_at, lang) ?? t.common.notAvailable)
      : t.common.notAvailable;

  return (
    <>
      <div className="screen">
        <header className="screen__head">
          <div className="screen__head-main">
            <h1>{t.models.title}</h1>
            <p className="screen__lede">
              {ollamaReady
                ? fill(t.models.lede, { count: ollama.models.length })
                : ollama.status === 'offline'
                  ? `${t.errors.ollama} ${ollama.error ?? ''}`
                  : t.common.loading}
            </p>
          </div>
          <div className="screen__actions">
            <button
              type="button"
              className="btn btn--quiet"
              onClick={() => void ollama.refresh()}
              disabled={ollama.status === 'connecting'}
            >
              <Icon name="refresh" />
              {t.models.refresh}
            </button>
          </div>
        </header>

        <div className="models-layout">
          <section className="panel">
            <div className="panel__head">
              <h2 className="panel__title">{t.models.list}</h2>
              <span className="panel__meta">
                {filtered.length} / {ollama.models.length}
              </span>
            </div>

            {ollama.models.length > 0 ? (
              <div className="panel__body">
                <div className="field">
                  <label className="field__label" htmlFor="model-filter">
                    {t.models.filter}
                  </label>
                  <input
                    id="model-filter"
                    className="input"
                    type="search"
                    value={filter}
                    onChange={(event) => setFilter(event.target.value)}
                    placeholder={t.models.filterPlaceholder}
                    autoComplete="off"
                    spellCheck={false}
                  />
                </div>
              </div>
            ) : null}

            {!ollamaReady && ollama.status === 'offline' ? (
              <ErrorState
                title={t.models.title}
                text={`${t.errors.ollama} ${ollama.error ?? ''}`}
                retry={() => void ollama.refresh()}
                retryLabel={t.common.retry}
              />
            ) : !ollamaReady ? (
              <LoadingState text={t.common.loading} rows={3} />
            ) : ollama.models.length === 0 ? (
              <EmptyState
                title={t.models.emptyTitle}
                text={t.models.emptyText}
                action={
                  <button type="button" className="btn btn--quiet" onClick={onOpenPull}>
                    {t.runtime.openPull}
                  </button>
                }
              />
            ) : filtered.length === 0 ? (
              <EmptyState title={t.models.filterEmpty} />
            ) : (
              <div className="table-scroll">
                <table className="table">
                  <thead>
                    <tr>
                      <th scope="col">{t.common.model}</th>
                      <th scope="col">{t.common.category}</th>
                      <th scope="col">{t.common.quant}</th>
                      <th scope="col">{t.common.size}</th>
                      <th scope="col">{t.common.context}</th>
                      <th scope="col">{t.common.status}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((model) => {
                      const isSelected = selected?.fullTag === model.fullTag;
                      const traits = modelTraits(model);
                      return (
                        <tr key={model.id} className={isSelected ? 'is-selected' : undefined}>
                          <td data-label={t.common.model}>
                            <button
                              type="button"
                              className="table-link"
                              aria-current={isSelected ? 'true' : undefined}
                              onClick={() => selectModel(model)}
                            >
                              {model.fullTag}
                            </button>
                            {traits ? <div className="cell-sub">{traits}</div> : null}
                          </td>
                          <td data-label={t.common.category}>{categoryLabel(model.category, t)}</td>
                          <td data-label={t.common.quant} className="num">
                            {displayValue(model.quantization) ?? t.common.notAvailable}
                          </td>
                          <td data-label={t.common.size} className="num">
                            {displayValue(model.size) ?? t.common.notAvailable}
                          </td>
                          <td data-label={t.common.context} className="num">
                            {displayValue(model.context) ?? t.common.notAvailable}
                          </td>
                          <td data-label={t.common.status}>
                            <span
                              className={
                                model.status === 'running' ? 'chip chip--ok' : 'chip chip--plain'
                              }
                            >
                              {model.status === 'running' ? t.common.loaded : t.common.notLoaded}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="panel">
            <div className="panel__head">
              <h2 className="panel__title">{t.models.detail}</h2>
              {selected ? (
                <span
                  className={selected.status === 'running' ? 'chip chip--ok' : 'chip chip--plain'}
                >
                  {selected.status === 'running' ? t.common.loaded : t.common.notLoaded}
                </span>
              ) : null}
            </div>

            {selected ? (
              <div className="panel__body stack">
                <div>
                  <h3 className="model-detail-title">{selected.name}</h3>
                  <span className="model-detail-tag measured">{selected.fullTag}</span>
                </div>

                <div className="detail-list">
                  <div className="detail-row">
                    <span className="detail-row__label">{t.models.detailCategory}</span>
                    <span className="detail-row__value">{categoryLabel(selected.category, t)}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-row__label">{t.models.detailQuant}</span>
                    <span className="detail-row__value measured">
                      {displayValue(selected.quantization) ?? t.common.notAvailable}
                    </span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-row__label">{t.models.detailSize}</span>
                    <span className="detail-row__value measured">
                      {displayValue(selected.size) ?? t.common.notAvailable}
                    </span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-row__label">{t.models.detailVram}</span>
                    <span className="detail-row__value measured">{vramValue}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-row__label">{t.models.detailContext}</span>
                    <span className="detail-row__value measured">
                      {displayValue(selected.context) ?? t.common.notAvailable}
                    </span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-row__label">{t.models.detailExpires}</span>
                    <span className="detail-row__value measured">{expiresValue}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-row__label">{t.models.detailCapabilities}</span>
                    <span className="detail-row__value">
                      {selected.capabilities?.length
                        ? selected.capabilities.join(', ')
                        : t.common.none}
                    </span>
                  </div>
                </div>

                {actionError ? (
                  <p className="error-text" role="alert">
                    {t.models.loadError}: {actionError}
                  </p>
                ) : null}

                <div className="actions-row">
                  <button
                    type="button"
                    className="btn btn--primary"
                    onClick={() => void handleToggle()}
                    disabled={busyTag !== null}
                  >
                    {busyTag === selected.fullTag
                      ? selected.status === 'running'
                        ? t.models.unloading
                        : t.models.loading
                      : selected.status === 'running'
                        ? t.models.unload
                        : t.models.load}
                  </button>
                  <button
                    type="button"
                    className="btn btn--quiet"
                    onClick={() => onChatModel(selected)}
                  >
                    {t.models.chat}
                  </button>
                  <button
                    type="button"
                    className="btn btn--quiet"
                    onClick={() => onModelfileModel(selected)}
                  >
                    {t.models.modelfile}
                  </button>
                  <button
                    type="button"
                    className="btn btn--danger"
                    onClick={() => {
                      setDeleteInput('');
                      setDeleteError(null);
                      setDeleteOpen(true);
                    }}
                  >
                    {t.models.delete}
                  </button>
                </div>
              </div>
            ) : (
              <EmptyState title={t.models.noSelection} text={t.models.noSelectionText} />
            )}

            <div className="panel__foot">
              <span className="panel__note">{t.models.classicMore}</span>
              <a className="link" href="/">
                {t.app.classic}
              </a>
            </div>
          </section>
        </div>
      </div>

      {selected ? (
        <ConfirmDialog
          open={deleteOpen}
          title={t.models.deleteTitle}
          confirmLabel={t.models.deleteConfirm}
          busyLabel={t.models.deleting}
          cancelLabel={t.common.cancel}
          busy={deleteBusy}
          danger
          confirmDisabled={deleteInput !== selected.fullTag}
          onCancel={() => {
            if (!deleteBusy) setDeleteOpen(false);
          }}
          onConfirm={() => void handleDelete()}
        >
          <p className="state__text">{fill(t.models.deleteText, { model: selected.fullTag })}</p>
          <div className="field">
            <label className="field__label" htmlFor="delete-model-tag">
              {t.models.deleteLabel}
            </label>
            <input
              id="delete-model-tag"
              className="input"
              value={deleteInput}
              onChange={(event) => setDeleteInput(event.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
            <span
              className={`field__help${
                deleteInput && deleteInput !== selected.fullTag ? ' field__error' : ''
              }`}
            >
              {deleteInput && deleteInput !== selected.fullTag
                ? t.models.deleteMismatch
                : selected.fullTag}
            </span>
          </div>
          {deleteError ? (
            <p className="error-text" role="alert">
              {t.models.deleteError}: {deleteError}
            </p>
          ) : null}
        </ConfirmDialog>
      ) : null}
    </>
  );
}
