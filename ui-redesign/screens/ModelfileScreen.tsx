import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Copy } from '../copy';
import { fill } from '../copy';
import type { OllamaData } from '../hooks/useOllamaData';
import { createModel } from '../lib/legacy';
import type { OllamaModel } from '../lib/legacy';
import { errorMessage } from '../lib/format';
import { EmptyState, ErrorState, LoadingState } from '../components/StateBlock';

interface ModelfileScreenProps {
  t: Copy;
  ollama: OllamaData;
  selectedTag: string | null;
  onSelectModel: (model: OllamaModel) => void;
  onChatModel: (model: OllamaModel) => void;
  onOpenPull: () => void;
}

function parseField(value: string, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export function ModelfileScreen({
  t,
  ollama,
  selectedTag,
  onSelectModel,
  onChatModel,
  onOpenPull
}: ModelfileScreenProps) {
  const models = ollama.models;
  const initialBase = models.find((model) => model.fullTag === selectedTag) ?? models[0] ?? null;

  const [baseTag, setBaseTag] = useState(initialBase?.fullTag ?? '');
  const [name, setName] = useState(initialBase ? `${initialBase.name.split(':')[0]}-custom` : '');
  const [temperature, setTemperature] = useState(
    String(initialBase?.parameters.temperature ?? 0.6)
  );
  const [topP, setTopP] = useState(String(initialBase?.parameters.topP ?? 0.95));
  const [numCtx, setNumCtx] = useState(String(initialBase?.parameters.numCtx ?? 8192));
  const [stop, setStop] = useState(initialBase?.modelfile.stop ?? '');
  const [system, setSystem] = useState(initialBase?.modelfile.system ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [created, setCreated] = useState<OllamaModel | null>(null);
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<number | null>(null);

  const base = models.find((model) => model.fullTag === baseTag) ?? models[0] ?? null;

  useEffect(() => {
    if (!base || baseTag === base.fullTag) return;
    setBaseTag(base.fullTag);
    setName(`${base.name.split(':')[0]}-custom`);
    setTemperature(String(base.parameters.temperature));
    setTopP(String(base.parameters.topP));
    setNumCtx(String(base.parameters.numCtx));
    setStop(base.modelfile.stop ?? '');
    setSystem(base.modelfile.system ?? '');
  }, [base, baseTag]);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current != null) window.clearTimeout(copyTimerRef.current);
    };
  }, []);

  const changeBase = (tag: string) => {
    const next = models.find((model) => model.fullTag === tag);
    if (!next) return;
    setBaseTag(next.fullTag);
    setName(`${next.name.split(':')[0]}-custom`);
    setTemperature(String(next.parameters.temperature));
    setTopP(String(next.parameters.topP));
    setNumCtx(String(next.parameters.numCtx));
    setStop(next.modelfile.stop ?? '');
    setSystem(next.modelfile.system ?? '');
    setError(null);
    setMessage(null);
    setCreated(null);
  };

  const temperatureValue = parseField(temperature, base?.parameters.temperature ?? 0.6, 0, 2);
  const topPValue = parseField(topP, base?.parameters.topP ?? 0.95, 0, 1);
  const numCtxValue = Math.round(
    parseField(numCtx, base?.parameters.numCtx ?? 8192, 128, 1_048_576)
  );

  const previewLines = [
    `FROM ${base?.fullTag ?? ''}`,
    `PARAMETER temperature ${temperatureValue.toFixed(2)}`,
    `PARAMETER top_p ${topPValue.toFixed(2)}`,
    `PARAMETER num_ctx ${numCtxValue}`
  ];
  if (stop.trim()) previewLines.push(`PARAMETER stop ${JSON.stringify(stop.trim())}`);
  if (system.trim()) previewLines.push('SYSTEM """', system, '"""');
  const preview = previewLines.join('\n');

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(preview);
      setCopied(true);
    } catch {
      setCopied(false);
    }
    if (copyTimerRef.current != null) window.clearTimeout(copyTimerRef.current);
    copyTimerRef.current = window.setTimeout(() => setCopied(false), 2000);
  };

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!base || busy) return;

    const trimmedName = name.trim();
    const targetTag = trimmedName.includes(':') ? trimmedName : `${trimmedName}:latest`;
    if (!trimmedName) {
      setError(t.modelfile.required);
      return;
    }
    if (targetTag === base.fullTag) {
      setError(t.modelfile.invalidName);
      return;
    }

    setBusy(true);
    setError(null);
    setMessage(null);
    setCreated(null);
    try {
      await createModel({
        model: targetTag,
        from: base.fullTag,
        system: system.trim() || undefined,
        parameters: {
          temperature: temperatureValue,
          top_p: topPValue,
          num_ctx: numCtxValue,
          ...(stop.trim() ? { stop: [stop.trim()] } : {})
        }
      });
      const refreshed = await ollama.refresh();
      const found = refreshed.find((model) => model.fullTag === targetTag) ?? null;
      setCreated(found);
      setMessage(fill(t.modelfile.created, { model: found?.fullTag ?? targetTag }));
      if (found) onSelectModel(found);
    } catch (caught) {
      setError(errorMessage(caught) || t.common.unknownError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="screen">
      <header className="screen__head">
        <div className="screen__head-main">
          <h1>{t.modelfile.title}</h1>
          <p className="screen__lede">{t.modelfile.lede}</p>
        </div>
      </header>

      {!base ? (
        ollama.status === 'offline' ? (
          <section className="panel">
            <ErrorState
              title={t.modelfile.noModels}
              text={`${t.errors.ollama} ${ollama.error ?? ''}`}
              retry={() => void ollama.refresh()}
              retryLabel={t.common.retry}
            />
          </section>
        ) : ollama.status === 'connecting' && ollama.lastUpdated == null ? (
          <section className="panel">
            <LoadingState text={t.common.loading} rows={3} />
          </section>
        ) : (
          <section className="panel">
            <EmptyState
              title={t.modelfile.noModels}
              text={t.modelfile.noModelsText}
              action={
                <button type="button" className="btn btn--quiet" onClick={onOpenPull}>
                  {t.runtime.openPull}
                </button>
              }
            />
          </section>
        )
      ) : (
        <div className="modelfile-layout">
          <section className="panel">
            <div className="panel__head">
              <h2 className="panel__title">{t.modelfile.form}</h2>
              <span className="panel__meta measured model-tag">{base.fullTag}</span>
            </div>

            <form id="modelfile-form" onSubmit={handleCreate}>
              <div className="panel__body stack">
                <div className="form-row">
                  <div className="field">
                    <label className="field__label" htmlFor="modelfile-name">
                      {t.modelfile.name}
                    </label>
                    <input
                      id="modelfile-name"
                      className="input"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      placeholder={t.modelfile.namePlaceholder}
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </div>
                  <div className="field">
                    <label className="field__label" htmlFor="modelfile-base">
                      {t.modelfile.base}
                    </label>
                    <select
                      id="modelfile-base"
                      className="select"
                      value={base.fullTag}
                      onChange={(event) => changeBase(event.target.value)}
                      disabled={busy}
                    >
                      {models.map((model) => (
                        <option key={model.id} value={model.fullTag}>
                          {model.fullTag}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="form-row">
                  <div className="field">
                    <label className="field__label" htmlFor="modelfile-temperature">
                      {t.modelfile.temperature}
                    </label>
                    <input
                      id="modelfile-temperature"
                      className="input"
                      type="number"
                      inputMode="decimal"
                      step="0.05"
                      min="0"
                      max="2"
                      value={temperature}
                      onChange={(event) => setTemperature(event.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label className="field__label" htmlFor="modelfile-top-p">
                      {t.modelfile.topP}
                    </label>
                    <input
                      id="modelfile-top-p"
                      className="input"
                      type="number"
                      inputMode="decimal"
                      step="0.05"
                      min="0"
                      max="1"
                      value={topP}
                      onChange={(event) => setTopP(event.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label className="field__label" htmlFor="modelfile-num-ctx">
                      {t.modelfile.numCtx}
                    </label>
                    <input
                      id="modelfile-num-ctx"
                      className="input"
                      type="number"
                      inputMode="numeric"
                      step="128"
                      min="128"
                      value={numCtx}
                      onChange={(event) => setNumCtx(event.target.value)}
                    />
                  </div>
                </div>

                <div className="field">
                  <label className="field__label" htmlFor="modelfile-stop">
                    {t.modelfile.stopLabel}
                  </label>
                  <input
                    id="modelfile-stop"
                    className="input"
                    value={stop}
                    onChange={(event) => setStop(event.target.value)}
                    placeholder={t.modelfile.stopPlaceholder}
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <span className="field__help">{t.modelfile.stopHelp}</span>
                </div>

                <div className="field">
                  <label className="field__label" htmlFor="modelfile-system">
                    {t.modelfile.systemLabel}
                  </label>
                  <textarea
                    id="modelfile-system"
                    className="textarea"
                    rows={6}
                    value={system}
                    onChange={(event) => setSystem(event.target.value)}
                    placeholder={t.modelfile.systemPlaceholder}
                  />
                </div>
              </div>

              <div className="panel__foot">
                <span className="modelfile-result">
                  {message ? (
                    <span className="success-text" role="status">
                      {message}
                    </span>
                  ) : error ? (
                    <span className="error-text" role="alert">
                      {t.modelfile.createError}: {error}
                    </span>
                  ) : null}
                </span>
                <div className="actions-row actions-row--end">
                  {created ? (
                    <button
                      type="button"
                      className="btn btn--quiet"
                      onClick={() => onChatModel(created)}
                    >
                      {t.modelfile.openChat}
                    </button>
                  ) : null}
                  <button type="submit" className="btn btn--primary" disabled={busy}>
                    {busy ? t.modelfile.creating : t.modelfile.create}
                  </button>
                </div>
              </div>
            </form>
          </section>

          <section className="panel">
            <div className="panel__head">
              <h2 className="panel__title">{t.modelfile.preview}</h2>
              <button
                type="button"
                className="btn btn--quiet btn--small"
                onClick={() => void handleCopy()}
              >
                {copied ? t.common.copied : t.common.copy}
              </button>
            </div>
            <div className="panel__body">
              <pre className="modelfile-preview">
                <code>{preview}</code>
              </pre>
            </div>
            <div className="panel__foot">
              <span className="panel__meta">{t.modelfile.previewNote}</span>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
