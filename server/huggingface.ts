import { createWriteStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createModelFromGguf, GgufImportError, normalizeGgufModelName } from './importGguf';

const MAX_GGUF_BYTES = 20 * 1024 * 1024 * 1024;
const SAFE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const SAFE_REVISION_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const SPLIT_GGUF = /-\d{5}-of-\d{5}\.gguf$/i;
const PROJECTOR_GGUF = /(?:^|[/_.-])(?:mmproj|projector)(?:[/_.-]|$)/i;

export interface HuggingFaceFile {
  path: string;
  size: number;
  sha256?: string;
}

export interface HuggingFacePullOptions {
  repo: string;
  file?: string;
  quant?: string;
  revision?: string;
  model?: string;
  ollamaHost: string;
  signal?: AbortSignal;
  onResolve?: (file: HuggingFaceFile) => void;
  onProgress?: (progress: { downloaded: number; total: number }) => void;
  onStage?: (stage: 'resolving' | 'downloading' | 'creating') => void;
}

export interface HuggingFacePullResult {
  model: string;
  file: string;
  size: number;
}

interface HuggingFaceSibling {
  rfilename?: string;
  size?: number;
  lfs?: {
    sha256?: string;
    size?: number;
  };
}

interface HuggingFaceRepoPayload {
  siblings?: HuggingFaceSibling[];
}

function assertSegment(value: string, label: string): string {
  const trimmed = value.trim();
  if (!SAFE_SEGMENT.test(trimmed)) {
    throw new GgufImportError(`${label} 含非法字符。`, 400);
  }
  return trimmed;
}

/** HF 仓库固定为 owner/name；逐段校验，挡掉路径穿越。 */
export function normalizeHuggingFaceRepo(repo: string): { owner: string; name: string } {
  const parts = repo.trim().split('/');
  if (parts.length !== 2) {
    throw new GgufImportError('Hugging Face 仓库格式应为 owner/name。', 400);
  }
  return {
    owner: assertSegment(parts[0], '仓库 owner'),
    name: assertSegment(parts[1], '仓库名')
  };
}

export function validateHuggingFaceFile(file: string): string {
  const trimmed = file.trim().replace(/^\/+/, '');
  if (!/\.gguf$/i.test(trimmed) || trimmed.includes('\\') || trimmed.includes('\0')) {
    throw new GgufImportError('文件路径必须是 .gguf 文件。', 400);
  }
  const segments = trimmed.split('/');
  if (
    segments.length === 0 ||
    segments.some((segment) => !segment || segment === '.' || segment === '..')
  ) {
    throw new GgufImportError('文件路径非法。', 400);
  }
  return segments.join('/');
}

export function validateHuggingFaceRevision(revision: string): string {
  const trimmed = revision.trim();
  if (!trimmed) return 'main';
  const segments = trimmed.split('/');
  if (
    segments.length === 0 ||
    segments.some(
      (segment) =>
        !segment || segment === '.' || segment === '..' || !SAFE_REVISION_SEGMENT.test(segment)
    )
  ) {
    throw new GgufImportError('revision 含非法字符。', 400);
  }
  return segments.join('/');
}

/**
 * HF 的 resolve 链接会先返回 302，再由 Node 跟随到 CDN。
 * 这里只构造公开下载地址，不负责网络请求。
 */
export function buildHuggingFaceFileUrl(options: {
  repo: string;
  file: string;
  revision?: string;
}): string {
  const { owner, name } = normalizeHuggingFaceRepo(options.repo);
  const revision = validateHuggingFaceRevision(options.revision || 'main');
  const file = validateHuggingFaceFile(options.file);
  const encodedRevision = revision
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  const encodedFile = file
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return `https://huggingface.co/${encodeURIComponent(owner)}/${encodeURIComponent(
    name
  )}/resolve/${encodedRevision}/${encodedFile}?download=true`;
}

function isDownloadableGguf(file: string): boolean {
  return /\.gguf$/i.test(file) && !SPLIT_GGUF.test(file) && !PROJECTOR_GGUF.test(file);
}

/** 把量化标签映射到仓库里的具体文件，避免把 mmproj 当成模型权重。 */
export function findHuggingFaceFile(files: string[], quant: string): string | undefined {
  if (!files.length || !quant) return undefined;
  const escaped = quant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(?:^|[-_.])${escaped}\\.gguf$`, 'i');
  return files.find((file) => isDownloadableGguf(file) && pattern.test(file));
}

/**
 * 读取 HF 仓库文件列表。搜索页已经带了 siblings，但直接输入
 * `hf.co/<repo>:<quant>` 时服务端仍需自行解析文件路径。
 */
export async function listHuggingFaceFiles(
  repo: string,
  revision = 'main',
  signal?: AbortSignal
): Promise<HuggingFaceFile[]> {
  const { owner, name } = normalizeHuggingFaceRepo(repo);
  const revisionValue = validateHuggingFaceRevision(revision);
  const url = `https://huggingface.co/api/models/${encodeURIComponent(
    owner
  )}/${encodeURIComponent(name)}?blobs=true&revision=${encodeURIComponent(revisionValue)}`;

  let response: Response;
  try {
    response = await fetch(url, {
      signal,
      headers: { accept: 'application/json', 'user-agent': 'ollama-studio' }
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new GgufImportError(`无法连接 Hugging Face：${message}`, 502);
  }

  if (!response.ok) {
    throw new GgufImportError(`读取 Hugging Face 文件列表失败（HTTP ${response.status}）。`, 502);
  }

  const payload = (await response.json()) as HuggingFaceRepoPayload;
  const siblings = Array.isArray(payload.siblings) ? payload.siblings : [];
  return siblings
    .filter((sibling) => typeof sibling.rfilename === 'string' && sibling.rfilename)
    .map((sibling) => ({
      path: sibling.rfilename as string,
      size:
        typeof sibling.size === 'number'
          ? sibling.size
          : typeof sibling.lfs?.size === 'number'
            ? sibling.lfs.size
            : 0,
      sha256: sibling.lfs?.sha256
    }));
}

export async function resolveHuggingFaceFile(
  repo: string,
  quant: string,
  revision = 'main',
  signal?: AbortSignal
): Promise<HuggingFaceFile> {
  const files = await listHuggingFaceFiles(repo, revision, signal);
  const downloadable = files.filter((file) => isDownloadableGguf(file.path));
  if (downloadable.length === 0) {
    throw new GgufImportError('仓库中没有可下载的 GGUF 文件（已排除分片与 mmproj）。', 404);
  }

  const matchedPath = quant
    ? findHuggingFaceFile(
        downloadable.map((file) => file.path),
        quant
      )
    : undefined;
  const match = matchedPath
    ? downloadable.find((file) => file.path === matchedPath)
    : !quant && downloadable.length === 1
      ? downloadable[0]
      : undefined;

  if (!match) {
    throw new GgufImportError(
      quant
        ? `未找到量化 ${quant} 对应的 GGUF 文件，请重新选择量化。`
        : '仓库包含多个 GGUF 文件，请指定量化标签或文件名。',
      400
    );
  }
  return match;
}

/**
 * 服务端直接下载 HF 的 GGUF，再交给 `ollama create` 注册。
 * 这样不依赖 Ollama 自带的 hf.co pull，也不会被其“重定向目标必须是公网地址”限制拦住。
 */
export async function pullFromHuggingFace(
  options: HuggingFacePullOptions
): Promise<HuggingFacePullResult> {
  const file = options.file?.trim() ? validateHuggingFaceFile(options.file) : '';
  const revision = validateHuggingFaceRevision(options.revision || 'main');

  options.onStage?.('resolving');
  let resolved: HuggingFaceFile;
  if (file) {
    resolved = { path: file, size: 0 };
  } else {
    resolved = await resolveHuggingFaceFile(
      options.repo,
      options.quant || '',
      revision,
      options.signal
    );
  }
  options.onResolve?.(resolved);
  options.onStage?.('downloading');

  const url = buildHuggingFaceFileUrl({ repo: options.repo, file: resolved.path, revision });

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
    throw new GgufImportError(`无法连接 Hugging Face：${message}`, 502);
  }

  if (!response.ok || !response.body) {
    throw new GgufImportError(`Hugging Face 返回 HTTP ${response.status}。`, 502);
  }

  const contentLength = Number(response.headers.get('content-length') || 0);
  const total = contentLength || resolved.size;
  if (total > MAX_GGUF_BYTES) {
    throw new GgufImportError('GGUF 文件超过 20 GB 限制。', 413);
  }

  const directory = await mkdtemp(path.join(tmpdir(), 'ollama-studio-hf-'));
  const filePath = path.join(directory, 'download.gguf');
  let downloaded = 0;
  let lastReportedAt = 0;

  const meter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      downloaded += chunk.length;
      if (downloaded > MAX_GGUF_BYTES) {
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
      throw new GgufImportError('Hugging Face 返回的文件为空。', 502);
    }
    options.onProgress?.({ downloaded, total: total || downloaded });
    options.onStage?.('creating');

    const fallbackName = `${options.repo}${options.quant ? `:${options.quant}` : ''}`;
    const model = normalizeGgufModelName(
      options.model?.trim() || fallbackName,
      path.basename(resolved.path)
    );
    await createModelFromGguf(filePath, model, options.ollamaHost);
    return { model, file: resolved.path, size: downloaded };
  } finally {
    await rm(directory, { recursive: true, force: true }).catch(() => undefined);
  }
}
