export type CatalogSource = 'ollama' | 'huggingface';

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
}

interface HuggingFaceModel {
  id?: string;
  modelId?: string;
  author?: string;
  downloads?: number;
  likes?: number;
  tags?: string[];
  pipeline_tag?: string;
  siblings?: Array<{ rfilename?: string }>;
}

const SPLIT_GGUF = /-\d{5}-of-\d{5}\.gguf$/i;
const QUANT_GGUF = /((?:IQ|Q)\d(?:_[A-Z0-9]+)*|BF16|F16|F32)\.gguf$/i;

function extractQuants(siblings: HuggingFaceModel['siblings']): string[] {
  const quants = new Set<string>();
  for (const file of siblings ?? []) {
    const path = file.rfilename ?? '';
    if (!/\.gguf$/i.test(path) || SPLIT_GGUF.test(path)) continue;
    const match = path.match(QUANT_GGUF);
    if (match?.[1] && !match[1].endsWith('_')) {
      quants.add(match[1].toUpperCase());
    }
  }
  return Array.from(quants).slice(0, 12);
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
 * Searches Hugging Face for GGUF repositories. The API returns JSON, which is
 * more stable than parsing the Ollama website. `expand[]=siblings` lets us
 * derive quantization tags for `ollama pull hf.co/<repo>:<quant>` commands.
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
      return {
        source: 'huggingface' as const,
        name: id,
        description:
          model.pipeline_tag?.replace(/-/g, ' ') ||
          tags.slice(0, 3).join(' · ') ||
          'GGUF model on Hugging Face',
        url: `https://huggingface.co/${id}`,
        author: model.author || id.split('/')[0],
        downloads: model.downloads,
        likes: model.likes,
        tags: tags.slice(0, 6),
        quants: extractQuants(model.siblings)
      };
    });
}
