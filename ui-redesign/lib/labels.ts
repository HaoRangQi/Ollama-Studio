import type { Copy } from '../copy';
import { formatBytes } from './format';
import type { OllamaModel } from './legacy';

export function categoryLabel(category: OllamaModel['category'], t: Copy): string {
  switch (category) {
    case 'code':
      return t.common.categoryCode;
    case 'vision':
      return t.common.categoryVision;
    case 'embedding':
      return t.common.categoryEmbedding;
    default:
      return t.common.categoryLlm;
  }
}

export function modelTraits(model: OllamaModel): string {
  return [model.note, ...(model.capabilities ?? [])]
    .filter((item): item is string => Boolean(item))
    .join(', ');
}

export interface ByteParts {
  value: string;
  unit: string;
}

/** Split a formatted byte string so the unit can take the theme's smaller mono step. */
export function splitBytes(bytes: number | null | undefined): ByteParts | null {
  const text = formatBytes(bytes);
  if (!text) return null;
  const parts = text.split(/\s+/);
  const unit = parts.pop() ?? '';
  return { value: parts.join(' '), unit };
}
