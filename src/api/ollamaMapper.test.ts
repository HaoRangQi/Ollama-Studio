import { describe, expect, it } from 'vitest';
import {
  formatBytes,
  formatContext,
  inferCategory,
  mapOllamaModel,
  mapOllamaModels
} from './ollamaMapper';
import type { OllamaRunning, OllamaTag } from './ollama';

const tag: OllamaTag = {
  name: 'qwen2.5-coder:7b',
  model: 'qwen2.5-coder:7b',
  modified_at: '2026-10-28T00:00:00Z',
  size: 4_700_000_000,
  digest: 'abc',
  details: {
    family: 'qwen2',
    parameter_size: '7B',
    quantization_level: 'Q4_K_M',
    context_length: 32768
  },
  capabilities: ['completion', 'tools']
};

describe('inferCategory', () => {
  it('uses capabilities before name heuristics', () => {
    expect(inferCategory('some-model', ['vision'])).toBe('vision');
    expect(inferCategory('some-model', ['embedding'])).toBe('embedding');
  });

  it('falls back to name heuristics', () => {
    expect(inferCategory('deepseek-coder:6.7b')).toBe('code');
    expect(inferCategory('nomic-embed-text')).toBe('embedding');
    expect(inferCategory('llama3.2:3b')).toBe('llm');
  });
});

describe('formatBytes', () => {
  it('formats GB, MB, KB and invalid values', () => {
    expect(formatBytes(4_700_000_000)).toBe('4.7 GB');
    expect(formatBytes(672_003_861)).toBe('672 MB');
    expect(formatBytes(2_048)).toBe('2 KB');
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(Number.NaN)).toBe('0 B');
  });
});

describe('formatContext', () => {
  it('renders k-suffixed context windows', () => {
    expect(formatContext(tag)).toBe('32k');
    expect(formatContext({ ...tag, details: { context_length: 512 } })).toBe('512');
    expect(formatContext({ ...tag, details: {} })).toBe('—');
  });
});

describe('mapOllamaModel', () => {
  it('splits name and tag and applies defaults', () => {
    const model = mapOllamaModel(tag);
    expect(model.id).toBe('qwen2.5-coder:7b');
    expect(model.name).toBe('qwen2.5-coder');
    expect(model.tag).toBe('7b');
    expect(model.category).toBe('code');
    expect(model.status).toBe('idle');
    expect(model.sizeGb).toBeCloseTo(4.7);
    expect(model.context).toBe('32k');
    expect(model.parameters.numCtx).toBe(32768);
  });

  it('marks running models and reports VRAM', () => {
    const running: OllamaRunning = {
      name: tag.name,
      model: tag.model,
      size: tag.size,
      digest: tag.digest,
      expires_at: '2026-10-28T01:00:00Z',
      size_vram: 5_000_000_000
    };
    const model = mapOllamaModel(tag, running);
    expect(model.status).toBe('running');
    expect(model.vramUsage).toBe('5.0 GB');
    expect(model.lastUsed).toContain('保留至');
  });

  it('handles tags without a version suffix', () => {
    const model = mapOllamaModel({ ...tag, name: 'llama3', model: 'llama3' });
    expect(model.name).toBe('llama3');
    expect(model.tag).toBe('latest');
  });
});

describe('mapOllamaModels', () => {
  it('matches running entries by name and model', () => {
    const running: OllamaRunning = {
      name: 'qwen2.5-coder:7b',
      model: 'qwen2.5-coder:7b',
      size: tag.size,
      digest: tag.digest,
      expires_at: '2026-10-28T01:00:00Z',
      size_vram: 1
    };
    const models = mapOllamaModels([tag], [running]);
    expect(models).toHaveLength(1);
    expect(models[0].status).toBe('running');
  });

  it('returns an empty list for no tags', () => {
    expect(mapOllamaModels([], [])).toEqual([]);
  });
});
