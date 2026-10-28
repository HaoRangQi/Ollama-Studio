import { mkdtemp, mkdir, rm, utimes, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanCache, resolveRevealTarget, scanCache } from './cache';

const MANIFEST = {
  schemaVersion: 2,
  config: { digest: 'sha256:' + 'a'.repeat(64) },
  layers: [{ digest: 'sha256:' + 'b'.repeat(64) }]
};

let modelsDir = '';
const extraTempDirs: string[] = [];

async function writeBlob(name: string, bytes: number, ageMs = 0) {
  const file = path.join(modelsDir, 'blobs', name);
  await writeFile(file, Buffer.alloc(bytes));
  if (ageMs > 0) {
    const when = new Date(Date.now() - ageMs);
    await utimes(file, when, when);
  }
}

beforeEach(async () => {
  modelsDir = await mkdtemp(path.join(os.tmpdir(), 'ollama-cache-test-'));
  await mkdir(path.join(modelsDir, 'blobs'), { recursive: true });
  await mkdir(path.join(modelsDir, 'manifests', 'registry.ollama.ai', 'library', 'demo'), {
    recursive: true
  });
  await writeFile(
    path.join(modelsDir, 'manifests', 'registry.ollama.ai', 'library', 'demo', 'latest'),
    JSON.stringify(MANIFEST)
  );
  process.env.OLLAMA_MODELS = modelsDir;
});

afterEach(async () => {
  delete process.env.OLLAMA_MODELS;
  await rm(modelsDir, { recursive: true, force: true });
  for (const directory of extraTempDirs.splice(0)) {
    await rm(directory, { recursive: true, force: true });
  }
});

describe('scanCache', () => {
  it('separates referenced blobs from orphans', async () => {
    await writeBlob('sha256-' + 'a'.repeat(64), 100);
    await writeBlob('sha256-' + 'b'.repeat(64), 200);
    await writeBlob('sha256-' + 'c'.repeat(64), 300);

    const report = await scanCache();

    expect(report.blobs.referenced).toMatchObject({ files: 2, bytes: 300 });
    expect(report.blobs.orphan).toMatchObject({ files: 1, bytes: 300 });
    expect(report.scanComplete).toBe(true);
    expect(report.reclaimableBytes).toBe(300);
  });

  it('returns per-file details with absolute paths and kinds', async () => {
    await writeBlob('sha256-' + 'a'.repeat(64), 100);
    await writeBlob('sha256-' + 'c'.repeat(64), 300);
    await writeBlob('sha256-' + 'd'.repeat(64) + '-partial', 500, 20 * 60 * 1000);
    await writeBlob('sha256-' + 'd'.repeat(64) + '-partial-0', 50, 20 * 60 * 1000);

    const report = await scanCache();

    expect(report.blobs.orphan.items).toHaveLength(1);
    expect(report.blobs.orphan.items[0]).toMatchObject({
      name: 'sha256-' + 'c'.repeat(64),
      bytes: 300,
      kind: 'blob'
    });
    expect(report.blobs.orphan.items[0].path).toBe(
      path.join(modelsDir, 'blobs', 'sha256-' + 'c'.repeat(64))
    );
    expect(report.blobs.partial.items[0]).toMatchObject({ kind: 'partial', bytes: 500 });
    expect(report.blobs.chunks.items[0]).toMatchObject({ kind: 'chunk', bytes: 50 });
    expect(report.blobs.referenced.items[0]).toMatchObject({ kind: 'blob', bytes: 100 });
  });

  it('lists app temp folders with file counts', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'ollama-studio-cache-test-'));
    extraTempDirs.push(directory);
    await writeFile(path.join(directory, 'junk.gguf'), Buffer.alloc(123));
    const when = new Date(Date.now() - 20 * 60 * 1000);
    await utimes(path.join(directory, 'junk.gguf'), when, when);
    await utimes(directory, when, when);

    const report = await scanCache();

    expect(report.temp.items).toHaveLength(1);
    expect(report.temp.items[0]).toMatchObject({
      name: path.basename(directory),
      bytes: 123,
      kind: 'temp',
      entries: 1
    });
  });

  it('counts partial downloads and chunk markers', async () => {
    await writeBlob('sha256-' + 'd'.repeat(64) + '-partial', 500, 20 * 60 * 1000);
    await writeBlob('sha256-' + 'd'.repeat(64) + '-partial-0', 50, 20 * 60 * 1000);

    const report = await scanCache();

    expect(report.blobs.partial).toMatchObject({ files: 1, bytes: 500 });
    expect(report.blobs.chunks).toMatchObject({ files: 1, bytes: 50 });
    expect(report.reclaimableBytes).toBe(550);
  });

  it('skips files modified within the safety window', async () => {
    await writeBlob('sha256-' + 'e'.repeat(64) + '-partial', 700);

    const report = await scanCache();

    expect(report.blobs.partial.files).toBe(0);
    expect(report.skippedRecent).toBeGreaterThanOrEqual(1);
  });

  it('marks the scan incomplete when a manifest cannot be parsed', async () => {
    await writeFile(
      path.join(modelsDir, 'manifests', 'registry.ollama.ai', 'library', 'demo', 'broken'),
      '{not json'
    );

    const report = await scanCache();

    expect(report.scanComplete).toBe(false);
  });
});

describe('resolveRevealTarget', () => {
  it('allows files inside the models directory', async () => {
    const name = 'sha256-' + 'a'.repeat(64);
    await writeBlob(name, 100);

    await expect(resolveRevealTarget(path.join(modelsDir, 'blobs', name))).resolves.toEqual({
      path: path.join(modelsDir, 'blobs', name),
      directory: false
    });
  });

  it('allows app temp folders and reports them as directories', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'ollama-studio-cache-test-'));
    extraTempDirs.push(directory);

    await expect(resolveRevealTarget(directory)).resolves.toEqual({
      path: directory,
      directory: true
    });
  });

  it('rejects paths outside the allowed roots', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'not-allowed-cache-test-'));
    extraTempDirs.push(directory);
    const file = path.join(directory, 'secret.txt');
    await writeFile(file, 'nope');

    await expect(resolveRevealTarget(file)).rejects.toMatchObject({ status: 403 });
  });

  it('rejects empty and missing paths', async () => {
    await expect(resolveRevealTarget('')).rejects.toMatchObject({ status: 400 });
    await expect(
      resolveRevealTarget(path.join(modelsDir, 'blobs', 'missing'))
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe('cleanCache', () => {
  it('removes only unreferenced blobs', async () => {
    await writeBlob('sha256-' + 'a'.repeat(64), 100);
    await writeBlob('sha256-' + 'c'.repeat(64), 300);

    const result = await cleanCache(['orphan']);

    expect(result.removed.orphan).toBe(1);
    expect(result.freedBytes).toBe(300);
    expect(existsSync(path.join(modelsDir, 'blobs', 'sha256-' + 'a'.repeat(64)))).toBe(true);
    expect(existsSync(path.join(modelsDir, 'blobs', 'sha256-' + 'c'.repeat(64)))).toBe(false);
  });

  it('refuses to remove orphans when a manifest is unreadable', async () => {
    await writeFile(
      path.join(modelsDir, 'manifests', 'registry.ollama.ai', 'library', 'demo', 'broken'),
      '{not json'
    );

    await expect(cleanCache(['orphan'])).rejects.toMatchObject({ status: 409 });
  });

  it('removes stale partial files but keeps recent ones', async () => {
    await writeBlob('sha256-' + 'd'.repeat(64) + '-partial', 500, 20 * 60 * 1000);
    await writeBlob('sha256-' + 'e'.repeat(64) + '-partial', 700);

    const result = await cleanCache(['partial']);

    expect(result.removed.partial).toBe(1);
    expect(result.skippedRecent).toBe(1);
    expect(existsSync(path.join(modelsDir, 'blobs', 'sha256-' + 'd'.repeat(64) + '-partial'))).toBe(
      false
    );
    expect(existsSync(path.join(modelsDir, 'blobs', 'sha256-' + 'e'.repeat(64) + '-partial'))).toBe(
      true
    );
  });

  it('rejects unknown targets', async () => {
    await expect(cleanCache(['everything'])).rejects.toMatchObject({ status: 400 });
  });
});
