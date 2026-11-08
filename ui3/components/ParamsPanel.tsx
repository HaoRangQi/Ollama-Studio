import type { CSSProperties } from 'react';
import { useTheme } from '../context/ThemeContext';
import type { ChatFlags } from '../lib/chatFlags';
import { formatKeepAlive } from '../lib/legacy';
import type { ModelSettings, OllamaModel } from '../lib/legacy';
import { Icon } from './Icon';

function RangeField({
  label,
  value,
  min,
  max,
  step,
  display,
  disabled,
  onChange
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  const percent = max > min ? ((value - min) / (max - min)) * 100 : 0;
  const style = { '--pct': `${Math.max(0, Math.min(100, percent))}%` } as CSSProperties;
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
        disabled={disabled}
        style={style}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-label={label}
      />
    </div>
  );
}

function SwitchRow({
  label,
  checked,
  disabled,
  onChange
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      className={`switch-row ${checked ? 'is-on' : ''}`}
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span>{label}</span>
      <span className="switch" aria-hidden="true">
        <i />
      </span>
    </button>
  );
}

export interface ParamsPanelProps {
  model: OllamaModel | null;
  settings: ModelSettings;
  flags: ChatFlags;
  persona: string;
  onSettings: (patch: Partial<ModelSettings>) => void;
  onFlags: (patch: Partial<ChatFlags>) => void;
  onPersona: (value: string) => void;
}

export function ParamsPanel({
  model,
  settings,
  flags,
  persona,
  onSettings,
  onFlags,
  onPersona
}: ParamsPanelProps) {
  const { c } = useTheme();
  const disabled = !model;

  const keepAliveValue =
    settings.keepAlive === -1
      ? 'forever'
      : settings.keepAlive === 0
        ? '0'
        : String(settings.keepAlive);
  const knownKeepAlive = ['5m', '15m', '1h', 'forever', '0'].includes(keepAliveValue);

  const hint = !model
    ? c.chat.hintNoModel
    : model.status === 'running'
      ? c.chat.hintLoaded(model.vramUsage ?? '—')
      : c.chat.hintIdle;

  return (
    <>
      <section className="rail-panel">
        <div className="rail-panel-head">
          <h4>{c.chat.sampling}</h4>
          <span className="tag tag-apricot">{c.chat.live}</span>
        </div>
        <RangeField
          label={c.chat.temperature}
          value={settings.temperature}
          min={0}
          max={2}
          step={0.01}
          display={settings.temperature.toFixed(2)}
          disabled={disabled}
          onChange={(value) => onSettings({ temperature: value })}
        />
        <RangeField
          label={c.chat.topP}
          value={settings.topP}
          min={0}
          max={1}
          step={0.01}
          display={settings.topP.toFixed(2)}
          disabled={disabled}
          onChange={(value) => onSettings({ topP: value })}
        />
        <RangeField
          label={c.chat.numCtx}
          value={settings.numCtx}
          min={512}
          max={131072}
          step={512}
          display={String(settings.numCtx)}
          disabled={disabled}
          onChange={(value) => onSettings({ numCtx: value })}
        />
        <RangeField
          label={c.chat.repeatPenalty}
          value={settings.repeatPenalty}
          min={0.5}
          max={2}
          step={0.01}
          display={settings.repeatPenalty.toFixed(2)}
          disabled={disabled}
          onChange={(value) => onSettings({ repeatPenalty: value })}
        />
        <div className="param-field">
          <div className="param-label">
            <span>{c.chat.keepAlive}</span>
          </div>
          <select
            className="select"
            value={keepAliveValue}
            disabled={disabled}
            onChange={(event) => {
              const value = event.target.value;
              onSettings({ keepAlive: value === 'forever' ? -1 : value === '0' ? 0 : value });
            }}
            aria-label={c.chat.keepAlive}
          >
            {!knownKeepAlive && (
              <option value={keepAliveValue}>{formatKeepAlive(settings.keepAlive)}</option>
            )}
            <option value="5m">{c.chat.keepFive}</option>
            <option value="15m">{c.chat.keepFifteen}</option>
            <option value="1h">{c.chat.keepHour}</option>
            <option value="forever">{c.chat.keepForever}</option>
          </select>
        </div>
      </section>

      <section className="rail-panel">
        <div className="rail-panel-head">
          <h4>{c.chat.persona}</h4>
          <span className="tag tag-mist">{c.chat.systemTag}</span>
        </div>
        <textarea
          className="persona"
          value={persona}
          placeholder={c.chat.personaPlaceholder}
          onChange={(event) => onPersona(event.target.value)}
          disabled={disabled}
          rows={4}
        />
      </section>

      <section className="rail-panel rail-toggles">
        <SwitchRow
          label={c.chat.jsonOutput}
          checked={flags.forceJson}
          disabled={disabled}
          onChange={(checked) => onFlags({ forceJson: checked })}
        />
        <SwitchRow
          label={c.chat.showThinking}
          checked={flags.showThinking}
          disabled={disabled}
          onChange={(checked) => onFlags({ showThinking: checked })}
        />
        <SwitchRow
          label={c.chat.streamOutput}
          checked={flags.stream}
          disabled={disabled}
          onChange={(checked) => onFlags({ stream: checked })}
        />
      </section>

      <div className="hint-card">
        <span className="hint-icon">
          <Icon name="auto_awesome" size={17} />
        </span>
        <div>
          <b>{c.chat.hintTitle}</b>
          <p>{hint}</p>
        </div>
      </div>
    </>
  );
}
