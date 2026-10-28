import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { GgufImportError, importGgufStream, normalizeGgufModelName } from './importGguf';

describe('normalizeGgufModelName', () => {
  it('derives a lowercase model name from the filename', () => {
    expect(normalizeGgufModelName(undefined, 'MiniCPM-V-4.7-1B.Q4_K_M.gguf')).toBe(
      'minicpm-v-4.7-1b.q4_k_m:latest'
    );
  });

  it('prefers an explicit name and sanitizes it', () => {
    expect(normalizeGgufModelName(' My Model:Q4 ', 'x.gguf')).toBe('my-model:q4');
  });

  it('keeps an explicit tag verbatim after sanitizing', () => {
    expect(normalizeGgufModelName('org/model:q4_k_m', 'x.gguf')).toBe('org/model:q4_k_m');
  });

  it('throws for filenames that sanitize to nothing', () => {
    expect(() => normalizeGgufModelName(undefined, '💥.gguf')).toThrow(GgufImportError);
  });
});

describe('importGgufStream validation', () => {
  it('rejects non-GGUF filenames before touching the filesystem', async () => {
    await expect(
      importGgufStream(Readable.from([]), {
        filename: 'model.bin',
        ollamaHost: 'http://127.0.0.1:11434'
      })
    ).rejects.toMatchObject({ status: 400, message: '仅支持 .gguf 文件。' });
  });

  it('rejects empty uploads before invoking the CLI', async () => {
    await expect(
      importGgufStream(Readable.from([]), {
        filename: 'empty.gguf',
        ollamaHost: 'http://127.0.0.1:11434'
      })
    ).rejects.toMatchObject({ status: 400, message: '上传的 GGUF 文件为空。' });
  });
});
