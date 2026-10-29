import type { DownloadSource } from '../types';
import { readStorageJson, writeStorageJson } from './storage';

/**
 * 已安装模型的来源登记表：`ollama create` 后的模型名 → 下载时的渠道与仓库。
 *
 * `/api/tags` 只给出模型名，不提供来源；Ollama 原生 pull 与经本应用下载注册的
 * 模型在名字上无法区分。下载时记下 source，模型卡片才能跳回原始仓库页。
 */
export const MODEL_ORIGIN_KEY = 'ollama_model_origin_v1';

/** 单个来源记录；数量有上限，超出后丢弃最旧的。 */
const MAX_ENTRIES = 200;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 从下载 source 推导可打开的页面地址。
 * HF 用 `hf.co/<repo>`，ModelScope 用 `modelscope.cn/models/<namespace>/<name>`。
 */
export function originUrl(source: DownloadSource): string {
  if ('repo' in source) return `https://huggingface.co/${source.repo}`;
  return `https://modelscope.cn/models/${source.namespace}/${source.name}`;
}

export function originLabel(source: DownloadSource): string {
  return 'repo' in source ? 'Hugging Face' : 'ModelScope';
}

/** 登记一条来源；同名模型重复登记时覆盖，保持最新。 */
export function recordModelOrigin(modelName: string, source: DownloadSource): void {
  const name = modelName.trim();
  if (!name) return;
  const stored = readStorageJson<Record<string, unknown>>(MODEL_ORIGIN_KEY, {});
  const next: Record<string, DownloadSource> = {};
  // 先写入新条目，再按原顺序拼接旧条目：JSON 对象保留插入序，新的排在最前。
  next[name] = source;
  for (const [key, value] of Object.entries(stored)) {
    if (key === name) continue;
    const parsed = parseOrigin(value);
    if (parsed) next[key] = parsed;
    if (Object.keys(next).length >= MAX_ENTRIES) break;
  }
  writeStorageJson(MODEL_ORIGIN_KEY, next);
}

/** 查询某个已安装模型的来源；未登记过返回 undefined。 */
export function lookupModelOrigin(modelName: string): DownloadSource | undefined {
  const stored = readStorageJson<Record<string, unknown>>(MODEL_ORIGIN_KEY, {});
  return parseOrigin(stored[modelName.trim()]);
}

function parseOrigin(value: unknown): DownloadSource | undefined {
  if (!isRecord(value)) return undefined;
  if (typeof value.repo === 'string') {
    const { repo, file, quant, modelName } = value;
    if (typeof file !== 'string' || typeof quant !== 'string' || typeof modelName !== 'string') {
      return undefined;
    }
    return { repo, file, quant, modelName };
  }
  const { namespace, name, file, quant, modelName } = value;
  if (
    typeof namespace !== 'string' ||
    typeof name !== 'string' ||
    typeof file !== 'string' ||
    typeof quant !== 'string' ||
    typeof modelName !== 'string'
  ) {
    return undefined;
  }
  return { namespace, name, file, quant, modelName };
}
