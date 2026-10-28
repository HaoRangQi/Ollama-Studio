import { OllamaModel } from '../types';
import { OllamaRunning, OllamaTag } from './ollama';

const CATEGORY_STYLES: Record<
  OllamaModel['category'],
  Pick<OllamaModel, 'categoryLabel' | 'icon' | 'iconBg' | 'iconColor'>
> = {
  llm: {
    categoryLabel: '大语言 LLM',
    icon: 'psychology',
    iconBg: 'bg-[#7952ec]/20',
    iconColor: 'text-[#cdbdff]'
  },
  code: {
    categoryLabel: '代码专家',
    icon: 'code',
    iconBg: 'bg-[#0284c7]/20',
    iconColor: 'text-[#7dd3fc]'
  },
  vision: {
    categoryLabel: '多模态视觉',
    icon: 'visibility',
    iconBg: 'bg-[#d946ef]/20',
    iconColor: 'text-[#f5d0fe]'
  },
  embedding: {
    categoryLabel: '向量嵌入',
    icon: 'hub',
    iconBg: 'bg-[#059669]/20',
    iconColor: 'text-[#6ee7b7]'
  }
};

export function inferCategory(name: string, capabilities: string[] = []): OllamaModel['category'] {
  const value = name.toLowerCase();
  if (capabilities.includes('embedding')) return 'embedding';
  if (capabilities.includes('vision')) return 'vision';
  if (value.includes('coder') || value.includes('code')) return 'code';
  if (value.includes('embed') || value.includes('nomic') || value.includes('bge')) {
    return 'embedding';
  }
  return 'llm';
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(0)} MB`;
  return `${Math.round(bytes / 1_000)} KB`;
}

export function formatContext(tag: OllamaTag): string {
  const length = tag.details?.context_length;
  if (!length) return '—';
  if (length >= 1024) return `${Math.round(length / 1024)}k`;
  return String(length);
}

export function mapOllamaModel(tag: OllamaTag, running?: OllamaRunning): OllamaModel {
  const fullTag = tag.name || tag.model;
  const colon = fullTag.lastIndexOf(':');
  const name = colon > 0 ? fullTag.slice(0, colon) : fullTag;
  const version = colon > 0 ? fullTag.slice(colon + 1) : 'latest';
  const category = inferCategory(fullTag, tag.capabilities);
  const style = CATEGORY_STYLES[category];
  const details = tag.details;
  const capabilities = tag.capabilities?.length ? ` · ${tag.capabilities.join(' / ')}` : '';

  return {
    id: fullTag,
    name,
    tag: version,
    fullTag,
    category,
    categoryLabel: style.categoryLabel,
    description: `本地 Ollama 模型${details?.family ? ` · ${details.family}` : ''}${
      details?.parameter_size ? ` · ${details.parameter_size}` : ''
    }${capabilities}`,
    quantization: details?.quantization_level ?? '—',
    size: formatBytes(tag.size),
    sizeGb: tag.size / 1_000_000_000,
    context: formatContext(tag),
    speed: running ? '—' : undefined,
    status: running ? 'running' : 'idle',
    vramUsage: running ? formatBytes(running.size_vram) : '—',
    sizeVramBytes: running?.size_vram ?? 0,
    gpuLayers: running ? '已加载' : '—',
    kvCache: '—',
    lastUsed: running?.expires_at
      ? `保留至 ${new Date(running.expires_at).toLocaleTimeString()}`
      : '—',
    note: details?.parameter_size,
    capabilities: tag.capabilities,
    icon: style.icon,
    iconBg: style.iconBg,
    iconColor: style.iconColor,
    parameters: {
      temperature: 0.6,
      topP: 0.95,
      numCtx: details?.context_length ? Math.min(details.context_length, 32768) : 8192,
      repeatPenalty: 1.1
    },
    modelfile: {
      from: fullTag,
      stop: '',
      temperature: 0.6,
      system: ''
    }
  };
}

export function mapOllamaModels(tags: OllamaTag[], running: OllamaRunning[]): OllamaModel[] {
  const runningByName = new Map<string, OllamaRunning>();
  for (const item of running) {
    runningByName.set(item.name, item);
    runningByName.set(item.model, item);
  }

  return tags.map((tag) => mapOllamaModel(tag, runningByName.get(tag.name)));
}
