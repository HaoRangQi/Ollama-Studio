import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ChangeEvent } from 'react';
import { useTheme } from '../context/ThemeContext';
import {
  defaultSettings,
  loadModelSettings,
  lookupModelOrigin,
  originLabel,
  originUrl,
  saveModelSettings
} from '../lib/legacy';
import type { KeepAlive, ModelSettings, OllamaModel, SystemMetrics } from '../lib/legacy';
import { defaultChatFlags, loadChatFlags, saveChatFlags } from '../lib/chatFlags';
import type { ChatFlags } from '../lib/chatFlags';
import { showModel } from '../lib/api';
import {
  bytesToGb,
  formatBytes,
  modelBaseName,
  parameterLabel,
  contextLabel,
  uniqueName
} from '../lib/format';
import { ConfirmDialog, PromptDialog } from '../components/ConfirmDialog';
import { Icon } from '../components/Icon';

export interface ModelsScreenProps {
  models: OllamaModel[];
  selectedModel: OllamaModel | null;
  metrics: SystemMetrics | null;
  busyModelId: string | null;
  defaultNumCtx: number;
  defaultKeepAlive: KeepAlive;
  defaultShowThinking: boolean;
  onSelectModel: (model: OllamaModel) => void;
  onLaunchChat: (model: OllamaModel) => void;
  onLoadToggle: (model: OllamaModel) => Promise<void>;
  onDelete: (model: OllamaModel) => Promise<void>;
  onClone: (model: OllamaModel, name: string) => Promise<void>;
  onExport: (model: OllamaModel) => void;
  onImportGguf: (file: File) => Promise<void>;
  onOpenPull: () => void;
  onOpenLab: (model: OllamaModel) => void;
  notify: (message: string, tone?: 'info' | 'success' | 'warn' | 'error') => void;
}

type Filter = 'all' | 'chat' | 'code' | 'reason' | 'vision' | 'embedding';
type ViewMode = 'grid' | 'list';

function categoryGlyph(model: OllamaModel): { icon: string; className: string } {
  if (model.category === 'code') return { icon: 'code', className: 'glyph-apricot' };
  if (model.category === 'vision') return { icon: 'image', className: 'glyph-mist' };
  if (model.category === 'embedding') return { icon: 'hub', className: 'glyph-mist' };
  return { icon: 'deployed_code', className: 'glyph-sage' };
}

function matchesReason(model: OllamaModel): boolean {
  return /(^|[/:._-])(r1|reason|reasoner|think|qwq|magistral)([/:._-]|$)/i.test(model.fullTag);
}

function buildPreviewModelfile(
  model: OllamaModel,
  settings: ModelSettings,
  flags: ChatFlags
): string {
  return `# ${model.fullTag}
FROM ${model.fullTag}
PARAMETER temperature ${settings.temperature.toFixed(2)}
PARAMETER top_p ${settings.topP.toFixed(2)}
PARAMETER num_ctx ${settings.numCtx}
PARAMETER repeat_penalty ${settings.repeatPenalty.toFixed(2)}
${flags.numPredict > 0 ? `PARAMETER num_predict ${flags.numPredict}\n` : ''}TEMPLATE """{{ .Prompt }}"""`;
}

function DrawerSlider({
  label,
  value,
  min,
  max,
  step,
  display,
  onChange
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (value: number) => void;
}) {
  const percent = max > min ? ((value - min) / (max - min)) * 100 : 0;
  return (
    <div className="param-field">
      <div className="param-label">
        <span>{label}</span>
        <b>{display}</b>
      </div>
      <input
        type="range"
        className="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ '--pct': `${Math.max(0, Math.min(100, percent))}%` } as CSSProperties}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-label={label}
      />
    </div>
  );
}

export function ModelsScreen({
  models,
  selectedModel,
  metrics,
  busyModelId,
  defaultNumCtx,
  defaultKeepAlive,
  defaultShowThinking,
  onSelectModel,
  onLaunchChat,
  onLoadToggle,
  onDelete,
  onClone,
  onExport,
  onImportGguf,
  onOpenPull,
  onOpenLab,
  notify
}: ModelsScreenProps) {
  const { c, language } = useTheme();
  const [filter, setFilter] = useState<Filter>('all');
  const [view, setView] = useState<ViewMode>('grid');
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<OllamaModel | null>(null);
  const [cloneTarget, setCloneTarget] = useState<OllamaModel | null>(null);
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(
    () => window.matchMedia('(min-width: 1181px)').matches
  );
  const [modelfile, setModelfile] = useState('');
  const [modelfileLoading, setModelfileLoading] = useState(false);
  const [modelfileFromApi, setModelfileFromApi] = useState(false);
  const [drawerSettings, setDrawerSettings] = useState<ModelSettings | null>(null);
  const [drawerFlags, setDrawerFlags] = useState<ChatFlags | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const selectedTag = selectedModel?.fullTag ?? '';

  const totalBytes = useMemo(
    () => models.reduce((sum, model) => sum + model.sizeGb * 1_000_000_000, 0),
    [models]
  );
  const loadedBytes = useMemo(
    () =>
      models
        .filter((model) => model.status === 'running')
        .reduce((sum, model) => sum + (model.sizeVramBytes ?? 0), 0),
    [models]
  );
  const runningCount = models.filter((model) => model.status === 'running').length;

  const filtered = useMemo(() => {
    return models.filter((model) => {
      if (filter === 'all') return true;
      if (filter === 'chat') return model.category === 'llm' && !matchesReason(model);
      if (filter === 'code') return model.category === 'code';
      if (filter === 'reason') return matchesReason(model);
      if (filter === 'vision')
        return model.category === 'vision' || Boolean(model.capabilities?.includes('vision'));
      return model.category === 'embedding';
    });
  }, [filter, models]);

  useEffect(() => {
    if (!selectedTag || !selectedModel) {
      setModelfile('');
      setModelfileFromApi(false);
      setDrawerSettings(null);
      setDrawerFlags(null);
      return;
    }
    setDrawerSettings(
      loadModelSettings(selectedTag, {
        ...defaultSettings(selectedModel),
        numCtx: defaultNumCtx,
        keepAlive: defaultKeepAlive
      })
    );
    setDrawerFlags(loadChatFlags(selectedTag, defaultChatFlags(defaultShowThinking)));
    // 桌面端默认展开首选的模型详情；移动端保持列表，等用户点卡片再打开抽屉。
    if (window.matchMedia('(min-width: 1181px)').matches) setDrawerOpen(true);
    // 只跟随模型标识，避免 5 秒轮询产生的新对象覆盖正在编辑的参数。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultKeepAlive, defaultNumCtx, defaultShowThinking, selectedTag]);

  useEffect(() => {
    if (!selectedTag || !selectedModel) return;
    const controller = new AbortController();
    setModelfileLoading(true);
    setModelfileFromApi(false);
    showModel(selectedTag, controller.signal)
      .then((response) => {
        if (controller.signal.aborted) return;
        const text = response.modelfile?.trim();
        setModelfile(text || '');
        setModelfileFromApi(Boolean(text));
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setModelfile('');
          setModelfileFromApi(false);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setModelfileLoading(false);
      });
    return () => controller.abort();
    // 同上：只在选中的模型变化时读取 Modelfile。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTag]);

  useEffect(() => {
    if (!menuFor) return;
    const handlePointer = (event: PointerEvent) => {
      if (!(event.target as Element).closest('.menu-anchor')) setMenuFor(null);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuFor(null);
    };
    document.addEventListener('pointerdown', handlePointer, true);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('pointerdown', handlePointer, true);
      document.removeEventListener('keydown', handleKey);
    };
  }, [menuFor]);

  const updateDrawerSettings = (patch: Partial<ModelSettings>) => {
    if (!selectedModel) return;
    setDrawerSettings((current) => {
      if (!current) return current;
      const next = { ...current, ...patch };
      saveModelSettings(selectedModel.fullTag, next);
      return next;
    });
  };

  const updateDrawerFlags = (patch: Partial<ChatFlags>) => {
    if (!selectedModel) return;
    setDrawerFlags((current) => {
      if (!current) return current;
      const next = { ...current, ...patch };
      saveChatFlags(selectedModel.fullTag, next);
      return next;
    });
  };

  const handleImportChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.gguf')) {
      notify(language === 'zh' ? '仅支持 .gguf 文件' : 'Only .gguf files are supported', 'warn');
      return;
    }
    setImporting(true);
    try {
      await onImportGguf(file);
    } catch {
      // App 已提示具体错误，这里只负责恢复按钮状态。
    } finally {
      setImporting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await onDelete(deleteTarget);
      setDeleteTarget(null);
    } catch {
      // 保持对话框打开，错误由 App toast 呈现。
    } finally {
      setBusy(false);
    }
  };

  const handleClone = async (name: string) => {
    if (!cloneTarget) return;
    setBusy(true);
    try {
      await onClone(cloneTarget, name);
      setCloneTarget(null);
    } catch {
      // 保持对话框打开。
    } finally {
      setBusy(false);
    }
  };

  const cloneDefault = cloneTarget
    ? uniqueName(
        modelBaseName(cloneTarget.fullTag),
        models.map((model) => model.name)
      )
    : '';

  const drawerSource = selectedModel;
  const previewText =
    drawerSource && drawerSettings && drawerFlags
      ? buildPreviewModelfile(drawerSource, drawerSettings, drawerFlags)
      : '';
  const modelfileText = modelfileFromApi ? modelfile : previewText;

  const filterOptions: Array<{ id: Filter; label: string }> = [
    { id: 'all', label: c.models.filterAll },
    { id: 'chat', label: c.models.filterChat },
    { id: 'code', label: c.models.filterCode },
    { id: 'reason', label: c.models.filterReason },
    { id: 'vision', label: c.models.filterVision },
    { id: 'embedding', label: c.models.filterEmbedding }
  ];

  const renderCard = (model: OllamaModel) => {
    const glyph = categoryGlyph(model);
    const loaded = model.status === 'running';
    const origin = lookupModelOrigin(model.fullTag);
    const isBusy = busyModelId === model.fullTag;
    return (
      <article
        key={model.id}
        className={`model-card ${selectedModel?.fullTag === model.fullTag ? 'is-selected' : ''} ${
          view === 'list' ? 'is-list' : ''
        }`}
        onClick={() => {
          onSelectModel(model);
          setDrawerOpen(true);
        }}
      >
        <div className="model-card-head">
          <span className={`model-glyph ${glyph.className}`}>
            <Icon name={glyph.icon} size={25} />
          </span>
          <div className="model-title">
            <h3>{model.fullTag}</h3>
            <p>
              {model.categoryLabel}
              {model.note ? ` · ${model.note}` : ''}
              {model.capabilities?.length ? ` · ${model.capabilities.join(' / ')}` : ''}
            </p>
          </div>
          <span className={`tag ${loaded ? 'tag-sage' : 'tag-mist'} model-state`}>
            {loaded ? c.status.loaded : c.status.idle}
          </span>
        </div>

        <div className="model-facts">
          <div>
            <span>{c.models.paramCount}</span>
            <b>{parameterLabel(model)}</b>
          </div>
          <div>
            <span>{c.models.quant}</span>
            <b>{model.quantization || '—'}</b>
          </div>
          <div>
            <span>{c.models.context}</span>
            <b>{contextLabel(model)}</b>
          </div>
          <div>
            <span>{c.models.disk}</span>
            <b>{model.size}</b>
          </div>
        </div>

        <div className="model-actions" onClick={(event) => event.stopPropagation()}>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => onLaunchChat(model)}
          >
            {c.models.chat}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              onSelectModel(model);
              setDrawerOpen(true);
            }}
          >
            {c.models.params}
          </button>
          <div className="menu-anchor">
            <button
              type="button"
              className="iconbtn small bordered"
              onClick={() => setMenuFor((current) => (current === model.id ? null : model.id))}
              aria-label={c.models.more}
              aria-expanded={menuFor === model.id}
              disabled={isBusy}
            >
              <Icon name={isBusy ? 'progress_activity' : 'more_horiz'} size={18} />
            </button>
            {menuFor === model.id && (
              <div className="menu" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuFor(null);
                    void onLoadToggle(model);
                  }}
                >
                  <Icon name={loaded ? 'eject' : 'play_arrow'} size={16} />
                  {loaded ? c.models.unload : c.models.load}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuFor(null);
                    setCloneTarget(model);
                  }}
                >
                  <Icon name="content_copy" size={16} />
                  {c.models.clone}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuFor(null);
                    onExport(model);
                  }}
                >
                  <Icon name="ios_share" size={16} />
                  {c.models.export}
                </button>
                {origin && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuFor(null);
                      window.open(originUrl(origin), '_blank', 'noopener,noreferrer');
                    }}
                  >
                    <Icon name="open_in_new" size={16} />
                    {c.models.origin} · {originLabel(origin)}
                  </button>
                )}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuFor(null);
                    onOpenLab(model);
                  }}
                >
                  <Icon name="code" size={16} />
                  {c.models.openLab}
                </button>
                <div className="menu-separator" />
                <button
                  type="button"
                  role="menuitem"
                  className="is-danger"
                  onClick={() => {
                    setMenuFor(null);
                    setDeleteTarget(model);
                  }}
                >
                  <Icon name="delete" size={16} />
                  {c.models.delete}
                </button>
              </div>
            )}
          </div>
        </div>
      </article>
    );
  };

  return (
    <div className="models-layout">
      <div className="models-main">
        <header className="page-head">
          <div>
            <span className="eyebrow">{c.models.eyebrow}</span>
            <h2>{c.models.title}</h2>
            <p>{c.models.subtitle(models.length, formatBytes(totalBytes), runningCount)}</p>
          </div>
          <div className="page-actions">
            <input
              ref={fileInputRef}
              type="file"
              accept=".gguf"
              hidden
              onChange={(event) => void handleImportChange(event)}
            />
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
            >
              <Icon name={importing ? 'progress_activity' : 'upload'} size={17} />
              {importing ? c.models.importPreparing : c.models.importGguf}
            </button>
            <button type="button" className="btn btn-primary" onClick={onOpenPull}>
              <Icon name="add" size={18} />
              {c.models.pullNew}
            </button>
          </div>
        </header>

        <div className="metrics">
          <div className="metric">
            <span className="metric-label">{c.models.statModels}</span>
            <span className="metric-value">
              {models.length}
              <small>{c.models.statCountUnit}</small>
            </span>
            <span className="metric-note">{c.models.statModelsNote}</span>
          </div>
          <div className="metric metric-sage">
            <span className="metric-label">{c.models.statDisk}</span>
            <span className="metric-value">
              {bytesToGb(totalBytes)}
              <small>GB</small>
            </span>
            <span className="metric-note">{c.models.statDiskNote}</span>
          </div>
          <div className="metric metric-warm">
            <span className="metric-label">{c.models.statLoaded}</span>
            <span className="metric-value">
              {bytesToGb(loadedBytes)}
              {metrics?.memory.totalBytes ? (
                <small>/ {bytesToGb(metrics.memory.totalBytes)} GB</small>
              ) : (
                <small>GB</small>
              )}
            </span>
            <span className="metric-note">{c.models.statLoadedNote}</span>
          </div>
          <div className="metric">
            <span className="metric-label">{c.models.statRunning}</span>
            <span className="metric-value">{runningCount}</span>
            <span className="metric-note">
              <span className={`status-dot status-${runningCount > 0 ? 'online' : 'offline'}`} />
              {c.models.statRunningNote}
            </span>
          </div>
        </div>

        <div className="toolbar">
          <div className="filters">
            {filterOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                className={`chip ${filter === option.id ? 'is-active' : ''}`}
                onClick={() => setFilter(option.id)}
                aria-pressed={filter === option.id}
              >
                {option.label}
              </button>
            ))}
          </div>
          <span className="toolbar-spacer" />
          <div className="view-toggle" role="group" aria-label={c.models.viewGrid}>
            <button
              type="button"
              className={view === 'grid' ? 'is-active' : ''}
              onClick={() => setView('grid')}
              aria-label={c.models.viewGrid}
              title={c.models.viewGrid}
            >
              <Icon name="grid_view" size={17} />
            </button>
            <button
              type="button"
              className={view === 'list' ? 'is-active' : ''}
              onClick={() => setView('list')}
              aria-label={c.models.viewList}
              title={c.models.viewList}
            >
              <Icon name="view_agenda" size={17} />
            </button>
          </div>
        </div>

        {models.length === 0 ? (
          <div className="empty-state">
            <span className="empty-state-icon">
              <Icon name="deployed_code" size={28} />
            </span>
            <h3>{c.models.emptyTitle}</h3>
            <p>{c.models.emptyDesc}</p>
            <div className="empty-state-actions">
              <button type="button" className="btn btn-primary" onClick={onOpenPull}>
                <Icon name="download" size={17} />
                {c.models.pullNew}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => fileInputRef.current?.click()}
              >
                <Icon name="upload" size={17} />
                {c.models.importGguf}
              </button>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state compact">
            <span className="empty-state-icon">
              <Icon name="filter_alt_off" size={24} />
            </span>
            <p>{c.models.noMatches}</p>
          </div>
        ) : (
          <div className={`models-grid ${view === 'list' ? 'is-list' : ''}`}>
            {filtered.map(renderCard)}
          </div>
        )}
      </div>

      {drawerSource && drawerOpen && (
        <div className="drawer-backdrop" onClick={() => setDrawerOpen(false)} />
      )}
      {drawerSource && (
        <aside
          className={`drawer ${drawerOpen ? 'is-open' : ''}`}
          aria-label={c.models.drawerClose}
        >
          <div className="drawer-head">
            <span className={`model-glyph ${categoryGlyph(drawerSource).className}`}>
              <Icon name={categoryGlyph(drawerSource).icon} size={22} />
            </span>
            <div>
              <h3>{drawerSource.fullTag}</h3>
              <p>
                {parameterLabel(drawerSource)} · {drawerSource.quantization || '—'} ·{' '}
                {drawerSource.size}
              </p>
            </div>
            <button
              type="button"
              className="iconbtn small drawer-close"
              onClick={() => setDrawerOpen(false)}
              aria-label={c.models.drawerClose}
            >
              <Icon name="close" size={18} />
            </button>
          </div>

          {drawerSettings && drawerFlags && (
            <section className="drawer-panel">
              <div className="rail-panel-head">
                <h4>{c.models.drawerParams}</h4>
                <span className="tag tag-apricot">{c.models.drawerPreset}</span>
              </div>
              <DrawerSlider
                label={c.chat.temperature}
                value={drawerSettings.temperature}
                min={0}
                max={2}
                step={0.01}
                display={drawerSettings.temperature.toFixed(2)}
                onChange={(value) => updateDrawerSettings({ temperature: value })}
              />
              <DrawerSlider
                label={c.chat.topP}
                value={drawerSettings.topP}
                min={0}
                max={1}
                step={0.01}
                display={drawerSettings.topP.toFixed(2)}
                onChange={(value) => updateDrawerSettings({ topP: value })}
              />
              <DrawerSlider
                label={c.chat.numCtx}
                value={drawerSettings.numCtx}
                min={512}
                max={131072}
                step={512}
                display={String(drawerSettings.numCtx)}
                onChange={(value) => updateDrawerSettings({ numCtx: value })}
              />
              <DrawerSlider
                label="num_predict"
                value={drawerFlags.numPredict}
                min={0}
                max={8192}
                step={64}
                display={
                  drawerFlags.numPredict > 0 ? String(drawerFlags.numPredict) : c.models.noPredict
                }
                onChange={(value) => updateDrawerFlags({ numPredict: value })}
              />
            </section>
          )}

          <section className="drawer-panel drawer-modelfile-panel">
            <div className="rail-panel-head">
              <h4>{c.models.drawerModelfile}</h4>
              <span className="tag tag-mist">
                {modelfileLoading ? c.common.loading : modelfileFromApi ? 'api/show' : 'preview'}
              </span>
            </div>
            <div className="modelfile-block">
              <div className="modelfile-head">
                <span>{drawerSource.fullTag}</span>
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard
                      .writeText(modelfileText)
                      .then(() => notify(c.toast.copied, 'success'))
                      .catch(() => notify(c.toast.copyFailed, 'error'));
                  }}
                >
                  <Icon name="content_copy" size={13} />
                  {c.common.copy}
                </button>
              </div>
              <pre>{modelfileText || '—'}</pre>
            </div>
            <p className="drawer-note">{c.models.drawerPreviewNote}</p>
          </section>

          <div className="drawer-actions">
            <button
              type="button"
              className="btn btn-ghost"
              disabled={busyModelId === drawerSource.fullTag}
              onClick={() => void onLoadToggle(drawerSource)}
            >
              <Icon name={drawerSource.status === 'running' ? 'eject' : 'play_arrow'} size={17} />
              {busyModelId === drawerSource.fullTag
                ? drawerSource.status === 'running'
                  ? c.models.busyUnload
                  : c.models.busyLoad
                : drawerSource.status === 'running'
                  ? c.models.drawerRelease
                  : c.models.load}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => onLaunchChat(drawerSource)}
            >
              <Icon name="forum" size={17} />
              {c.models.drawerChat}
            </button>
          </div>
        </aside>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={deleteTarget ? c.models.deleteTitle(deleteTarget.fullTag) : ''}
        description={c.models.deleteDesc}
        confirmLabel={c.common.delete}
        cancelLabel={c.common.cancel}
        danger
        busy={busy}
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
      <PromptDialog
        open={Boolean(cloneTarget)}
        title={cloneTarget ? c.models.cloneTitle(cloneTarget.fullTag) : ''}
        description={c.models.cloneDesc}
        label={c.models.cloneName}
        defaultValue={cloneDefault}
        confirmLabel={c.models.cloneConfirm}
        cancelLabel={c.common.cancel}
        busy={busy}
        onConfirm={(name) => void handleClone(name)}
        onCancel={() => setCloneTarget(null)}
      />
    </div>
  );
}
