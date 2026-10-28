import type { OllamaModel } from '../types';
import { readStorageJson, writeStorageJson } from './storage';

export const MODEL_SETTINGS_KEY = 'ollama_model_settings_v1';

export type KeepAlive = string | number;

export interface ModelSettings {
  temperature: number;
  topP: number;
  numCtx: number;
  repeatPenalty: number;
  keepAlive: KeepAlive;
}

export const DEFAULT_KEEP_ALIVE: KeepAlive = '5m';

export function defaultSettings(model: OllamaModel): ModelSettings {
  return {
    temperature: model.parameters.temperature,
    topP: model.parameters.topP,
    numCtx: model.parameters.numCtx,
    repeatPenalty: model.parameters.repeatPenalty,
    keepAlive: DEFAULT_KEEP_ALIVE
  };
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function normalizeKeepAlive(value: unknown): KeepAlive {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value === 0 ? 0 : value < 0 ? -1 : Math.min(value, 86_400);
  }
  if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 16);
  return DEFAULT_KEEP_ALIVE;
}

export function normalizeSettings(value: unknown, fallback: ModelSettings): ModelSettings {
  if (typeof value !== 'object' || value === null) return fallback;
  const raw = value as Record<string, unknown>;
  const readNumber = (key: string, fallbackValue: number, min: number, max: number) =>
    typeof raw[key] === 'number' ? clamp(raw[key] as number, min, max) : fallbackValue;

  return {
    temperature: readNumber('temperature', fallback.temperature, 0, 2),
    topP: readNumber('topP', fallback.topP, 0, 1),
    numCtx: Math.round(readNumber('numCtx', fallback.numCtx, 128, 1_048_576)),
    repeatPenalty: readNumber('repeatPenalty', fallback.repeatPenalty, 0.1, 3),
    keepAlive: normalizeKeepAlive(raw.keepAlive ?? fallback.keepAlive)
  };
}

type SettingsMap = Record<string, unknown>;

export function loadModelSettings(modelTag: string, fallback: ModelSettings): ModelSettings {
  const all = readStorageJson<SettingsMap>(MODEL_SETTINGS_KEY, {});
  return normalizeSettings(all[modelTag], fallback);
}

export function saveModelSettings(modelTag: string, settings: ModelSettings): boolean {
  const all = readStorageJson<SettingsMap>(MODEL_SETTINGS_KEY, {});
  all[modelTag] = settings;
  return writeStorageJson(MODEL_SETTINGS_KEY, all);
}

export function formatKeepAlive(value: KeepAlive): string {
  if (value === -1) return '∞';
  if (value === 0) return '0';
  return String(value);
}
