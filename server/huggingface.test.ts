import { afterEach, describe, expect, it, vi } from 'vitest';
import { createModelFromGguf } from './importGguf';
import {
  buildHuggingFaceFileUrl,
  findHuggingFaceFile,
  pullFromHuggingFace,
  resolveHuggingFaceFile
} from './huggingface';

vi.mock('./importGguf', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./importGguf')>();
  return { ...actual, createModelFromGguf: vi.fn(async () => undefined) };
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('buildHuggingFaceFileUrl', () => {
  it('builds the resolve URL and encodes each path segment', () => {
    expect(
      buildHuggingFaceFileUrl({
        repo: 'diodel/Qwen3.5-0.8B-Q4_K_M-GGUF',
        file: 'sub dir/qwen3 q4_k_m.gguf',
        revision: 'main'
      })
    ).toBe(
      'https://huggingface.co/diodel/Qwen3.5-0.8B-Q4_K_M-GGUF/resolve/main/sub%20dir/qwen3%20q4_k_m.gguf?download=true'
    );
  });

  it('supports a revision containing a slash', () => {
    expect(
      buildHuggingFaceFileUrl({
        repo: 'owner/model',
        file: 'model.gguf',
        revision: 'refs/pr/1'
      })
    ).toContain('/resolve/refs/pr/1/model.gguf');
  });

  it('rejects an invalid repository or file path', () => {
    expect(() => buildHuggingFaceFileUrl({ repo: '../etc', file: 'model.gguf' })).toThrow(
      '仓库 owner 含非法字符。'
    );
    expect(() => buildHuggingFaceFileUrl({ repo: 'owner', file: 'model.gguf' })).toThrow(
      '仓库格式应为 owner/name。'
    );
    expect(() => buildHuggingFaceFileUrl({ repo: 'owner/model', file: '../model.gguf' })).toThrow(
      '文件路径非法。'
    );
    expect(() =>
      buildHuggingFaceFileUrl({ repo: 'owner/model', file: 'model.gguf', revision: '..' })
    ).toThrow('revision 含非法字符。');
  });
});

describe('findHuggingFaceFile', () => {
  const files = [
    'Qwen3-0.6B-Q4_K_M.gguf',
    'Qwen3-0.6B-Q8_0.gguf',
    'mmproj-Qwen3-0.6B-Q8_0.gguf',
    'mmproj-F16.gguf',
    'model-00001-of-00002.gguf'
  ];

  it('maps a quant label to its model file and ignores projector/split files', () => {
    expect(findHuggingFaceFile(files, 'Q4_K_M')).toBe('Qwen3-0.6B-Q4_K_M.gguf');
    expect(findHuggingFaceFile(files, 'Q8_0')).toBe('Qwen3-0.6B-Q8_0.gguf');
    expect(findHuggingFaceFile(files, 'F16')).toBeUndefined();
  });
});

describe('pullFromHuggingFace', () => {
  it('downloads the selected GGUF and registers it with ollama create', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(new Uint8Array([0x47, 0x47, 0x55, 0x46, 1, 2, 3]), {
          status: 200,
          headers: { 'content-length': '7' }
        })
    );
    vi.stubGlobal('fetch', fetchMock);
    const progress: Array<{ downloaded: number; total: number }> = [];
    const stages: string[] = [];

    const result = await pullFromHuggingFace({
      repo: 'Owner/Model',
      file: 'Q4_K_M/model.gguf',
      quant: 'Q4_K_M',
      model: 'Owner/Model:Q4_K_M',
      ollamaHost: 'http://127.0.0.1:11434',
      onProgress: (value) => progress.push(value),
      onStage: (stage) => stages.push(stage)
    });

    expect(result).toMatchObject({
      model: 'owner/model:q4_k_m',
      file: 'Q4_K_M/model.gguf',
      size: 7
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(vi.mocked(createModelFromGguf)).toHaveBeenCalledOnce();
    expect(progress.at(-1)).toEqual({ downloaded: 7, total: 7 });
    expect(stages).toEqual(['resolving', 'downloading', 'creating']);
  });
});

describe('resolveHuggingFaceFile', () => {
  it('resolves the selected quant from the repository metadata', async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          siblings: [
            {
              rfilename: 'model-Q4_K_M.gguf',
              size: 123,
              lfs: { sha256: 'abc', size: 123 }
            },
            { rfilename: 'mmproj-F16.gguf', size: 9 }
          ]
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(resolveHuggingFaceFile('owner/model', 'Q4_K_M')).resolves.toMatchObject({
      path: 'model-Q4_K_M.gguf',
      size: 123,
      sha256: 'abc'
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('requires a quant when the repository has multiple model files', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response(
          JSON.stringify({
            siblings: [{ rfilename: 'a-Q4_K_M.gguf' }, { rfilename: 'a-Q8_0.gguf' }]
          }),
          { status: 200 }
        );
      })
    );

    await expect(resolveHuggingFaceFile('owner/model', '')).rejects.toThrow('请指定量化标签');
  });

  it('reports a missing file list without downloading', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('not found', { status: 404 }))
    );

    await expect(resolveHuggingFaceFile('owner/model', 'Q4_K_M')).rejects.toThrow(
      '读取 Hugging Face 文件列表失败（HTTP 404）'
    );
  });
});
