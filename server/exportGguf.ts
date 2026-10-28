import { constants as fsConstants } from 'node:fs';
import { copyFile, mkdir, readFile, realpath, rm, stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { resolveModelsDir } from './cache';
import { readJsonBody } from './http';
import { GgufImportError } from './importGguf';

/**
 * 把已安装模型的 Ollama blob 导出为 GGUF 文件。
 *
 * Ollama 没有导出 API，但 manifest 的 `application/vnd.ollama.image.model`
 * 层本身就是 GGUF；多模态模型另有 `projector` 层，单独导出为 `*-mmproj.gguf`。
 * 只复制权重，不复制 template/license/params，这些内容不属于 GGUF。
 *
 * 目标目录默认是 `~/Downloads/Ollama Studio`；调用方也可以传入一个已存在、
 * 且位于用户主目录、系统临时目录或可移动磁盘挂载点内的目录。复制优先使用
 * APFS 的 copy-on-write clone（`COPYFILE_FICLONE`），不支持时自动回退为完整复制。
 */
const MODEL_MEDIA_TYPES = new Set([
  'application/vnd.ollama.image.model',
  'application/vnd.ollama.image.gguf'
]);
const PROJECTOR_MEDIA_TYPES = new Set([
  'application/vnd.ollama.image.projector',
  'application/vnd.ollama.image.mmproj'
]);
const SAFE_SEGMENT = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
const SAFE_REGISTRY = /^[a-zA-Z0-9][a-zA-Z0-9.:-]*$/;
const DEFAULT_FOLDER = 'Ollama Studio';

export interface ParsedModelReference {
  registry: string;
  namespace: string;
  model: string;
  tag: string;
}

export interface ExportFile {
  kind: 'model' | 'projector';
  name: string;
  path: string;
  bytes: number;
}

export interface ExportResult {
  model: string;
  directory: string;
  files: ExportFile[];
  totalBytes: number;
}

interface ManifestLayer {
  mediaType?: unknown;
  digest?: unknown;
  size?: unknown;
}

interface ResolvedLayer {
  kind: 'model' | 'projector';
  sourcePath: string;
  bytes: number;
}

/**
 * 解析 `namespace/model:tag`、`hf.co/namespace/model:tag` 等引用。
 * 没有 tag 时按 Ollama 约定使用 `latest`。
 */
export function parseModelReference(raw: string): ParsedModelReference {
  const trimmed = raw.trim();
  if (!trimmed) throw new GgufImportError('缺少模型名。', 400);

  const lastSlash = trimmed.lastIndexOf('/');
  const lastColon = trimmed.lastIndexOf(':');
  const hasTag = lastColon > lastSlash;
  const name = hasTag ? trimmed.slice(0, lastColon) : trimmed;
  const tag = hasTag ? trimmed.slice(lastColon + 1) : 'latest';
  if (!tag || !SAFE_SEGMENT.test(tag)) {
    throw new GgufImportError('模型 tag 含非法字符。', 400);
  }

  const parts = name.split('/').filter(Boolean);
  if (parts.length === 0) throw new GgufImportError('模型名不能为空。', 400);

  let registry = 'registry.ollama.ai';
  let rest = parts;
  if (parts.length >= 2 && /[.:]/.test(parts[0])) {
    registry = parts[0];
    rest = parts.slice(1);
  }
  if (!SAFE_REGISTRY.test(registry)) {
    throw new GgufImportError('模型 registry 含非法字符。', 400);
  }

  const model = rest[rest.length - 1];
  const namespace = rest.length > 1 ? rest.slice(0, -1).join('/') : 'library';
  for (const segment of [...namespace.split('/'), model]) {
    if (!SAFE_SEGMENT.test(segment)) {
      throw new GgufImportError('模型名含非法字符。', 400);
    }
  }

  return { registry, namespace, model, tag };
}

/** 默认导出目录；真正写入前会通过 `resolveExportDirectory` 校验。 */
export function defaultExportDirectory(): string {
  return path.join(os.homedir(), 'Downloads', DEFAULT_FOLDER);
}

async function allowedExportRoots(): Promise<string[]> {
  const candidates = [os.homedir(), os.tmpdir(), '/tmp', '/Volumes', '/media', '/mnt'];
  const roots: string[] = [];
  for (const candidate of candidates) {
    try {
      roots.push(await realpath(candidate));
    } catch {
      // 平台不存在该挂载点时跳过。
    }
  }
  return roots;
}

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

/**
 * 校验并返回真实导出目录。默认目录会自动创建；显式目录必须已存在，
 * 且不能位于用户主目录、临时目录或常见可移动磁盘挂载点之外。
 */
export async function resolveExportDirectory(raw?: string): Promise<string> {
  const requested = raw?.trim();
  if (requested) {
    let resolved: string;
    try {
      resolved = await realpath(path.resolve(requested));
    } catch {
      throw new GgufImportError('导出目录不存在。', 400);
    }
    const info = await stat(resolved);
    if (!info.isDirectory()) throw new GgufImportError('导出路径不是目录。', 400);
    const roots = await allowedExportRoots();
    if (!roots.some((root) => isInside(root, resolved))) {
      throw new GgufImportError('导出目录不在允许的范围内。', 403);
    }
    return resolved;
  }

  const target = defaultExportDirectory();
  try {
    await mkdir(target, { recursive: true });
    return await realpath(target);
  } catch {
    throw new GgufImportError('无法创建默认导出目录。', 500);
  }
}

async function findManifest(modelsDir: string, reference: ParsedModelReference): Promise<string> {
  // 新版 Ollama 把默认 registry 的 manifest 写到 manifests-v2/ollama.com，
  // 而 /api/tags 仍返回不带 registry 的短名称；两种布局都要查。
  const registries =
    reference.registry === 'registry.ollama.ai'
      ? ['registry.ollama.ai', 'ollama.com']
      : [reference.registry];
  for (const root of ['manifests', 'manifests-v2']) {
    for (const registry of registries) {
      const candidate = path.join(
        modelsDir,
        root,
        registry,
        ...reference.namespace.split('/'),
        reference.model,
        reference.tag
      );
      try {
        if ((await stat(candidate)).isFile()) return candidate;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
  }
  throw new GgufImportError(
    `找不到 ${reference.namespace}/${reference.model}:${reference.tag} 的 manifest。`,
    404
  );
}

function blobPath(modelsDir: string, digest: unknown): string {
  if (typeof digest !== 'string') {
    throw new GgufImportError('manifest 中的 layer digest 缺失。', 422);
  }
  const match = /^sha256:([0-9a-f]{64})$/i.exec(digest);
  if (!match) throw new GgufImportError('manifest 中的 layer digest 无效。', 422);
  return path.join(modelsDir, 'blobs', `sha256-${match[1].toLowerCase()}`);
}

async function resolveLayers(modelsDir: string, manifestPath: string): Promise<ResolvedLayer[]> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch {
    throw new GgufImportError('manifest 不是合法 JSON。', 422);
  }
  const layers =
    typeof parsed === 'object' && parsed !== null
      ? (parsed as { layers?: unknown }).layers
      : undefined;
  if (!Array.isArray(layers)) throw new GgufImportError('manifest 缺少 layers。', 422);

  const resolved: ResolvedLayer[] = [];
  const seen = new Set<string>();
  for (const layer of layers as ManifestLayer[]) {
    const mediaType = typeof layer.mediaType === 'string' ? layer.mediaType : '';
    const kind = MODEL_MEDIA_TYPES.has(mediaType)
      ? 'model'
      : PROJECTOR_MEDIA_TYPES.has(mediaType)
        ? 'projector'
        : null;
    if (!kind) continue;

    const sourcePath = blobPath(modelsDir, layer.digest);
    if (seen.has(sourcePath)) continue;
    seen.add(sourcePath);

    let info;
    try {
      info = await stat(sourcePath);
    } catch {
      throw new GgufImportError('模型权重文件缺失，请重新拉取模型。', 500);
    }
    if (!info.isFile() || info.size <= 0) {
      throw new GgufImportError('模型权重文件为空或不可读。', 500);
    }
    resolved.push({ kind, sourcePath, bytes: info.size });
  }

  if (!resolved.some((layer) => layer.kind === 'model')) {
    throw new GgufImportError('manifest 中没有可导出的模型权重层。', 422);
  }
  return resolved;
}

function safeBaseName(reference: ParsedModelReference): string {
  const raw = `${reference.namespace}-${reference.model}-${reference.tag}`;
  const sanitized = raw
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '')
    .slice(0, 180);
  return sanitized || 'model';
}

async function uniqueTarget(directory: string, stem: string): Promise<string> {
  for (let index = 1; index <= 999; index += 1) {
    const name = index === 1 ? `${stem}.gguf` : `${stem}-${index}.gguf`;
    const candidate = path.join(directory, name);
    try {
      await stat(candidate);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return candidate;
      throw error;
    }
  }
  throw new GgufImportError('同名导出文件过多，请清理目标目录后重试。', 409);
}

function mapCopyError(error: unknown): GgufImportError {
  if (error instanceof GgufImportError) return error;
  const code = (error as NodeJS.ErrnoException).code;
  if (code === 'ENOSPC') return new GgufImportError('目标磁盘空间不足。', 507);
  if (code === 'EACCES' || code === 'EPERM') {
    return new GgufImportError('读取源文件或写入目标目录的权限不足。', 403);
  }
  const message = error instanceof Error ? error.message : String(error);
  return new GgufImportError(`导出失败：${message}`, 500);
}

/**
 * 导出指定模型。返回实际写入的文件；重名时自动追加 `-2`、`-3`。
 * 任一层复制失败会删除本次已创建的文件，避免留下半份导出。
 */
export async function exportModelGguf(model: string, directory?: string): Promise<ExportResult> {
  const modelsDir = resolveModelsDir();
  const reference = parseModelReference(model);
  const manifestPath = await findManifest(modelsDir, reference);
  const layers = await resolveLayers(modelsDir, manifestPath);
  const targetDirectory = await resolveExportDirectory(directory);
  const base = safeBaseName(reference);

  const modelLayers = layers.filter((layer) => layer.kind === 'model');
  const projectorLayers = layers.filter((layer) => layer.kind === 'projector');
  const planned = [
    ...modelLayers.map((layer, index) => ({
      layer,
      stem: `${base}${modelLayers.length > 1 ? `-part${index + 1}` : ''}`
    })),
    ...projectorLayers.map((layer, index) => ({
      layer,
      stem: `${base}-mmproj${projectorLayers.length > 1 ? `-${index + 1}` : ''}`
    }))
  ];

  const created: string[] = [];
  const files: ExportFile[] = [];
  try {
    for (const item of planned) {
      const target = await uniqueTarget(targetDirectory, item.stem);
      created.push(target);
      await copyFile(item.layer.sourcePath, target, fsConstants.COPYFILE_FICLONE);
      const copied = await stat(target);
      if (copied.size !== item.layer.bytes) {
        throw new GgufImportError('导出的文件大小与源文件不一致。', 500);
      }
      files.push({
        kind: item.layer.kind,
        name: path.basename(target),
        path: target,
        bytes: copied.size
      });
    }
  } catch (error) {
    await Promise.all(created.map((file) => rm(file, { force: true }).catch(() => undefined)));
    throw mapCopyError(error);
  }

  return {
    model: model.trim(),
    directory: targetDirectory,
    files,
    totalBytes: files.reduce((sum, file) => sum + file.bytes, 0)
  };
}

function writeJson(response: ServerResponse, status: number, payload: unknown): void {
  response.statusCode = status;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(payload));
}

/** `POST /api/export`，请求体 `{ model, directory? }`。 */
export async function handleExportRequest(
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  if (request.method !== 'POST') {
    writeJson(response, 405, { error: '仅支持 POST。' });
    return;
  }

  try {
    const body = await readJsonBody(request);
    const model = typeof body.model === 'string' ? body.model.trim() : '';
    if (!model) throw new GgufImportError('缺少模型名。', 400);
    const directory = typeof body.directory === 'string' ? body.directory : undefined;
    writeJson(response, 200, await exportModelGguf(model, directory));
  } catch (error) {
    const status = error instanceof GgufImportError ? error.status : 500;
    writeJson(response, status, {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}
