import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  mkdir,
  open,
  readdir,
  readFile,
  readlink,
  realpath,
  rename,
  rm,
  stat
} from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { GgufImportError } from './importGguf';
import { readJsonBody } from './http';
import { hasRunningDownloads } from './downloads';

/**
 * Ollama 的 blob 缓存清理。
 *
 * 只处理三类明确可回收的文件，且始终以「重新扫描」的结果为准：
 * - orphan：没有被任何 manifest 引用的完整 blob，移入模型目录内的回收站而非直接删除
 * - partial：`*-partial` 与 `*-partial-N` 下载中间文件
 * - temp：本应用在系统临时目录下的 `ollama-studio-*` 残留
 *
 * manifest 解析失败、symlink 悬空或 metadata 异常时禁止清理 orphan，
 * 避免误删仍被引用的权重。
 * 报告携带每类前 MAX_ITEMS 条明细；`POST /api/cache/reveal` 可在系统文件管理器中定位文件。
 */
const BLOB_NAME = /^sha256-([0-9a-f]{64})$/;
const PARTIAL_NAME = /^sha256-[0-9a-f]{64}-partial$/;
const CHUNK_NAME = /^sha256-[0-9a-f]{64}-partial-\d+$/;
/** 最近仍在写入的文件不动：Ollama 自己也可能在下载。 */
const RECENT_MS = 10 * 60 * 1000;
const TEMP_PREFIX = 'ollama-studio-';
/** 未引用权重不直接删除，先移到模型目录内的回收站，保留恢复机会。 */
const TRASH_DIR = '.ollama-studio-trash';
/** 同一模型目录只允许一个清理进程；陈旧锁在 30 分钟后可被接管。 */
const CLEAN_LOCK = '.ollama-studio-clean.lock';
const CLEAN_LOCK_TTL_MS = 30 * 60 * 1000;
/** 每类最多随报告返回的明细条数，避免超大目录撑爆响应。 */
const MAX_ITEMS = 500;

export type CleanupTarget = 'orphan' | 'partial' | 'temp';

export interface CacheItem {
  name: string;
  path: string;
  bytes: number;
  modifiedAt: number;
  kind: 'blob' | 'partial' | 'chunk' | 'temp';
  /** 仅 temp：目录内文件数。 */
  entries?: number;
}

export interface CacheCategory {
  files: number;
  bytes: number;
  /** 按体积从大到小排列的明细。 */
  items: CacheItem[];
  /** 超过 MAX_ITEMS、未随报告返回的文件数。 */
  hidden: number;
}

export interface CacheReport {
  modelsDir: string;
  blobs: {
    /** 被 manifest 引用的完整 blob。 */
    referenced: CacheCategory;
    orphan: CacheCategory;
    partial: CacheCategory;
    chunks: CacheCategory;
  };
  temp: {
    dirs: number;
    bytes: number;
    path: string;
    items: CacheItem[];
    hidden: number;
  };
  /** orphan + partial + temp 的字节数。 */
  reclaimableBytes: number;
  /** manifest 全部解析成功时为 true；false 时禁止清理 orphan。 */
  scanComplete: boolean;
  /** 成功解析的 manifest 文件数；为 0 且存在完整 blob 时不能清理 orphan。 */
  manifestFiles: number;
  /** 存在的 manifest 根目录数（manifests/ 与 manifests-v2/）。 */
  manifestRoots: number;
  /** 有后台下载任务时为 true，此时禁止清理 partial、orphan 与 temp。 */
  activeDownloads: boolean;
  /** 因为“最近修改”被跳过的文件数（不计入可回收）。 */
  skippedRecent: number;
  scannedAt: number;
}

export interface CleanupResult {
  /** 本次处理的总字节数；其中 quarantinedBytes 只是移入回收站，未立即释放。 */
  freedBytes: number;
  /** 移入回收站的 orphan 字节数。 */
  quarantinedBytes: number;
  /** 本次回收站目录；没有移动 orphan 时为 null。 */
  quarantinePath: string | null;
  removed: Record<CleanupTarget, number>;
  skippedRecent: number;
  errors: string[];
}

export function resolveModelsDir(): string {
  const configured = process.env.OLLAMA_MODELS?.trim();
  if (configured) return path.resolve(configured);
  return path.join(os.homedir(), '.ollama', 'models');
}

function finalizeCategory(items: CacheItem[]): CacheCategory {
  const sorted = [...items].sort((a, b) => b.bytes - a.bytes || a.modifiedAt - b.modifiedAt);
  return {
    files: sorted.length,
    bytes: sorted.reduce((sum, item) => sum + item.bytes, 0),
    items: sorted.slice(0, MAX_ITEMS),
    hidden: Math.max(0, sorted.length - MAX_ITEMS)
  };
}

interface ManifestDocument {
  config?: { digest?: string };
  layers?: Array<{ digest?: string }>;
  /** manifest list：子 manifest 仍是 blob，需要递归解析。 */
  manifests?: Array<{ digest?: string }>;
}

/** 读取 manifests/ 与 manifests-v2/ 下所有 manifest 引用的 digest。 */
async function readManifestDigests(modelsDir: string): Promise<{
  digests: Set<string>;
  complete: boolean;
  manifestFiles: number;
  manifestRoots: number;
}> {
  const blobsDir = path.join(modelsDir, 'blobs');
  let blobsReal = blobsDir;
  try {
    blobsReal = await realpath(blobsDir);
  } catch {
    // blobs 目录不存在时，下面的 manifest 解析会标记不完整。
  }

  const digests = new Set<string>();
  const seenManifestBlobs = new Set<string>();
  const seenManifestFiles = new Set<string>();
  let complete = true;
  let manifestRoots = 0;

  for (const root of ['manifests', 'manifests-v2']) {
    try {
      const info = await stat(path.join(modelsDir, root));
      if (info.isDirectory()) manifestRoots += 1;
    } catch {
      // 根目录不存在是正常形态；两个都不存在时下面会锁定 orphan 清理。
    }
  }
  if (manifestRoots === 0) complete = false;

  const addDigest = (value: unknown): string | null => {
    if (typeof value !== 'string') return null;
    const match = /^(?:sha256:)?([0-9a-f]{64})$/i.exec(value.trim());
    if (!match) return null;
    const digest = match[1].toLowerCase();
    digests.add(digest);
    return digest;
  };

  async function readManifestFile(file: string): Promise<void> {
    let real: string;
    try {
      real = await realpath(file);
    } catch {
      complete = false;
      return;
    }
    if (seenManifestFiles.has(real)) return;
    seenManifestFiles.add(real);
    try {
      const parsed = JSON.parse(await readFile(real, 'utf8')) as ManifestDocument;
      await parseManifest(parsed);
    } catch {
      // 解析失败：保留保守状态，禁止后续清理 orphan。
      complete = false;
    }
  }

  async function readManifestBlob(digest: string): Promise<void> {
    if (seenManifestBlobs.has(digest)) return;
    seenManifestBlobs.add(digest);
    // manifest 自身也是 blob。v2 的 manifest 是 symlink 指向它；
    // 只保护 config/layers 会把 manifest blob 当成 orphan 删掉。
    digests.add(digest);
    const blobPath = path.join(blobsDir, `sha256-${digest}`);
    let real: string;
    try {
      real = await realpath(blobPath);
    } catch {
      complete = false;
      return;
    }
    if (!isInside(blobsReal, real)) {
      complete = false;
      return;
    }
    await readManifestFile(real);
  }

  async function parseManifest(parsed: ManifestDocument): Promise<void> {
    let references = 0;
    if (parsed.config?.digest) {
      references += 1;
      if (!addDigest(parsed.config.digest)) complete = false;
    }
    for (const layer of parsed.layers ?? []) {
      if (!layer?.digest) {
        complete = false;
        continue;
      }
      references += 1;
      if (!addDigest(layer.digest)) complete = false;
    }
    for (const child of parsed.manifests ?? []) {
      if (!child?.digest) {
        complete = false;
        continue;
      }
      references += 1;
      const digest = addDigest(child.digest);
      if (!digest) {
        complete = false;
        continue;
      }
      await readManifestBlob(digest);
    }
    // 空 manifest 无法证明任何 blob 被引用；保守锁定，避免把模型权重当 orphan。
    if (references === 0) complete = false;
  }

  const walk = async (directory: string): Promise<void> => {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') complete = false;
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
        continue;
      }
      if (entry.isSymbolicLink()) {
        let target: string;
        try {
          target = await readlink(full);
        } catch {
          complete = false;
          continue;
        }
        const resolved = path.resolve(path.dirname(full), target);
        if (!isInside(blobsDir, resolved)) {
          complete = false;
          continue;
        }
        const match = BLOB_NAME.exec(path.basename(resolved));
        if (!match) {
          complete = false;
          continue;
        }
        await readManifestBlob(match[1]);
        continue;
      }
      if (!entry.isFile()) continue;
      await readManifestFile(full);
    }
  };

  await walk(path.join(modelsDir, 'manifests'));
  await walk(path.join(modelsDir, 'manifests-v2'));
  return { digests, complete, manifestFiles: seenManifestFiles.size, manifestRoots };
}

/**
 * Ollama 会为部分 blob 保存 GGUF 元数据。把 metadata 中的 digest 也当作保护项，
 * 作为 manifest 解析之外的第二层保险；无法解析 metadata 不影响扫描结论。
 */
async function readMetadataDigests(modelsDir: string): Promise<Set<string>> {
  const digests = new Set<string>();
  let entries;
  try {
    entries = await readdir(path.join(modelsDir, 'metadata'), { withFileTypes: true });
  } catch {
    return digests;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) continue;
    const match = /^sha256-([0-9a-f]{64})\.json$/i.exec(entry.name);
    if (match) digests.add(match[1].toLowerCase());
  }
  return digests;
}

async function collectProtectedDigests(modelsDir: string): Promise<{
  digests: Set<string>;
  complete: boolean;
  manifestFiles: number;
  manifestRoots: number;
}> {
  const manifest = await readManifestDigests(modelsDir);
  const metadata = await readMetadataDigests(modelsDir);
  for (const digest of metadata) manifest.digests.add(digest);
  return manifest;
}

interface ScannedBlob {
  name: string;
  bytes: number;
  modifiedAt: number;
  kind: 'blob' | 'partial' | 'chunk';
}

async function scanBlobs(modelsDir: string): Promise<ScannedBlob[]> {
  const directory = path.join(modelsDir, 'blobs');
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return [];
  }

  const scanned: ScannedBlob[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const kind = BLOB_NAME.test(entry.name)
      ? 'blob'
      : PARTIAL_NAME.test(entry.name)
        ? 'partial'
        : CHUNK_NAME.test(entry.name)
          ? 'chunk'
          : null;
    if (!kind) continue;
    try {
      const info = await stat(path.join(directory, entry.name));
      scanned.push({ name: entry.name, bytes: info.size, modifiedAt: info.mtimeMs, kind });
    } catch {
      // 扫描期间被删除的文件直接忽略
    }
  }
  return scanned;
}

interface TempEntry {
  name: string;
  path: string;
  bytes: number;
  modifiedAt: number;
  entries: number;
}

async function scanTempDirs(): Promise<{ entries: TempEntry[]; skippedRecent: number }> {
  const root = os.tmpdir();
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return { entries: [], skippedRecent: 0 };
  }

  const entriesFound: TempEntry[] = [];
  let skippedRecent = 0;
  const now = Date.now();

  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith(TEMP_PREFIX)) continue;
    const full = path.join(root, entry.name);
    try {
      const info = await stat(full);
      let size = 0;
      let files = 0;
      let newest = info.mtimeMs;
      const walk = async (directory: string): Promise<void> => {
        for (const child of await readdir(directory, { withFileTypes: true })) {
          const childPath = path.join(directory, child.name);
          if (child.isDirectory()) await walk(childPath);
          else if (child.isFile()) {
            const childInfo = await stat(childPath);
            size += childInfo.size;
            files += 1;
            if (childInfo.mtimeMs > newest) newest = childInfo.mtimeMs;
          }
        }
      };
      await walk(full);
      // 目录 mtime 只在增删文件时更新；正在写入的子文件 mtime 才是活动信号。
      if (now - newest < RECENT_MS) {
        skippedRecent += 1;
        continue;
      }
      entriesFound.push({
        name: entry.name,
        path: full,
        bytes: size,
        modifiedAt: newest,
        entries: files
      });
    } catch {
      // 权限或竞态问题：跳过
    }
  }

  return { entries: entriesFound, skippedRecent };
}

export async function scanCache(): Promise<CacheReport> {
  const modelsDir = resolveModelsDir();
  const [{ digests, complete, manifestFiles, manifestRoots }, blobs, temp] = await Promise.all([
    collectProtectedDigests(modelsDir),
    scanBlobs(modelsDir),
    scanTempDirs()
  ]);

  // 有完整 blob 却一个 manifest 都没解析成功时，无法证明任何 blob 被引用。
  const hasCompleteBlobs = blobs.some((blob) => blob.kind === 'blob');
  const scanComplete = complete && (!hasCompleteBlobs || manifestFiles > 0);

  const now = Date.now();
  const referencedItems: CacheItem[] = [];
  const orphanItems: CacheItem[] = [];
  const partialItems: CacheItem[] = [];
  const chunkItems: CacheItem[] = [];
  let skippedRecent = temp.skippedRecent;

  for (const blob of blobs) {
    const item: CacheItem = {
      name: blob.name,
      path: path.join(modelsDir, 'blobs', blob.name),
      bytes: blob.bytes,
      modifiedAt: blob.modifiedAt,
      kind: blob.kind
    };

    if (blob.kind === 'blob') {
      const digest = blob.name.slice('sha256-'.length);
      if (digests.has(digest)) {
        referencedItems.push(item);
        continue;
      }
      // 刚写入的完整 blob 可能是正在进行的下载或刚完成的模型。
      if (now - blob.modifiedAt < RECENT_MS) {
        skippedRecent += 1;
        continue;
      }
      orphanItems.push(item);
      continue;
    }

    if (now - blob.modifiedAt < RECENT_MS) {
      skippedRecent += 1;
      continue;
    }
    (blob.kind === 'chunk' ? chunkItems : partialItems).push(item);
  }

  const referenced = finalizeCategory(referencedItems);
  const orphan = finalizeCategory(orphanItems);
  const partial = finalizeCategory(partialItems);
  const chunks = finalizeCategory(chunkItems);
  const tempItems = temp.entries
    .slice()
    .sort((a, b) => b.bytes - a.bytes || a.modifiedAt - b.modifiedAt);
  const tempBytes = temp.entries.reduce((sum, entry) => sum + entry.bytes, 0);

  return {
    modelsDir,
    blobs: { referenced, orphan, partial, chunks },
    temp: {
      dirs: temp.entries.length,
      bytes: tempBytes,
      path: os.tmpdir(),
      items: tempItems.slice(0, MAX_ITEMS).map((entry) => ({
        name: entry.name,
        path: entry.path,
        bytes: entry.bytes,
        modifiedAt: entry.modifiedAt,
        kind: 'temp' as const,
        entries: entry.entries
      })),
      hidden: Math.max(0, tempItems.length - MAX_ITEMS)
    },
    reclaimableBytes: orphan.bytes + partial.bytes + chunks.bytes + tempBytes,
    scanComplete,
    manifestFiles,
    manifestRoots,
    activeDownloads: hasRunningDownloads(),
    skippedRecent,
    scannedAt: now
  };
}

function parseTargets(value: unknown): CleanupTarget[] {
  if (!Array.isArray(value)) throw new GgufImportError('缺少清理目标。', 400);
  const allowed: CleanupTarget[] = ['orphan', 'partial', 'temp'];
  const targets = value.filter((item): item is CleanupTarget =>
    allowed.includes(item as CleanupTarget)
  );
  if (targets.length === 0) throw new GgufImportError('没有可清理的目标。', 400);
  return Array.from(new Set(targets));
}

function createQuarantineDir(modelsDir: string): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const directory = path.join(modelsDir, TRASH_DIR, `${timestamp}-${randomUUID().slice(0, 8)}`);
  return mkdir(directory, { recursive: true }).then(() => directory);
}

/** 同一模型目录只允许一个清理进程，避免两个实例同时移动/删除。 */
async function acquireCleanLock(modelsDir: string, retried = false): Promise<() => Promise<void>> {
  const lockPath = path.join(modelsDir, CLEAN_LOCK);
  try {
    const handle = await open(lockPath, 'wx');
    await handle.writeFile(JSON.stringify({ pid: process.pid, at: Date.now() }));
    await handle.close();
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      // 模型目录不存在：没有可清理内容，不需要锁。
      return async () => {};
    }
    if (code !== 'EEXIST') throw error;
    const info = await stat(lockPath).catch(() => null);
    if (info && Date.now() - info.mtimeMs < CLEAN_LOCK_TTL_MS) {
      throw new GgufImportError('另一个缓存清理任务正在进行，请稍后重试。', 409);
    }
    if (retried) {
      throw new GgufImportError('无法获取缓存清理锁，请稍后重试。', 409);
    }
    await rm(lockPath, { force: true });
    return acquireCleanLock(modelsDir, true);
  }

  return async () => {
    await rm(lockPath, { force: true });
  };
}

export async function cleanCache(rawTargets: unknown): Promise<CleanupResult> {
  const targets = parseTargets(rawTargets);
  const modelsDir = resolveModelsDir();
  const release = await acquireCleanLock(modelsDir);
  try {
    return await cleanCacheLocked(targets, modelsDir);
  } finally {
    await release();
  }
}

async function cleanCacheLocked(
  targets: CleanupTarget[],
  modelsDir: string
): Promise<CleanupResult> {
  const report = await scanCache();
  const result: CleanupResult = {
    freedBytes: 0,
    quarantinedBytes: 0,
    quarantinePath: null,
    removed: { orphan: 0, partial: 0, temp: 0 },
    skippedRecent: 0,
    errors: []
  };

  if (targets.includes('orphan')) {
    if (!report.scanComplete) {
      throw new GgufImportError('manifest 缺失、为空或解析失败，已禁止清理未引用文件。', 409);
    }
    if (report.activeDownloads || hasRunningDownloads()) {
      throw new GgufImportError('仍有下载任务在进行，暂不清理未引用权重。', 409);
    }

    // 重新计算一次引用关系，扫描与移动之间可能有新模型创建
    const verified = await collectProtectedDigests(modelsDir);
    if (!verified.complete) {
      throw new GgufImportError('manifest 解析失败，已禁止清理未引用文件。', 409);
    }
    const blobs = await scanBlobs(modelsDir);
    const hasCompleteBlobs = blobs.some((blob) => blob.kind === 'blob');
    if (hasCompleteBlobs && verified.manifestFiles === 0) {
      throw new GgufImportError('没有解析到任何 manifest，已禁止清理未引用文件。', 409);
    }

    const now = Date.now();
    const orphanBlobs: ScannedBlob[] = [];
    for (const blob of blobs) {
      if (blob.kind !== 'blob') continue;
      if (verified.digests.has(blob.name.slice('sha256-'.length))) continue;
      if (now - blob.modifiedAt < RECENT_MS) {
        result.skippedRecent += 1;
        continue;
      }
      orphanBlobs.push(blob);
    }

    if (orphanBlobs.length > 0) {
      let quarantineDir: string;
      try {
        quarantineDir = await createQuarantineDir(modelsDir);
        result.quarantinePath = quarantineDir;
      } catch (error) {
        result.errors.push(
          `回收站创建失败: ${error instanceof Error ? error.message : String(error)}`
        );
        quarantineDir = '';
      }

      if (quarantineDir) {
        for (const blob of orphanBlobs) {
          // 移动大文件可能持续一段时间；期间出现新下载就立即停止。
          if (hasRunningDownloads()) {
            result.errors.push('检测到新的下载任务，已停止继续移动未引用权重。');
            break;
          }
          try {
            // 同盘 rename：不复制大文件，也保留文件内容与时间戳。
            await rename(
              path.join(modelsDir, 'blobs', blob.name),
              path.join(quarantineDir, blob.name)
            );
            result.removed.orphan += 1;
            result.freedBytes += blob.bytes;
            result.quarantinedBytes += blob.bytes;
          } catch (error) {
            result.errors.push(
              `${blob.name}: ${error instanceof Error ? error.message : String(error)}`
            );
          }
        }
      }
    }
  }

  if (targets.includes('partial')) {
    // 再查一次：扫描 orphan 期间可能刚启动新的下载任务。
    if (report.activeDownloads || hasRunningDownloads()) {
      throw new GgufImportError('仍有下载任务在进行，暂不清理未完成的文件。', 409);
    }
    const now = Date.now();
    const blobs = await scanBlobs(modelsDir);
    for (const blob of blobs) {
      if (blob.kind === 'blob') continue;
      if (now - blob.modifiedAt < RECENT_MS) {
        result.skippedRecent += 1;
        continue;
      }
      try {
        await rm(path.join(modelsDir, 'blobs', blob.name), { force: true });
        result.removed.partial += 1;
        result.freedBytes += blob.bytes;
      } catch (error) {
        result.errors.push(
          `${blob.name}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  }

  if (targets.includes('temp')) {
    if (report.activeDownloads || hasRunningDownloads()) {
      throw new GgufImportError('仍有下载任务在进行，暂不清理临时目录。', 409);
    }
    const temp = await scanTempDirs();
    for (const entry of temp.entries) {
      if (hasRunningDownloads()) {
        result.errors.push('检测到新的下载任务，已停止继续清理临时目录。');
        break;
      }
      try {
        await rm(entry.path, { recursive: true, force: true });
        result.removed.temp += 1;
        result.freedBytes += entry.bytes;
      } catch (error) {
        result.errors.push(
          `${path.basename(entry.path)}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
    result.skippedRecent += temp.skippedRecent;
  }

  return result;
}

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

/**
 * 校验“在文件夹中显示”的目标：只允许 Ollama 模型目录内的路径，
 * 或系统临时目录下的 `ollama-studio-*` 残留。返回真实存在的路径。
 */
export async function resolveRevealTarget(
  raw: unknown
): Promise<{ path: string; directory: boolean }> {
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new GgufImportError('缺少路径。', 400);
  }

  const requested = path.resolve(raw.trim());
  let info;
  try {
    info = await stat(requested);
  } catch {
    throw new GgufImportError('文件不存在或已被删除。', 404);
  }

  let real = requested;
  try {
    real = await realpath(requested);
  } catch {
    // 无法解析真实路径时按字面路径校验。
  }

  const modelsDir = resolveModelsDir();
  let modelsReal = modelsDir;
  try {
    modelsReal = await realpath(modelsDir);
  } catch {
    // 目录不存在时保持字面路径。
  }

  const tempRoot = os.tmpdir();
  let tempReal = tempRoot;
  try {
    tempReal = await realpath(tempRoot);
  } catch {
    // 保持字面路径。
  }

  const inModels = isInside(modelsReal, real);
  const inTemp = isInside(tempReal, real) && path.basename(requested).startsWith(TEMP_PREFIX);
  if (!inModels && !inTemp) {
    throw new GgufImportError('不允许打开该路径。', 403);
  }

  return { path: requested, directory: info.isDirectory() };
}

function openInFileManager(target: string, directory: boolean): Promise<void> {
  const platform = process.platform;
  const [command, args] =
    platform === 'darwin'
      ? ['open', directory ? [target] : ['-R', target]]
      : platform === 'win32'
        ? ['explorer', directory ? [target] : [`/select,${target}`]]
        : ['xdg-open', [directory ? target : path.dirname(target)]];

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'ignore', detached: true });
    child.once('error', (error) => {
      reject(new GgufImportError(`无法打开文件夹：${error.message}`, 501));
    });
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
}

export async function revealCachePath(raw: unknown): Promise<void> {
  const target = await resolveRevealTarget(raw);
  await openInFileManager(target.path, target.directory);
}

function sendJson(response: ServerResponse, status: number, payload: unknown) {
  response.statusCode = status;
  response.setHeader('content-type', 'application/json');
  response.setHeader('cache-control', 'no-store');
  response.end(JSON.stringify(payload));
}

/**
 * `GET /api/cache` 返回扫描结果（含明细），`POST /api/cache/cleanup` 执行清理，
 * `POST /api/cache/reveal` 在系统文件管理器中定位文件。
 * 挂载在 `/api/cache`，Express 与 Vite 都会剥掉前缀。
 */
export async function handleCacheRequest(
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  const pathname = new URL(request.url ?? '/', 'http://localhost').pathname.replace(/^\/+/, '');

  try {
    if (request.method === 'GET' && !pathname) {
      sendJson(response, 200, await scanCache());
      return;
    }

    if (request.method === 'POST' && pathname === 'cleanup') {
      const body = await readJsonBody(request);
      sendJson(response, 200, { ...(await cleanCache(body.targets)), report: await scanCache() });
      return;
    }

    if (request.method === 'POST' && pathname === 'reveal') {
      const body = await readJsonBody(request);
      await revealCachePath(body.path);
      sendJson(response, 200, { ok: true });
      return;
    }

    sendJson(response, 405, { error: '不支持的方法。' });
  } catch (error) {
    const status = error instanceof GgufImportError ? error.status : 500;
    const message = error instanceof Error ? error.message : String(error);
    sendJson(response, status, { error: message });
  }
}
