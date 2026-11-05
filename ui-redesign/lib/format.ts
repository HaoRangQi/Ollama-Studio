import type { Lang } from '../copy';

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

/** Decimal byte formatting, matching how Ollama and macOS report model sizes. */
export function formatBytes(bytes: number | null | undefined): string | null {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return null;
  if (bytes < 1000) return `${Math.round(bytes)}\u00A0B`;

  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < BYTE_UNITS.length - 1) {
    value /= 1000;
    unit += 1;
  }

  const digits = value >= 100 ? 0 : value >= 10 ? 1 : 2;
  const text = value
    .toFixed(digits)
    .replace(/\.0+$/, '')
    .replace(/(\.\d*[1-9])0+$/, '$1');
  return `${text}\u00A0${BYTE_UNITS[unit]}`;
}

export function formatPercent(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  return `${Math.round(value)}%`;
}

export function formatLoad(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  return value.toFixed(2);
}

export function formatCount(value: number, lang: Lang): string | null {
  if (!Number.isFinite(value)) return null;
  return new Intl.NumberFormat(lang === 'zh' ? 'zh-CN' : 'en-US').format(value);
}

export function formatTime(value: number | string | null | undefined, lang: Lang): string | null {
  if (value == null) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(lang === 'zh' ? 'zh-CN' : 'en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(date);
}

export function formatDate(value: number | string | null | undefined, lang: Lang): string | null {
  if (value == null) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(lang === 'zh' ? 'zh-CN' : 'en-US', {
    month: 'short',
    day: 'numeric'
  }).format(date);
}

/** Ratio in 0..1 for meter fills; callers pass the real total. */
export function ratio(value: number, total: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.min(1, Math.max(0, value / total));
}

export function durationSeconds(durationMs: number | null | undefined): string | null {
  if (durationMs == null || !Number.isFinite(durationMs) || durationMs < 0) return null;
  return (durationMs / 1000).toFixed(1);
}

export function tokensPerSecond(
  tokens: number | null | undefined,
  durationMs: number | null | undefined
): string | null {
  if (tokens == null || durationMs == null) return null;
  if (!Number.isFinite(tokens) || !Number.isFinite(durationMs) || durationMs <= 0) return null;
  return (tokens / (durationMs / 1000)).toFixed(1);
}

/** API metadata sometimes arrives joined with middle dots; render the facts as a comma list. */
export function sanitizeMeta(value: string): string {
  return value.replace(/\s*·\s*/g, ', ').replace(/\s*—\s*/g, ', ');
}

/** The mapper uses a dash for absent metadata; never show that dash as if it were a value. */
export function displayValue(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed === '—' || trimmed === '–' || trimmed === '-') return null;
  return sanitizeMeta(trimmed);
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error) return error;
  return '';
}

export function createLocalId(prefix: string): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
    return `${prefix}-${cryptoApi.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
