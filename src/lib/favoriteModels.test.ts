import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CatalogSearchResult } from '../api/catalog';
import {
  FAVORITE_MODELS_KEY,
  MAX_FAVORITE_MODELS,
  favoriteKeyOf,
  loadFavoriteModels,
  resolveFavoriteQuant,
  saveFavoriteModels,
  toggleFavoriteModel
} from './favoriteModels';
import type { FavoriteModel } from './favoriteModels';

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

function makeResult(overrides: Partial<CatalogSearchResult> = {}): CatalogSearchResult {
  return {
    source: 'huggingface',
    name: 'unsloth/Qwen3-8B-GGUF',
    description: 'Qwen3 GGUF',
    url: 'https://huggingface.co/unsloth/Qwen3-8B-GGUF',
    author: 'unsloth',
    downloads: 1234,
    likes: 56,
    tags: ['gguf', 'qwen3'],
    quants: ['Q4_K_M', 'Q8_0'],
    files: ['Qwen3-8B-Q4_K_M.gguf', 'Qwen3-8B-Q8_0.gguf'],
    pipelineTag: 'text-generation',
    lastModified: '2026-10-01T00:00:00.000Z',
    ...overrides
  };
}

describe('favoriteKeyOf', () => {
  it('同名模型按来源区分', () => {
    expect(favoriteKeyOf(makeResult())).toBe('huggingface:unsloth/Qwen3-8B-GGUF');
    expect(favoriteKeyOf(makeResult({ source: 'modelscope' }))).toBe(
      'modelscope:unsloth/Qwen3-8B-GGUF'
    );
  });
});

describe('toggleFavoriteModel', () => {
  it('收藏时保存完整快照与当前量化，放在最前面', () => {
    const older: FavoriteModel = { ...makeResult({ name: 'a/b' }), savedAt: 1 };
    const next = toggleFavoriteModel([older], makeResult(), 'Q8_0', 1000);
    expect(next).toHaveLength(2);
    expect(next[0]).toMatchObject({
      source: 'huggingface',
      name: 'unsloth/Qwen3-8B-GGUF',
      quant: 'Q8_0',
      savedAt: 1000,
      quants: ['Q4_K_M', 'Q8_0'],
      files: ['Qwen3-8B-Q4_K_M.gguf', 'Qwen3-8B-Q8_0.gguf']
    });
    expect(next[1]).toBe(older);
  });

  it('再次切换会取消收藏', () => {
    const once = toggleFavoriteModel([], makeResult(), 'Q4_K_M', 1);
    const twice = toggleFavoriteModel(once, makeResult(), 'Q4_K_M', 2);
    expect(twice).toEqual([]);
  });

  it('同名不同来源互不影响', () => {
    const hf = toggleFavoriteModel([], makeResult(), 'Q4_K_M', 1);
    const both = toggleFavoriteModel(
      hf,
      makeResult({ source: 'ollama', quants: undefined }),
      'x',
      2
    );
    expect(both.map((item) => favoriteKeyOf(item))).toEqual([
      'ollama:unsloth/Qwen3-8B-GGUF',
      'huggingface:unsloth/Qwen3-8B-GGUF'
    ]);
    const removed = toggleFavoriteModel(both, makeResult(), 'Q4_K_M', 3);
    expect(removed.map((item) => favoriteKeyOf(item))).toEqual(['ollama:unsloth/Qwen3-8B-GGUF']);
  });

  it('超过上限时丢弃最旧的收藏', () => {
    let favorites: FavoriteModel[] = [];
    for (let index = 0; index < MAX_FAVORITE_MODELS + 2; index += 1) {
      favorites = toggleFavoriteModel(favorites, makeResult({ name: `repo/model-${index}` }));
    }
    expect(favorites).toHaveLength(MAX_FAVORITE_MODELS);
    expect(favorites[0].name).toBe(`repo/model-${MAX_FAVORITE_MODELS + 1}`);
    expect(favorites.some((item) => item.name === 'repo/model-0')).toBe(false);
  });
});

describe('saveFavoriteModels / loadFavoriteModels', () => {
  beforeEach(() => {
    installStorage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('写入后能读回同样的快照', () => {
    const favorites = toggleFavoriteModel([], makeResult(), 'Q4_K_M', 1234);
    expect(saveFavoriteModels(favorites)).toBe(true);
    expect(loadFavoriteModels()).toEqual(favorites);
    expect(window.localStorage.getItem(FAVORITE_MODELS_KEY)).toContain('Qwen3-8B-Q4_K_M.gguf');
  });

  it('空存储返回空列表', () => {
    expect(loadFavoriteModels()).toEqual([]);
  });

  it('忽略损坏的存储内容与非法条目', () => {
    window.localStorage.setItem(
      FAVORITE_MODELS_KEY,
      JSON.stringify([
        null,
        { source: 'unknown', name: 'a/b', url: 'https://example.com' },
        { source: 'ollama', name: '', url: 'https://example.com' },
        { source: 'ollama', name: 'qwen3', url: 'https://ollama.com/library/qwen3' },
        42
      ])
    );
    const loaded = loadFavoriteModels();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]).toMatchObject({ source: 'ollama', name: 'qwen3' });
  });

  it('非数组内容按空列表处理', () => {
    window.localStorage.setItem(FAVORITE_MODELS_KEY, '{"not":"an array"}');
    expect(loadFavoriteModels()).toEqual([]);
  });

  it('重复条目只保留第一条', () => {
    const first = { ...makeResult(), savedAt: 2 };
    const second = { ...makeResult(), savedAt: 1 };
    window.localStorage.setItem(FAVORITE_MODELS_KEY, JSON.stringify([first, second]));
    expect(loadFavoriteModels()).toEqual([first]);
  });

  it('存储不可用时保存返回 false', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => null,
        setItem: () => {
          throw new Error('quota exceeded');
        },
        removeItem: () => undefined
      }
    });
    expect(saveFavoriteModels(toggleFavoriteModel([], makeResult()))).toBe(false);
  });
});

describe('resolveFavoriteQuant', () => {
  it('优先使用收藏时记录的量化', () => {
    const favorite = toggleFavoriteModel([], makeResult(), 'Q8_0', 1)[0];
    expect(resolveFavoriteQuant(favorite)).toBe('Q8_0');
  });

  it('记录的量化已不在仓库时回退到第一个量化', () => {
    const favorite: FavoriteModel = { ...makeResult(), quant: 'Q2_K', savedAt: 1 };
    expect(resolveFavoriteQuant(favorite)).toBe('Q4_K_M');
  });

  it('没有量化列表时返回记录值或 undefined', () => {
    const favorite: FavoriteModel = {
      ...makeResult({ quants: undefined }),
      quant: 'Q4_K_M',
      savedAt: 1
    };
    expect(resolveFavoriteQuant(favorite)).toBe('Q4_K_M');
    expect(resolveFavoriteQuant({ ...favorite, quant: undefined })).toBeUndefined();
  });
});
