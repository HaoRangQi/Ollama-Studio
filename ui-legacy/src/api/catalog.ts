export type CatalogSource = 'ollama' | 'huggingface' | 'modelscope';

export interface CatalogSearchResult {
  source: CatalogSource;
  name: string;
  description: string;
  url: string;
  author?: string;
  downloads?: number;
  likes?: number;
  tags?: string[];
  quants?: string[];
  /** Remote GGUF sources: GGUF paths available inside the repository. */
  files?: string[];
  pipelineTag?: string;
  lastModified?: string;
}

interface HuggingFaceModel {
  id?: string;
  modelId?: string;
  author?: string;
  downloads?: number;
  likes?: number;
  tags?: string[];
  pipeline_tag?: string;
  lastModified?: string;
  siblings?: Array<{ rfilename?: string }>;
}

const SPLIT_GGUF = /-\d{5}-of-\d{5}\.gguf$/i;
const QUANT_GGUF = /((?:IQ|Q)\d(?:_[A-Z0-9]+)*|BF16|F16|F32)\.gguf$/i;
const PROJECTOR_GGUF = /(?:^|[/_.-])(?:mmproj|projector)(?:[/_.-]|$)/i;

/** Hugging Face 的 mmproj 也是 GGUF，但它不是可独立对话的模型权重。 */
export function isProjectorGguf(file: string): boolean {
  return PROJECTOR_GGUF.test(file);
}

export function extractGgufFiles(siblings: HuggingFaceModel['siblings']): string[] {
  const files = new Set<string>();
  for (const file of siblings ?? []) {
    const path = file.rfilename ?? '';
    if (!/\.gguf$/i.test(path) || SPLIT_GGUF.test(path) || isProjectorGguf(path)) continue;
    files.add(path);
  }
  return Array.from(files).slice(0, 40);
}

/** 返回全部可识别量化，不截断：卡片已有预览 8 个 + “+N” 展开的折叠逻辑。 */
export function extractQuants(files: string[]): string[] {
  const quants = new Set<string>();
  for (const file of files) {
    const match = file.match(QUANT_GGUF);
    if (match?.[1] && !match[1].endsWith('_')) {
      quants.add(match[1].toUpperCase());
    }
  }
  return Array.from(quants);
}

/**
 * Searches the public Ollama model library through the same-origin proxy.
 * The proxy is implemented in vite.config.ts (dev) and server.ts (production).
 */
export async function searchOllamaCatalog(
  query: string,
  signal?: AbortSignal
): Promise<CatalogSearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  let response: Response;
  try {
    response = await fetch(`/api/catalog/search?q=${encodeURIComponent(trimmed)}`, {
      signal,
      headers: { accept: 'text/html' }
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new Error('无法连接 Ollama 模型库，请检查网络。', { cause: error });
  }

  if (!response.ok) {
    let message = `模型库搜索失败（HTTP ${response.status}）`;
    try {
      const data = (await response.json()) as { error?: string };
      if (data.error) message = data.error;
    } catch {
      // The proxy may return HTML on some errors; keep the HTTP message.
    }
    throw new Error(message);
  }

  const html = await response.text();
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const seen = new Set<string>();
  const results: CatalogSearchResult[] = [];

  for (const anchor of Array.from(
    doc.querySelectorAll<HTMLAnchorElement>('a[href^="/library/"]')
  )) {
    const href = anchor.getAttribute('href');
    if (!href) continue;

    const name = anchor.querySelector('h2')?.textContent?.trim() || href.replace('/library/', '');
    const description = anchor.querySelector('p')?.textContent?.trim() || '';

    if (!name || !description || seen.has(name)) continue;
    seen.add(name);
    results.push({
      source: 'ollama',
      name,
      description,
      url: `https://ollama.com${href}`
    });
    if (results.length >= 24) break;
  }

  return results;
}

/**
 * Maps a quantization label (e.g. `Q4_K_M`) to the remote GGUF file that
 * contains it, so the download action knows exactly which blob to fetch.
 */
export function findQuantFile(files: string[] | undefined, quant: string): string | undefined {
  if (!files?.length || !quant) return undefined;
  const escaped = quant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(?:^|[-_.])${escaped}\\.gguf$`, 'i');
  return files.find((file) => pattern.test(file));
}

/** 保留旧名称，避免既有调用方和测试同时改动。 */
export const findModelScopeFile = findQuantFile;

interface ModelScopeSearchItem {
  name: string;
  description: string;
  url: string;
  author?: string;
  downloads?: number;
  likes?: number;
  tags?: string[];
  quants?: string[];
  files?: string[];
  lastModified?: string;
}

/**
 * Searches ModelScope for GGUF repositories through the same-origin proxy.
 * The server appends a `gguf` keyword and normalizes the upstream payload,
 * because ModelScope has no working library filter and no Ollama pull support.
 */
export async function searchModelScopeCatalog(
  query: string,
  signal?: AbortSignal
): Promise<CatalogSearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  let response: Response;
  try {
    response = await fetch(`/api/modelscope/search?q=${encodeURIComponent(trimmed)}`, {
      signal,
      headers: { accept: 'application/json' }
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new Error('无法连接 ModelScope，请检查网络。', { cause: error });
  }

  if (!response.ok) {
    let message = `ModelScope 搜索失败（HTTP ${response.status}）`;
    try {
      const data = (await response.json()) as { error?: string };
      if (data.error) message = data.error;
    } catch {
      // Keep the HTTP message when the proxy returns non-JSON.
    }
    throw new Error(message);
  }

  const payload = (await response.json()) as { results?: ModelScopeSearchItem[] };
  if (!Array.isArray(payload.results)) return [];

  return payload.results.map((item) => ({
    source: 'modelscope' as const,
    name: item.name,
    description: item.description,
    url: item.url,
    author: item.author,
    downloads: item.downloads,
    likes: item.likes,
    tags: item.tags,
    quants: item.quants,
    files: item.files,
    lastModified: item.lastModified
  }));
}

/**
 * Searches Hugging Face for GGUF repositories. The API returns JSON, which is
 * more stable than parsing the Ollama website. `expand[]=siblings` provides
 * both quantization tags and the exact file path used by the local downloader.
 */
export async function searchHuggingFaceCatalog(
  query: string,
  signal?: AbortSignal
): Promise<CatalogSearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const params = new URLSearchParams({
    search: trimmed,
    filter: 'gguf',
    sort: 'downloads',
    direction: '-1',
    limit: '24'
  });
  params.append('expand[]', 'siblings');

  let response: Response;
  try {
    response = await fetch(`/api/hf/api/models?${params.toString()}`, {
      signal,
      headers: { accept: 'application/json' }
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new Error('无法连接 Hugging Face，请检查网络。', { cause: error });
  }

  if (!response.ok) {
    let message = `Hugging Face 搜索失败（HTTP ${response.status}）`;
    try {
      const data = (await response.json()) as { error?: string };
      if (data.error) message = data.error;
    } catch {
      // Keep the HTTP message when the proxy returns non-JSON.
    }
    throw new Error(message);
  }

  const models = (await response.json()) as HuggingFaceModel[];
  if (!Array.isArray(models)) return [];

  return models
    .filter((model) => model.id || model.modelId)
    .map((model) => {
      const id = model.id || model.modelId || '';
      const tags = (model.tags ?? []).filter(
        (tag) => !/^(base_model:|license:|region:|arxiv:)/.test(tag)
      );
      const tagSummary = tags
        .filter((tag) => tag !== 'gguf')
        .slice(0, 4)
        .join(' · ');
      const files = extractGgufFiles(model.siblings);
      return {
        source: 'huggingface' as const,
        name: id,
        description:
          tagSummary || model.pipeline_tag?.replace(/-/g, ' ') || 'GGUF model on Hugging Face',
        url: `https://huggingface.co/${id}`,
        author: model.author || id.split('/')[0],
        downloads: model.downloads,
        likes: model.likes,
        tags: tags.slice(0, 6),
        quants: extractQuants(files),
        files,
        pipelineTag: model.pipeline_tag,
        lastModified: model.lastModified
      };
    });
}
