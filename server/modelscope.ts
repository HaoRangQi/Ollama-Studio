import { createWriteStream } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createModelFromGguf, GgufImportError, normalizeGgufModelName } from './importGguf';
import { readJsonBody } from './http';

const MAX_SCOPESIZE_BYTES = 20 * 1024 * 1024 * 1024;
/** ModelScope 的命名空间/模型名/文件名只允许这些字符，同时挡掉路径穿越。 */
const SAFE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const SAFE_FILE = /^[A-Za-z0-9][A-Za-z0-9._/-]*\.gguf$/i;

export interface ModelScopePullOptions {
  namespace: string;
  name: string;
  file: string;
  revision?: string;
  model?: string;
  ollamaHost: string;
  signal?: AbortSignal;
  onProgress?: (progress: { downloaded: number; total: number }) => void;
  onStage?: (stage: 'creating') => void;
}

export interface ModelScopePullResult {
  model: string;
}

function assertSegment(value: string, label: string): string {
  const trimmed = value.trim();
  if (!SAFE_SEGMENT.test(trimmed)) {
    throw new GgufImportError(`${label} 含非法字符。`, 400);
  }
  return trimmed;
}

/**
 * ModelScope 的直链格式与 Hugging Face 类似，但没有 `hf.co` 前缀，也不会被
 * Ollama 识别为可 `pull` 的模型，因此只能由本服务下载后再 `ollama create`。
 */
export function buildModelScopeFileUrl(options: {
  namespace: string;
  name: string;
  file: string;
  revision?: string;
}): string {
  const namespace = assertSegment(options.namespace, 'namespace');
  const name = assertSegment(options.name, 'model');
  const revision = assertSegment(options.revision || 'master', 'revision');
  const file = options.file.trim();
  if (!SAFE_FILE.test(file) || file.includes('..')) {
    throw new GgufImportError('文件路径非法。', 400);
  }
  return `https://modelscope.cn/models/${encodeURIComponent(namespace)}/${encodeURIComponent(
    name
  )}/resolve/${encodeURIComponent(revision)}/${file
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')}`;
}

/**
 * Downloads a GGUF file from ModelScope and registers it with Ollama.
 * The temporary file is always removed, including on error or abort.
 */
export async function pullFromModelScope(
  options: ModelScopePullOptions
): Promise<ModelScopePullResult> {
  const file = options.file.trim();
  if (!file.toLowerCase().endsWith('.gguf')) {
    throw new GgufImportError('仅支持 .gguf 文件。', 400);
  }

  const model = normalizeGgufModelName(options.model, path.basename(file));
  const url = buildModelScopeFileUrl({ ...options, file });

  let response: Response;
  try {
    response = await fetch(url, {
      signal: options.signal,
      redirect: 'follow',
      headers: { 'user-agent': 'ollama-studio' }
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new GgufImportError(`无法连接 ModelScope：${message}`, 502);
  }

  if (!response.ok || !response.body) {
    throw new GgufImportError(`ModelScope 返回 HTTP ${response.status}。`, 502);
  }

  let total = Number(response.headers.get('content-length') || 0);
  if (!total) {
    total = await readModelScopeFileSize(
      `${options.namespace}/${options.name}`,
      file,
      options.revision || 'master'
    ).catch(() => 0);
  }
  if (total > MAX_SCOPESIZE_BYTES) {
    throw new GgufImportError('GGUF 文件超过 20 GB 限制。', 413);
  }

  const directory = await mkdtemp(path.join(tmpdir(), 'ollama-studio-ms-'));
  const filePath = path.join(directory, 'download.gguf');
  let downloaded = 0;
  let lastReportedAt = 0;

  const meter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      downloaded += chunk.length;
      if (downloaded > MAX_SCOPESIZE_BYTES) {
        callback(new GgufImportError('GGUF 文件超过 20 GB 限制。', 413));
        return;
      }
      // 节流到约 200ms 一次，避免刷爆 NDJSON 流。
      const now = Date.now();
      if (options.onProgress && now - lastReportedAt >= 200) {
        lastReportedAt = now;
        options.onProgress({ downloaded, total });
      }
      callback(null, chunk);
    }
  });

  try {
    await pipeline(
      Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]),
      meter,
      createWriteStream(filePath)
    );

    if (downloaded === 0) {
      throw new GgufImportError('ModelScope 返回的文件为空。', 502);
    }
    options.onProgress?.({ downloaded, total: total || downloaded });
    options.onStage?.('creating');

    await createModelFromGguf(filePath, model, options.ollamaHost);
    return { model };
  } finally {
    await rm(directory, { recursive: true, force: true }).catch(() => undefined);
  }
}

const SPLIT_GGUF = /-\d{5}-of-\d{5}\.gguf$/i;
const QUANT_GGUF = /((?:IQ|Q)\d(?:_[A-Z0-9]+)*|BF16|F16|F32)\.gguf$/i;

interface ModelScopeHit {
  Path?: string;
  Name?: string;
  Downloads?: number;
  Stars?: number;
  Tags?: string[];
  Libraries?: string[];
  Description?: string;
  LastUpdatedTime?: number;
  License?: string;
}

function isGgufRepo(model: ModelScopeHit): boolean {
  const libraries = (model.Libraries ?? []).map((value) => String(value).toLowerCase());
  const tags = (model.Tags ?? []).map((value) => String(value).toLowerCase());
  return libraries.includes('gguf') || tags.includes('gguf') || /gguf/i.test(model.Name ?? '');
}

/**
 * ModelScope 的搜索接口没有可用的 GGUF 过滤参数，但把 "gguf" 并入关键字后
 * 结果几乎全是 GGUF 仓库，因此在服务端追加关键字，再按标签兜底过滤。
 */
export async function searchModelScope(
  query: string,
  page = 1,
  limit = 24
): Promise<
  Array<{
    name: string;
    description: string;
    url: string;
    author?: string;
    downloads?: number;
    likes?: number;
    tags?: string[];
    quants?: string[];
    /** 仓库内的 GGUF 路径，供客户端把量化标签映射到具体文件。 */
    files?: string[];
    lastModified?: string;
  }>
> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const keyword = /gguf/i.test(trimmed) ? trimmed : `${trimmed} gguf`;
  const response = await fetch('https://modelscope.cn/api/v1/dolphin/models', {
    method: 'PUT',
    headers: { 'content-type': 'application/json', 'user-agent': 'ollama-studio' },
    body: JSON.stringify({
      PageSize: Math.min(Math.max(limit, 1), 50),
      PageNumber: Math.max(page, 1),
      SortBy: 'Default',
      Target: '',
      SingleCriterion: [],
      Name: keyword
    })
  });

  if (!response.ok) {
    throw new GgufImportError(`ModelScope 搜索失败（HTTP ${response.status}）。`, 502);
  }

  const payload = (await response.json()) as {
    Data?: { Model?: { Models?: ModelScopeHit[] } };
  };
  const models = payload.Data?.Model?.Models ?? [];

  const hits = models
    .filter((model) => model.Path && model.Name && isGgufRepo(model))
    .map((model) => ({
      name: `${model.Path}/${model.Name}`,
      description:
        (model.Tags ?? [])
          .filter((tag) => !/^(gguf|pytorch|safetensors)$/i.test(tag))
          .slice(0, 4)
          .join(' · ') ||
        model.Description ||
        'GGUF model on ModelScope',
      url: `https://modelscope.cn/models/${model.Path}/${model.Name}`,
      author: model.Path,
      downloads: model.Downloads,
      likes: model.Stars,
      tags: (model.Tags ?? []).slice(0, 6),
      lastModified: model.LastUpdatedTime
        ? new Date(model.LastUpdatedTime * 1000).toISOString()
        : undefined
    }));

  // 每条结果补一次文件列表：既用于量化标签，也用于把量化映射到具体文件。
  // 限制并发，避免一次对 ModelScope 打太多请求。
  const withFiles: Array<(typeof hits)[number] & { quants: string[]; files: string[] }> = [];
  const CONCURRENCY = 6;
  for (let start = 0; start < hits.length; start += CONCURRENCY) {
    const slice = hits.slice(start, start + CONCURRENCY);
    const settled = await Promise.all(
      slice.map(async (hit) => {
        try {
          const files = await listModelScopeFiles(hit.name);
          const ggufFiles = files.filter((file) => /\.gguf$/i.test(file) && !SPLIT_GGUF.test(file));
          const quants = Array.from(
            new Set(
              ggufFiles
                .map((file) => file.match(QUANT_GGUF)?.[1]?.toUpperCase())
                .filter((quant): quant is string => Boolean(quant))
            )
          ).slice(0, 12);
          return { ...hit, quants, files: ggufFiles.slice(0, 40) };
        } catch {
          return { ...hit, quants: [] as string[], files: [] as string[] };
        }
      })
    );
    withFiles.push(...settled);
  }

  return withFiles;
}

interface ModelScopeFileEntry {
  Path?: string;
  Type?: string;
  Size?: number;
}

async function fetchModelScopeFileEntries(
  modelId: string,
  revision: string
): Promise<ModelScopeFileEntry[]> {
  const [namespace, name] = modelId.split('/');
  if (!namespace || !name) throw new GgufImportError('模型标识格式应为 namespace/name。', 400);
  const url = `https://modelscope.cn/api/v1/models/${encodeURIComponent(
    namespace
  )}/${encodeURIComponent(name)}/repo/files?Revision=${encodeURIComponent(revision)}&Root=`;
  const response = await fetch(url, { headers: { 'user-agent': 'ollama-studio' } });
  if (!response.ok) {
    throw new GgufImportError(`无法读取 ModelScope 文件列表（HTTP ${response.status}）。`, 502);
  }
  const payload = (await response.json()) as { Data?: { Files?: ModelScopeFileEntry[] } };
  return (payload.Data?.Files ?? []).filter((file) => file.Type === 'blob' && file.Path);
}

export async function listModelScopeFiles(modelId: string, revision = 'master'): Promise<string[]> {
  const files = await fetchModelScopeFileEntries(modelId, revision);
  return files.map((file) => file.Path as string);
}

/**
 * 直链响应不带 content-length（分块传输），进度条需要总大小，
 * 因此回退到文件列表里的 Size。查询失败时返回 0，不阻断下载。
 */
async function readModelScopeFileSize(
  modelId: string,
  file: string,
  revision: string
): Promise<number> {
  const files = await fetchModelScopeFileEntries(modelId, revision);
  const match = files.find((entry) => entry.Path === file);
  return typeof match?.Size === 'number' ? match.Size : 0;
}

/**
 * HTTP handler shared by the Express server and the Vite dev middleware.
 * Streams NDJSON so the pull card can show download progress, then reports
 * either `{ status: 'success', model }` or `{ status: 'error', error }`.
 */
export async function handleModelScopePullRequest(
  request: IncomingMessage,
  response: ServerResponse,
  ollamaHost: string
): Promise<void> {
  if (request.method !== 'POST') {
    response.statusCode = 405;
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ error: '仅支持 POST。' }));
    return;
  }

  const controller = new AbortController();
  response.on('close', () => {
    if (!response.writableEnded) controller.abort();
  });

  response.statusCode = 200;
  response.setHeader('content-type', 'application/x-ndjson');
  response.setHeader('cache-control', 'no-store');
  response.flushHeaders?.();

  const send = (payload: object) => {
    if (!response.writableEnded) response.write(`${JSON.stringify(payload)}\n`);
  };
  const readString = (body: Record<string, unknown>, key: string) =>
    typeof body[key] === 'string' ? (body[key] as string) : '';

  try {
    const body = await readJsonBody(request);
    const result = await pullFromModelScope({
      namespace: readString(body, 'namespace'),
      name: readString(body, 'name'),
      file: readString(body, 'file'),
      revision: readString(body, 'revision') || undefined,
      model: readString(body, 'model') || undefined,
      ollamaHost,
      signal: controller.signal,
      onProgress: ({ downloaded, total }) =>
        send({ status: 'downloading', completed: downloaded, total }),
      onStage: (stage) => send({ status: stage })
    });
    send({ status: 'success', model: result.model });
  } catch (error) {
    if (controller.signal.aborted) return;
    const message = error instanceof Error ? error.message : String(error);
    send({ status: 'error', error: message });
  } finally {
    if (!response.writableEnded) response.end();
  }
}

/** `GET /api/modelscope/search?q=<term>&page=<n>` → `{ results: [...] }` */
export async function handleModelScopeSearchRequest(
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  const url = new URL(request.url ?? '', 'http://localhost');
  const query = (url.searchParams.get('q') ?? '').trim();
  const page = Number(url.searchParams.get('page') ?? '1') || 1;

  if (!query) {
    response.statusCode = 400;
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ error: '缺少搜索关键字' }));
    return;
  }

  try {
    const results = await searchModelScope(query, page);
    response.statusCode = 200;
    response.setHeader('content-type', 'application/json');
    response.setHeader('cache-control', 'no-store');
    response.end(JSON.stringify({ results }));
  } catch (error) {
    const status = error instanceof GgufImportError ? error.status : 502;
    const message = error instanceof Error ? error.message : String(error);
    response.statusCode = status;
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ error: message }));
  }
}
