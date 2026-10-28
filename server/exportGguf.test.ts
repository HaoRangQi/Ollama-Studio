import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GgufImportError } from './importGguf';
import { exportModelGguf, parseModelReference, resolveExportDirectory } from './exportGguf';

const originalModelsDir = process.env.OLLAMA_MODELS;

function digest(char: string): string {
  return `sha256:${char.repeat(64)}`;
}

async function writeBlob(modelsDir: string, char: string, content: string): Promise<void> {
  await mkdir(path.join(modelsDir, 'blobs'), { recursive: true });
  await writeFile(path.join(modelsDir, 'blobs', `sha256-${char.repeat(64)}`), content);
}

async function writeManifest(
  modelsDir: string,
  relative: string,
  layers: Array<{ mediaType: string; digest: string; size: number }>,
  root = 'manifests'
): Promise<void> {
  const manifestPath = path.join(modelsDir, root, relative);
  await mkdir(path.dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, JSON.stringify({ schemaVersion: 2, layers }));
}

describe('parseModelReference', () => {
  it('把短名称补全为 library 与 latest', () => {
    expect(parseModelReference('llama3.2')).toEqual({
      registry: 'registry.ollama.ai',
      namespace: 'library',
      model: 'llama3.2',
      tag: 'latest'
    });
  });

  it('解析 namespace、tag 与 hf.co registry', () => {
    expect(parseModelReference('huihui_ai/qwen3.8-abliterated:27b-q4_K_L')).toEqual({
      registry: 'registry.ollama.ai',
      namespace: 'huihui_ai',
      model: 'qwen3.8-abliterated',
      tag: '27b-q4_K_L'
    });
    expect(parseModelReference('hf.co/unsloth/Qwen3-0.6B-GGUF:Q4_K_M')).toEqual({
      registry: 'hf.co',
      namespace: 'unsloth',
      model: 'Qwen3-0.6B-GGUF',
      tag: 'Q4_K_M'
    });
  });

  it('拒绝路径穿越', () => {
    expect(() => parseModelReference('../etc:latest')).toThrow(GgufImportError);
    expect(() => parseModelReference('library/../model')).toThrow(GgufImportError);
  });
});

describe('exportModelGguf', () => {
  let modelsDir: string;
  let destination: string;

  beforeEach(async () => {
    modelsDir = await mkdtemp(path.join(tmpdir(), 'ollama-export-models-'));
    // macOS 的 /var 是指向 /private/var 的符号链接，导出接口返回真实路径。
    destination = await realpath(await mkdtemp(path.join(tmpdir(), 'ollama-export-target-')));
    process.env.OLLAMA_MODELS = modelsDir;
  });

  afterEach(async () => {
    if (originalModelsDir === undefined) delete process.env.OLLAMA_MODELS;
    else process.env.OLLAMA_MODELS = originalModelsDir;
    await rm(modelsDir, { recursive: true, force: true });
    await rm(destination, { recursive: true, force: true });
  });

  it('导出 model 与 projector 层，并返回实际路径', async () => {
    await writeBlob(modelsDir, 'a', 'GGUF-MODEL');
    await writeBlob(modelsDir, 'b', 'MMPROJ');
    await writeManifest(modelsDir, 'registry.ollama.ai/library/test-model/latest', [
      { mediaType: 'application/vnd.ollama.image.model', digest: digest('a'), size: 10 },
      { mediaType: 'application/vnd.ollama.image.projector', digest: digest('b'), size: 6 }
    ]);

    const result = await exportModelGguf('test-model', destination);

    expect(result.directory).toBe(destination);
    expect(result.files.map((file) => file.name)).toEqual([
      'library-test-model-latest.gguf',
      'library-test-model-latest-mmproj.gguf'
    ]);
    expect(await readFile(path.join(destination, result.files[0].name), 'utf8')).toBe('GGUF-MODEL');
    expect(await readFile(path.join(destination, result.files[1].name), 'utf8')).toBe('MMPROJ');
    expect(result.totalBytes).toBe(16);
  });

  it('重名时追加序号，不覆盖已有文件', async () => {
    await writeBlob(modelsDir, 'a', 'GGUF');
    await writeManifest(modelsDir, 'registry.ollama.ai/library/test-model/latest', [
      { mediaType: 'application/vnd.ollama.image.model', digest: digest('a'), size: 4 }
    ]);

    const first = await exportModelGguf('test-model', destination);
    const second = await exportModelGguf('test-model', destination);

    expect(first.files[0].name).toBe('library-test-model-latest.gguf');
    expect(second.files[0].name).toBe('library-test-model-latest-2.gguf');
  });

  it('支持 manifests-v2/ollama.com 的默认 registry 布局', async () => {
    await writeBlob(modelsDir, 'c', 'V2');
    await writeManifest(
      modelsDir,
      'ollama.com/library/v2-model/latest',
      [{ mediaType: 'application/vnd.ollama.image.gguf', digest: digest('c'), size: 2 }],
      'manifests-v2'
    );

    const result = await exportModelGguf('v2-model', destination);
    expect(result.files[0].name).toBe('library-v2-model-latest.gguf');
  });

  it('manifest 不存在时返回 404', async () => {
    await expect(exportModelGguf('missing-model', destination)).rejects.toMatchObject({
      status: 404
    });
  });

  it('没有模型权重层时返回 422', async () => {
    await writeBlob(modelsDir, 'b', 'MMPROJ');
    await writeManifest(modelsDir, 'registry.ollama.ai/library/projector-only/latest', [
      { mediaType: 'application/vnd.ollama.image.projector', digest: digest('b'), size: 6 }
    ]);

    await expect(exportModelGguf('projector-only', destination)).rejects.toMatchObject({
      status: 422
    });
  });

  it('权重 blob 缺失时返回 500', async () => {
    await writeManifest(modelsDir, 'registry.ollama.ai/library/broken/latest', [
      { mediaType: 'application/vnd.ollama.image.model', digest: digest('d'), size: 10 }
    ]);

    await expect(exportModelGguf('broken', destination)).rejects.toMatchObject({
      status: 500
    });
  });

  it('拒绝用户主目录、临时目录与可移动磁盘之外的显式目录', async () => {
    await expect(resolveExportDirectory('/etc')).rejects.toMatchObject({ status: 403 });
  });
});
