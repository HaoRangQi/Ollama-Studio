import type { CatalogSearchResult, CatalogSource } from '../api/catalog';
import { readStorageJson, writeStorageJson } from './storage';

/**
 * 搜索结果的本地收藏夹：只保存快照，不下载模型，也不请求服务端。
 * 经典界面与 UI3 共用同一个键，收藏在两边都能看到。
 */
export const FAVORITE_MODELS_KEY = 'ollama_favorite_models_v1';

/** 单条快照包含文件列表，200 条远低于 localStorage 的常见配额。 */
export const MAX_FAVORITE_MODELS = 200;

const SOURCES: readonly CatalogSource[] = ['ollama', 'huggingface', 'modelscope'];

export interface FavoriteModel extends CatalogSearchResult {
  /** 收藏时搜索结果里选中的量化；Ollama 官方模型没有量化。 */
  quant?: string;
  savedAt: number;
}

export function favoriteKey(source: CatalogSource, name: string): string {
  return `${source}:${name}`;
}

export function favoriteKeyOf(model: Pick<CatalogSearchResult, 'source' | 'name'>): string {
  return favoriteKey(model.source, model.name);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readStringList(value: unknown, limit: number): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const list = value
    .filter((item): item is string => typeof item === 'string' && item.trim() !== '')
    .slice(0, limit);
  return list.length > 0 ? list : undefined;
}

function parseFavorite(value: unknown): FavoriteModel | null {
  if (!isRecord(value)) return null;
  const source = value.source;
  const name = readString(value.name);
  const url = readString(value.url);
  if (!SOURCES.includes(source as CatalogSource) || !name || !url) return null;

  return {
    source: source as CatalogSource,
    name,
    url,
    description: typeof value.description === 'string' ? value.description : '',
    author: readString(value.author),
    downloads: readNumber(value.downloads),
    likes: readNumber(value.likes),
    tags: readStringList(value.tags, 32),
    quants: readStringList(value.quants, 64),
    files: readStringList(value.files, 40),
    pipelineTag: readString(value.pipelineTag),
    lastModified: readString(value.lastModified),
    quant: readString(value.quant),
    savedAt: readNumber(value.savedAt) ?? 0
  };
}

/** 读取收藏夹；损坏或不可用的存储按空列表处理。 */
export function loadFavoriteModels(): FavoriteModel[] {
  const stored = readStorageJson<unknown>(FAVORITE_MODELS_KEY, []);
  if (!Array.isArray(stored)) return [];

  const seen = new Set<string>();
  const favorites: FavoriteModel[] = [];
  for (const entry of stored) {
    const parsed = parseFavorite(entry);
    if (!parsed) continue;
    const key = favoriteKeyOf(parsed);
    if (seen.has(key)) continue;
    seen.add(key);
    favorites.push(parsed);
    if (favorites.length >= MAX_FAVORITE_MODELS) break;
  }
  return favorites;
}

/** 写入收藏夹；存储不可用时返回 false，调用方保留内存状态。 */
export function saveFavoriteModels(favorites: readonly FavoriteModel[]): boolean {
  return writeStorageJson(FAVORITE_MODELS_KEY, favorites.slice(0, MAX_FAVORITE_MODELS));
}

/** 切换收藏：已存在则移除，否则把搜索结果快照放到最前面。 */
export function toggleFavoriteModel(
  favorites: readonly FavoriteModel[],
  result: CatalogSearchResult,
  quant?: string,
  now: number = Date.now()
): FavoriteModel[] {
  const key = favoriteKeyOf(result);
  if (favorites.some((favorite) => favoriteKeyOf(favorite) === key)) {
    return favorites.filter((favorite) => favoriteKeyOf(favorite) !== key);
  }

  const snapshot: FavoriteModel = {
    source: result.source,
    name: result.name,
    description: result.description ?? '',
    url: result.url,
    author: result.author,
    downloads: result.downloads,
    likes: result.likes,
    tags: result.tags,
    quants: result.quants,
    files: result.files,
    pipelineTag: result.pipelineTag,
    lastModified: result.lastModified,
    quant: quant?.trim() || undefined,
    savedAt: now
  };
  return [snapshot, ...favorites].slice(0, MAX_FAVORITE_MODELS);
}

/**
 * 收藏时记录过量化则优先使用；仓库文件变化后回退到第一个可用量化。
 * Ollama 官方模型没有量化，返回 undefined。
 */
export function resolveFavoriteQuant(favorite: FavoriteModel): string | undefined {
  const quants = favorite.quants ?? [];
  if (favorite.quant && quants.includes(favorite.quant)) return favorite.quant;
  return quants[0] ?? favorite.quant;
}
