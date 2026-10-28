import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OllamaModel } from '../types';
import {
  DEFAULT_KEEP_ALIVE,
  MODEL_SETTINGS_KEY,
  defaultSettings,
  formatKeepAlive,
  loadModelSettings,
  normalizeSettings,
  saveModelSettings
} from './modelSettings';

const model: OllamaModel = {
  id: 'm:latest',
  name: 'm',
  tag: 'latest',
  fullTag: 'm:latest',
  category: 'llm',
  categoryLabel: 'LLM',
  description: '',
  quantization: 'Q4_K_M',
  size: '1 GB',
  sizeGb: 1,
  context: '8k',
  status: 'idle',
  icon: 'psychology',
  iconBg: '',
  iconColor: '',
  parameters: { temperature: 0.6, topP: 0.95, numCtx: 8192, repeatPenalty: 1.1 },
  modelfile: { from: 'm:latest', stop: '', temperature: 0.6, system: '' }
};

function installStorage() {
  const data = new Map<string, string>();
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => {
        data.set(key, value);
      },
      removeItem: (key: string) => {
        data.delete(key);
      }
    }
  });
  return data;
}

describe('defaultSettings', () => {
  it('copies model parameter defaults and the standard keep_alive', () => {
    expect(defaultSettings(model)).toEqual({
      temperature: 0.6,
      topP: 0.95,
      numCtx: 8192,
      repeatPenalty: 1.1,
      keepAlive: DEFAULT_KEEP_ALIVE
    });
  });
});

describe('normalizeSettings', () => {
  const fallback = defaultSettings(model);

  it('clamps out-of-range values', () => {
    const settings = normalizeSettings(
      { temperature: 9, topP: -1, numCtx: 0, repeatPenalty: 100, keepAlive: -1 },
      fallback
    );
    expect(settings.temperature).toBe(2);
    expect(settings.topP).toBe(0);
    expect(settings.numCtx).toBe(128);
    expect(settings.repeatPenalty).toBe(3);
    expect(settings.keepAlive).toBe(-1);
  });

  it('falls back for malformed input', () => {
    expect(normalizeSettings('nope', fallback)).toBe(fallback);
    expect(normalizeSettings({ temperature: 'hot' }, fallback).temperature).toBe(
      fallback.temperature
    );
  });

  it('rounds numCtx and accepts duration strings', () => {
    const settings = normalizeSettings({ numCtx: 1000.7, keepAlive: ' 10m ' }, fallback);
    expect(settings.numCtx).toBe(1001);
    expect(settings.keepAlive).toBe('10m');
  });
});

describe('formatKeepAlive', () => {
  it('renders infinite and immediate values', () => {
    expect(formatKeepAlive(-1)).toBe('∞');
    expect(formatKeepAlive(0)).toBe('0');
    expect(formatKeepAlive('5m')).toBe('5m');
  });
});

describe('load/save model settings', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('persists settings per model tag', () => {
    const storage = installStorage();
    const settings = { ...defaultSettings(model), temperature: 1.2 };
    expect(saveModelSettings('m:latest', settings)).toBe(true);
    expect(storage.has(MODEL_SETTINGS_KEY)).toBe(true);
    expect(loadModelSettings('m:latest', defaultSettings(model)).temperature).toBe(1.2);
  });

  it('returns fallback for unknown models', () => {
    installStorage();
    expect(loadModelSettings('other:latest', defaultSettings(model))).toEqual(
      defaultSettings(model)
    );
  });
});
