import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent } from 'react';
import { useTheme } from '../context/ThemeContext';
import { useDismissable } from '../hooks/useDismissable';
import { createModelFromModelfile } from '../lib/api';
import {
  formatModelfile,
  getParameter,
  parseModelfile,
  setParameter,
  starterModelfile,
  tokenizeModelfileLine,
  validateModelfile
} from '../lib/modelfile';
import type { ValidationIssue } from '../lib/modelfile';
import { clamp, formatClock, modelBaseName, parameterLabel, shortModelName } from '../lib/format';
import { readStorageJson, writeStorageJson } from '../lib/legacy';
import type { OllamaModel } from '../lib/legacy';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Icon } from '../components/Icon';

const DRAFT_KEY = 'ollama_ui3_modelfile_draft_v1';
const BUILDS_KEY = 'ollama_ui3_builds_v1';

interface Draft {
  modelName: string;
  text: string;
  presetId: string;
  savedAt: number;
}

interface BuildRecord {
  id: string;
  name: string;
  at: number;
  base: string;
  text: string;
}

interface OutputLine {
  tone: ValidationIssue['tone'] | 'info';
  text: string;
}

interface Preset {
  id: string;
  label: string;
  desc: string;
  system: string;
  temperature: number;
  numCtx: number;
}

export interface ModelfileScreenProps {
  models: OllamaModel[];
  initialBase?: string | null;
  onBuilt: (name: string) => void;
  onOpenChat: (name: string) => void;
  notify: (message: string, tone?: 'info' | 'success' | 'warn' | 'error') => void;
}

function createId(): string {
  const api = globalThis.crypto;
  if (api && typeof api.randomUUID === 'function') return api.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function readDraft(): Draft | null {
  const raw = readStorageJson<unknown>(DRAFT_KEY, null);
  if (typeof raw !== 'object' || raw === null) return null;
  const value = raw as Record<string, unknown>;
  if (typeof value.text !== 'string') return null;
  return {
    modelName: typeof value.modelName === 'string' ? value.modelName : '',
    text: value.text,
    presetId: typeof value.presetId === 'string' ? value.presetId : 'code',
    savedAt: typeof value.savedAt === 'number' ? value.savedAt : 0
  };
}

function readBuilds(): BuildRecord[] {
  const raw = readStorageJson<unknown>(BUILDS_KEY, []);
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (item): item is BuildRecord =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as BuildRecord).id === 'string' &&
        typeof (item as BuildRecord).name === 'string' &&
        typeof (item as BuildRecord).text === 'string'
    )
    .slice(0, 6);
}

function setFrom(text: string, base: string): string {
  if (/^\s*FROM\b/im.test(text)) {
    return text.replace(/^\s*FROM\b.*$/im, `FROM ${base}`);
  }
  return `FROM ${base}\n${text}`;
}

function setSystem(text: string, value: string): string {
  const block = `SYSTEM """\n${value.trim()}\n"""`;
  if (/SYSTEM\s+"""[\s\S]*?"""/i.test(text)) {
    return text.replace(/SYSTEM\s+"""[\s\S]*?"""/i, block);
  }
  if (/^\s*SYSTEM\b/im.test(text)) {
    return text.replace(/^\s*SYSTEM\b.*$/im, block);
  }
  const trimmed = text.replace(/\s+$/, '');
  return `${trimmed}\n\n${block}\n`;
}

function numericParameter(text: string, name: string, fallback: number): number {
  const raw = getParameter(text, name);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function buildPresets(c: ReturnType<typeof useTheme>['c']): Preset[] {
  return [
    {
      id: 'code',
      label: c.lab.presetCode,
      desc: c.lab.presetCodeDesc,
      system:
        '你是一位严谨的本地编程助手。优先给出可运行、可测试的代码，说明关键取舍，并指出潜在的边界条件。',
      temperature: 0.2,
      numCtx: 8192
    },
    {
      id: 'companion',
      label: c.lab.presetCompanion,
      desc: c.lab.presetCompanionDesc,
      system:
        '你是一位温柔、耐心的本地陪伴助手。语气自然，先倾听再回应，不夸大能力，也不假装拥有人类情感。',
      temperature: 0.8,
      numCtx: 8192
    },
    {
      id: 'json',
      label: c.lab.presetJson,
      desc: c.lab.presetJsonDesc,
      system:
        'You extract structured data. Output ONLY valid RFC 8259 JSON that matches the requested schema. Never add prose or markdown fences.',
      temperature: 0.1,
      numCtx: 8192
    },
    {
      id: 'translate',
      label: c.lab.presetTranslate,
      desc: c.lab.presetTranslateDesc,
      system:
        '你是一位专业翻译与润色编辑。忠实原意，保持术语一致；中文表达自然简洁，不添加原文没有的信息。',
      temperature: 0.3,
      numCtx: 8192
    },
    {
      id: 'roleplay',
      label: c.lab.presetRoleplay,
      desc: c.lab.presetRoleplayDesc,
      system:
        '你是一位善于角色扮演的叙事者。保持角色设定与语气一致，用动作、感官细节与对白推进场景，不跳出角色。',
      temperature: 0.9,
      numCtx: 16384
    }
  ];
}

export function ModelfileScreen({
  models,
  initialBase,
  onBuilt,
  onOpenChat,
  notify
}: ModelfileScreenProps) {
  const { c, language } = useTheme();
  const presets = useMemo(() => buildPresets(c), [c]);
  const fallbackBase = initialBase || models[0]?.fullTag || 'qwen2.5:7b';

  const [initialDraft] = useState<Draft>(
    () =>
      readDraft() ?? {
        modelName: models[0] ? `${modelBaseName(models[0].fullTag)}-custom` : '',
        text: starterModelfile(fallbackBase),
        presetId: 'code',
        savedAt: 0
      }
  );
  const [modelName, setModelName] = useState(initialDraft.modelName);
  const [text, setText] = useState(initialDraft.text);
  const [presetId, setPresetId] = useState(initialDraft.presetId);
  const [savedAt, setSavedAt] = useState(initialDraft.savedAt);
  const [saving, setSaving] = useState(false);
  const [builds, setBuilds] = useState<BuildRecord[]>(readBuilds);
  const [output, setOutput] = useState<OutputLine[]>([]);
  const [outputTone, setOutputTone] = useState<'empty' | 'ok' | 'warn' | 'error' | 'building'>(
    'empty'
  );
  const [building, setBuilding] = useState(false);
  const [lastBuilt, setLastBuilt] = useState<string | null>(null);
  const [baseMenuOpen, setBaseMenuOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);

  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const highlightRef = useRef<HTMLPreElement | null>(null);
  const gutterRef = useRef<HTMLDivElement | null>(null);
  const baseRef = useRef<HTMLDivElement | null>(null);
  useDismissable(baseRef, () => setBaseMenuOpen(false), baseMenuOpen);

  const parsed = useMemo(() => parseModelfile(text), [text]);
  const lines = useMemo(() => text.split('\n'), [text]);
  const preset = presets.find((item) => item.id === presetId) ?? presets[0];
  const baseModel = models.find(
    (model) =>
      model.fullTag === parsed.from ||
      model.name === parsed.from ||
      `${model.fullTag}:latest` === parsed.from
  );

  const temperature = clamp(numericParameter(text, 'temperature', 0.7), 0, 2);
  const numCtx = clamp(numericParameter(text, 'num_ctx', 8192), 512, 32768);
  const numPredict = clamp(numericParameter(text, 'num_predict', 1024), 128, 4096);
  const installed = useMemo(() => models.map((model) => model.fullTag), [models]);

  const persistDraft = useCallback(() => {
    const draft: Draft = { modelName, text, presetId, savedAt: Date.now() };
    writeStorageJson(DRAFT_KEY, draft);
    setSavedAt(draft.savedAt);
  }, [modelName, presetId, text]);

  useEffect(() => {
    setSaving(true);
    const timer = window.setTimeout(() => {
      persistDraft();
      setSaving(false);
    }, 650);
    return () => window.clearTimeout(timer);
  }, [persistDraft]);

  useEffect(() => {
    if (!initialBase) return;
    setText((current) => setFrom(current, initialBase));
  }, [initialBase]);

  const saveManually = () => {
    persistDraft();
    setSaving(false);
    notify(c.lab.savedToDraft, 'success');
  };

  const applyPreset = (next: Preset) => {
    setPresetId(next.id);
    setText((current) => {
      let updated = setSystem(current, next.system);
      updated = setParameter(updated, 'temperature', next.temperature.toFixed(2));
      updated = setParameter(updated, 'num_ctx', String(next.numCtx));
      return updated;
    });
    notify(c.lab.presetApplied(next.label), 'info');
  };

  const changeBase = (base: string) => {
    setText((current) => setFrom(current, base));
    if (!modelName.trim()) setModelName(`${modelBaseName(base)}-custom`);
    setBaseMenuOpen(false);
  };

  const insertTab = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Tab') return;
    event.preventDefault();
    const target = event.currentTarget;
    const start = target.selectionStart;
    const end = target.selectionEnd;
    const next = `${text.slice(0, start)}  ${text.slice(end)}`;
    setText(next);
    window.requestAnimationFrame(() => {
      if (!editorRef.current) return;
      editorRef.current.selectionStart = start + 2;
      editorRef.current.selectionEnd = start + 2;
    });
  };

  const syncScroll = () => {
    const target = editorRef.current;
    if (!target) return;
    if (highlightRef.current) {
      highlightRef.current.style.transform = `translate(${-target.scrollLeft}px, ${-target.scrollTop}px)`;
    }
    if (gutterRef.current) {
      gutterRef.current.style.transform = `translateY(${-target.scrollTop}px)`;
    }
  };

  const runValidation = (quiet = false): { issues: ValidationIssue[]; ok: boolean } => {
    const result = validateModelfile(text, {
      modelName: modelName.trim(),
      installed,
      language
    });
    setOutput(result.issues.map((issue) => ({ tone: issue.tone, text: issue.text })));
    const hasWarnings = result.issues.some((issue) => issue.tone === 'warn');
    setOutputTone(result.ok ? (hasWarnings ? 'warn' : 'ok') : 'error');
    if (!quiet) {
      notify(
        result.ok
          ? hasWarnings
            ? c.lab.validationWarn
            : c.lab.validationOk
          : c.lab.validationError,
        result.ok ? (hasWarnings ? 'warn' : 'success') : 'error'
      );
    }
    return { issues: result.issues, ok: result.ok };
  };

  const handleFormat = () => {
    setText((current) => formatModelfile(current));
    notify(c.lab.formatDone, 'info');
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      notify(c.lab.copyModelfileDone, 'success');
    } catch {
      notify(c.toast.copyFailed, 'error');
    }
  };

  const handleBuild = async () => {
    if (building) return;
    const check = runValidation(true);
    if (!check.ok) {
      notify(c.lab.validationError, 'error');
      return;
    }
    const trimmed = modelName.trim();
    if (!trimmed) {
      notify(c.lab.noName, 'warn');
      return;
    }
    const target = trimmed.includes(':') ? trimmed : `${trimmed}:latest`;
    setBuilding(true);
    setOutputTone('building');
    setOutput((current) => [
      ...current,
      { tone: 'info', text: `$ ollama create ${target} -f Modelfile` }
    ]);
    notify(c.lab.buildStarted(target), 'info');
    try {
      await createModelFromModelfile(target, text);
      setOutput((current) => [...current, { tone: 'ok', text: c.lab.buildSuccess(target) }]);
      setOutputTone('ok');
      setLastBuilt(target);
      const record: BuildRecord = {
        id: createId(),
        name: target,
        at: Date.now(),
        base: parsed.from,
        text
      };
      setBuilds((current) => {
        const next = [record, ...current].slice(0, 6);
        writeStorageJson(BUILDS_KEY, next);
        return next;
      });
      notify(c.lab.buildSuccess(target), 'success');
      onBuilt(target);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setOutput((current) => [...current, { tone: 'error', text: message }]);
      setOutputTone('error');
      notify(`${c.lab.buildFailed}: ${message}`, 'error');
    } finally {
      setBuilding(false);
    }
  };

  const loadHistory = (record: BuildRecord) => {
    setModelName(record.name);
    setText(record.text);
    setSavedAt(0);
    setOutputTone('empty');
    setOutput([]);
    setLastBuilt(null);
    notify(c.lab.historyLoaded(record.name), 'info');
  };

  const clearHistory = () => {
    setBuilds([]);
    writeStorageJson(BUILDS_KEY, []);
    notify(c.lab.historyCleared, 'info');
  };

  const resetDraft = () => {
    const base = initialBase || models[0]?.fullTag || 'qwen2.5:7b';
    setText(starterModelfile(base));
    setModelName(models[0] ? `${modelBaseName(models[0].fullTag)}-custom` : '');
    setPresetId('code');
    setSavedAt(0);
    setOutput([]);
    setOutputTone('empty');
    setLastBuilt(null);
    setResetOpen(false);
  };

  const savedLabel = saving
    ? c.lab.editorSaving
    : savedAt > 0
      ? c.lab.editorSavedAt(formatClock(savedAt))
      : c.lab.editorUnsaved;

  const sliderStyle = (value: number, min: number, max: number): CSSProperties =>
    ({ '--pct': `${((value - min) / (max - min)) * 100}%` }) as CSSProperties;

  const ctxPct = Math.min(100, (numCtx / 32768) * 100);

  return (
    <div className="lab-layout">
      <aside className="lab-presets">
        <div className="lab-rail-head">
          <h4>{c.lab.presets}</h4>
        </div>
        <div className="preset-list">
          {presets.map((item, index) => (
            <button
              key={item.id}
              type="button"
              className={`preset-item ${presetId === item.id ? 'is-active' : ''}`}
              onClick={() => applyPreset(item)}
              aria-pressed={presetId === item.id}
            >
              <span className={`preset-dot dot-${index}`} />
              <span className="preset-text">
                <b>{item.label}</b>
                <small>{item.desc}</small>
              </span>
              <Icon name="chevron_right" size={16} />
            </button>
          ))}
        </div>

        <div className="lab-rail-head syntax-head">
          <h4>{c.lab.syntax}</h4>
        </div>
        <div className="syntax-list">
          <div>
            <code>FROM</code>
            <span>{c.lab.syntaxFromDesc}</span>
          </div>
          <div>
            <code>PARAMETER</code>
            <span>{c.lab.syntaxParameterDesc}</span>
          </div>
          <div>
            <code>TEMPLATE</code>
            <span>{c.lab.syntaxTemplateDesc}</span>
          </div>
          <div>
            <code>SYSTEM</code>
            <span>{c.lab.syntaxSystemDesc}</span>
          </div>
          <div>
            <code>LICENSE</code>
            <span>{c.lab.syntaxLicenseDesc}</span>
          </div>
          <div>
            <code>ADAPTER</code>
            <span>{c.lab.syntaxAdapterDesc}</span>
          </div>
        </div>

        <div className="lab-recent">
          <div className="lab-recent-head">
            <h4>{c.lab.recentBuilds}</h4>
            {builds.length > 0 && (
              <button type="button" className="text-button" onClick={clearHistory}>
                {c.lab.clearHistory}
              </button>
            )}
          </div>
          {builds.length === 0 ? (
            <p className="lab-recent-empty">{c.lab.noBuilds}</p>
          ) : (
            <div className="build-history">
              {builds.map((record) => (
                <button
                  key={record.id}
                  type="button"
                  className="build-row"
                  onClick={() => loadHistory(record)}
                  title={c.lab.loadHistoryTitle}
                >
                  <span className="build-dot" />
                  <span className="build-name">{shortModelName(record.name)}</span>
                  <span className="tag tag-sage">{c.lab.built}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="base-card-wrap" ref={baseRef}>
          <button
            type="button"
            className="base-card"
            onClick={() => setBaseMenuOpen((open) => !open)}
            aria-expanded={baseMenuOpen}
            title={c.lab.baseChange}
          >
            <span className="base-card-head">
              <span>{c.lab.baseCardTitle}</span>
              <Icon name="layers" size={17} />
            </span>
            <span className="base-card-name">
              {parsed.from ? shortModelName(parsed.from) : c.lab.baseMissingShort}
            </span>
            <span className="base-card-bar">
              <i style={{ width: `${Math.max(2, ctxPct)}%` }} />
            </span>
            <span className="base-card-meta">
              <span>{baseModel ? parameterLabel(baseModel) : c.lab.baseMissing}</span>
              <span>{baseModel?.quantization ?? '—'}</span>
            </span>
          </button>
          {baseMenuOpen && (
            <div className="base-menu popover" role="menu">
              <div className="popover-head">
                <strong>{c.lab.base}</strong>
                <span>{c.lab.baseHint}</span>
              </div>
              {models.length === 0 ? (
                <p className="base-menu-empty">{c.lab.baseMissing}</p>
              ) : (
                models.map((model) => (
                  <button
                    key={model.id}
                    type="button"
                    role="menuitem"
                    className={model.fullTag === parsed.from ? 'is-active' : ''}
                    onClick={() => changeBase(model.fullTag)}
                  >
                    <span>{model.fullTag}</span>
                    <small>
                      {model.size} · {model.quantization}
                    </small>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </aside>

      <section className="lab-center">
        <header className="lab-head">
          <div>
            <span className="eyebrow">{c.lab.editorEyebrow}</span>
            <h2 className="lab-title">
              <span>{preset.label} ·</span>
              <input
                value={modelName}
                onChange={(event) => setModelName(event.target.value)}
                placeholder={c.lab.namePlaceholder}
                aria-label={c.lab.modelNameLabel}
                spellCheck={false}
              />
            </h2>
            <div className="lab-compact-controls">
              <label className="preset-select">
                <Icon name="auto_awesome" size={15} />
                <span>{c.lab.presets}</span>
                <select
                  value={presetId}
                  onChange={(event) => {
                    const next = presets.find((item) => item.id === event.target.value);
                    if (next) applyPreset(next);
                  }}
                  aria-label={c.lab.presets}
                >
                  {presets.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="preset-select">
                <Icon name="layers" size={15} />
                <span>{c.lab.base}</span>
                <select
                  value={parsed.from}
                  onChange={(event) => changeBase(event.target.value)}
                  aria-label={c.lab.base}
                >
                  {!baseModel && parsed.from && <option value={parsed.from}>{parsed.from}</option>}
                  {models.map((model) => (
                    <option key={model.id} value={model.fullTag}>
                      {model.fullTag}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
          <div className="lab-head-actions">
            <span className="tag tag-sage">
              <span className="tag-dot" />
              {c.lab.highlightOn}
            </span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={handleFormat}>
              <Icon name="format_align_left" size={16} />
              {c.lab.format}
            </button>
            <button
              type="button"
              className="iconbtn small"
              onClick={() => void handleCopy()}
              title={c.lab.copyModelfile}
              aria-label={c.lab.copyModelfile}
            >
              <Icon name="content_copy" size={17} />
            </button>
          </div>
        </header>

        <div className="lab-editor">
          <div className="editor-titlebar">
            <span className="window-dots">
              <i className="dot-red" />
              <i className="dot-yellow" />
              <i className="dot-green" />
            </span>
            <span className="editor-filename">Modelfile</span>
            <span className="editor-save-state">{savedLabel}</span>
          </div>
          <div className="editor-body">
            <div className="editor-gutter" aria-hidden="true">
              <div ref={gutterRef}>
                {lines.map((_, index) => (
                  <span key={index}>{index + 1}</span>
                ))}
              </div>
            </div>
            <pre className="editor-highlight" ref={highlightRef} aria-hidden="true">
              {lines.map((line, index) => (
                <span className="editor-line" key={index}>
                  {tokenizeModelfileLine(line).map((token, tokenIndex) => (
                    <span key={tokenIndex} className={`tok-${token.tone}`}>
                      {token.text}
                    </span>
                  ))}
                  {'\n'}
                </span>
              ))}
            </pre>
            <textarea
              ref={editorRef}
              className="editor-input"
              value={text}
              onChange={(event) => setText(event.target.value)}
              onScroll={syncScroll}
              onKeyDown={insertTab}
              spellCheck={false}
              wrap="off"
              aria-label={c.lab.editorAria}
            />
          </div>
        </div>
        <p className="editor-footnote">{c.lab.parseHint}</p>
      </section>

      <aside className="lab-side">
        <section className="side-card">
          <div className="side-card-head">
            <h4>{c.lab.quickParams}</h4>
            <span className="tag tag-apricot">{c.lab.draft}</span>
          </div>
          <div className="param-field">
            <div className="param-label">
              <span>{c.lab.temperature}</span>
              <b>{temperature.toFixed(2)}</b>
            </div>
            <input
              type="range"
              className="range"
              min={0}
              max={2}
              step={0.05}
              value={temperature}
              style={sliderStyle(temperature, 0, 2)}
              onChange={(event) =>
                setText((current) =>
                  setParameter(current, 'temperature', Number(event.target.value).toFixed(2))
                )
              }
              aria-label={c.lab.temperature}
            />
          </div>
          <div className="param-field">
            <div className="param-label">
              <span>{c.lab.numCtx}</span>
              <b>{numCtx}</b>
            </div>
            <input
              type="range"
              className="range"
              min={512}
              max={32768}
              step={512}
              value={numCtx}
              style={sliderStyle(numCtx, 512, 32768)}
              onChange={(event) =>
                setText((current) =>
                  setParameter(current, 'num_ctx', String(Number(event.target.value)))
                )
              }
              aria-label={c.lab.numCtx}
            />
          </div>
          <div className="param-field">
            <div className="param-label">
              <span>{c.lab.numPredict}</span>
              <b>{numPredict}</b>
            </div>
            <input
              type="range"
              className="range"
              min={128}
              max={4096}
              step={64}
              value={numPredict}
              style={sliderStyle(numPredict, 128, 4096)}
              onChange={(event) =>
                setText((current) =>
                  setParameter(current, 'num_predict', String(Number(event.target.value)))
                )
              }
              aria-label={c.lab.numPredict}
            />
          </div>
          <p className="side-note">{c.lab.quickParamsNote}</p>
        </section>

        <div className="lab-actions">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => runValidation()}
            disabled={building}
          >
            <Icon name="check_circle" size={17} />
            {c.lab.validate}
          </button>
          <button type="button" className="btn btn-ghost" onClick={saveManually}>
            <Icon name="save" size={17} />
            {c.lab.save}
          </button>
        </div>

        <button
          type="button"
          className="btn btn-primary lab-build"
          onClick={() => void handleBuild()}
          disabled={building}
        >
          <Icon name={building ? 'progress_activity' : 'play_circle'} size={19} filled />
          {building ? c.lab.building : c.lab.build}
        </button>
        <button
          type="button"
          className="text-button lab-reset"
          onClick={() => setResetOpen(true)}
          disabled={building}
        >
          <Icon name="restart_alt" size={15} />
          {c.lab.resetDraft}
        </button>

        <section className={`build-output tone-${outputTone}`}>
          <div className="build-output-head">
            <h4>{c.lab.buildOutput}</h4>
            {outputTone === 'building' ? (
              <span className="tag tag-apricot">
                <Icon name="progress_activity" size={13} />
                {c.lab.building}
              </span>
            ) : outputTone === 'ok' ? (
              <span className="tag tag-sage">{c.lab.validationOk}</span>
            ) : outputTone === 'warn' ? (
              <span className="tag tag-apricot">{c.lab.validationWarn}</span>
            ) : outputTone === 'error' ? (
              <span className="tag tag-danger">{c.lab.validationError}</span>
            ) : (
              <span className="tag tag-mist">{c.common.none}</span>
            )}
          </div>
          {output.length === 0 ? (
            <p className="output-empty">{c.lab.outputEmpty}</p>
          ) : (
            <div className="output-lines">
              {output.map((line, index) => (
                <div key={index} className={`output-line tone-${line.tone}`}>
                  <Icon
                    name={
                      line.tone === 'ok'
                        ? 'check_circle'
                        : line.tone === 'warn'
                          ? 'warning'
                          : line.tone === 'error'
                            ? 'error'
                            : 'chevron_right'
                    }
                    size={14}
                  />
                  <span>{line.text}</span>
                </div>
              ))}
            </div>
          )}
          {lastBuilt && outputTone === 'ok' && (
            <button
              type="button"
              className="btn btn-primary btn-sm output-chat"
              onClick={() => onOpenChat(lastBuilt)}
            >
              <Icon name="forum" size={15} />
              {c.lab.useInChat}
            </button>
          )}
          {lastBuilt && outputTone === 'ok' && <p className="output-note">{c.lab.openChatHint}</p>}
        </section>

        <div className="lab-tip">
          <span className="hint-icon">
            <Icon name="lightbulb" size={17} />
          </span>
          <div>
            <b>{c.lab.hint}</b>
            <p>{c.lab.hintBody}</p>
          </div>
        </div>
      </aside>

      <ConfirmDialog
        open={resetOpen}
        title={c.lab.resetTitle}
        description={c.lab.resetDesc}
        confirmLabel={c.lab.resetDraft}
        cancelLabel={c.common.cancel}
        danger
        onConfirm={resetDraft}
        onCancel={() => setResetOpen(false)}
      />
    </div>
  );
}
