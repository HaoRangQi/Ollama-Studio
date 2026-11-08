import type { Language } from '../copy';
import type { OllamaModel } from './legacy';

export function formatBytes(bytes: number, digits = 1): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(digits)} GB`;
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(digits)} MB`;
  if (bytes >= 1_000) return `${Math.round(bytes / 1_000)} KB`;
  return `${Math.round(bytes)} B`;
}

export function bytesToGb(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0';
  return (bytes / 1_000_000_000).toFixed(1);
}

export function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return '0%';
  return `${Math.max(0, Math.min(100, Math.round(value)))}%`;
}

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function formatClock(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function formatClockSeconds(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export function formatRelative(timestamp: number, language: Language): string {
  const now = Date.now();
  const diff = now - timestamp;
  const zh = language === 'zh';
  if (!Number.isFinite(timestamp) || diff < 0) return zh ? '刚刚' : 'just now';
  if (diff < 60_000) return zh ? '刚刚' : 'just now';
  if (diff < 3_600_000) {
    const minutes = Math.max(1, Math.floor(diff / 60_000));
    return zh ? `${minutes} 分钟前` : `${minutes}m ago`;
  }
  if (diff < 86_400_000 && startOfDay(new Date(now)) === startOfDay(new Date(timestamp))) {
    const hours = Math.max(1, Math.floor(diff / 3_600_000));
    return zh ? `${hours} 小时前` : `${hours}h ago`;
  }
  const dayDiff = Math.round(
    (startOfDay(new Date(now)) - startOfDay(new Date(timestamp))) / 86_400_000
  );
  if (dayDiff === 1) return zh ? '昨天' : 'yesterday';
  if (dayDiff > 1 && dayDiff < 7) return zh ? `${dayDiff} 天前` : `${dayDiff}d ago`;
  return new Date(timestamp).toLocaleDateString(zh ? 'zh-CN' : 'en-US', {
    month: 'short',
    day: 'numeric'
  });
}

export function formatDateChip(timestamp: number, language: Language): string {
  const zh = language === 'zh';
  const date = new Date(timestamp);
  const today = startOfDay(new Date());
  const day = startOfDay(date);
  const label =
    day === today
      ? zh
        ? '今天'
        : 'Today'
      : day === today - 86_400_000
        ? zh
          ? '昨天'
          : 'Yesterday'
        : date.toLocaleDateString(zh ? 'zh-CN' : 'en-US', {
            month: 'short',
            day: 'numeric'
          });
  return `${label} ${formatClock(timestamp)}`;
}

export function formatDuration(seconds: number, language: Language): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '—';
  const zh = language === 'zh';
  if (seconds < 60) return zh ? `${Math.ceil(seconds)} 秒` : `${Math.ceil(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.ceil(seconds % 60);
  return zh ? `${minutes} 分 ${rest} 秒` : `${minutes}m ${rest}s`;
}

export function formatEta(seconds: number, language: Language): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '—';
  return formatDuration(seconds, language);
}

/** 从 `qwen2.5:7b-instruct-q4_K_M` 中提取 `Q4_K_M`。 */
export function quantFromTag(tag: string): string {
  const match = tag.match(/((?:IQ|Q)\d(?:_[A-Z0-9]+)+|BF16|F16|F32)$/i);
  return match?.[1] ? match[1].toUpperCase() : '';
}

export function parameterLabel(model: OllamaModel): string {
  if (model.note?.trim()) return model.note.trim();
  const tag = `${model.tag} ${model.fullTag}`.toLowerCase();
  const match = tag.match(/(\d+(?:\.\d+)?)\s*[bB]\b/);
  return match?.[1] ? `${match[1]}B` : '—';
}

export function contextLabel(model: OllamaModel): string {
  return model.context && model.context !== '—' ? model.context.toUpperCase() : '—';
}

export function modelHasCapability(model: OllamaModel | null, capability: string): boolean {
  return Boolean(model?.capabilities?.includes(capability));
}

export function shortModelName(fullTag: string): string {
  const slash = fullTag.lastIndexOf('/');
  return slash >= 0 ? fullTag.slice(slash + 1) : fullTag;
}

export function modelBaseName(name: string): string {
  const colon = name.lastIndexOf(':');
  const base = colon > 0 ? name.slice(0, colon) : name;
  return base.split('/').pop() || base || 'model';
}

export function uniqueName(base: string, existing: string[]): string {
  const normalized = base.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'model';
  let candidate = `${normalized}-copy`;
  let index = 2;
  while (existing.includes(candidate)) {
    candidate = `${normalized}-copy-${index}`;
    index += 1;
  }
  return candidate;
}
