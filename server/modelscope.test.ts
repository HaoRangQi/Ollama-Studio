import { describe, expect, it } from 'vitest';
import { buildModelScopeFileUrl } from './modelscope';
import { findModelScopeFile } from '../src/api/catalog';

describe('buildModelScopeFileUrl', () => {
  it('builds the resolve URL and encodes each path segment', () => {
    expect(
      buildModelScopeFileUrl({
        namespace: 'Qwen',
        name: 'Qwen3-0.6B-GGUF',
        file: 'subdir/qwen3-q4_k_m.gguf'
      })
    ).toBe(
      'https://modelscope.cn/models/Qwen/Qwen3-0.6B-GGUF/resolve/master/subdir/qwen3-q4_k_m.gguf'
    );
  });

  it('honours an explicit revision', () => {
    expect(
      buildModelScopeFileUrl({
        namespace: 'Qwen',
        name: 'Qwen3-0.6B-GGUF',
        file: 'qwen3-q4_k_m.gguf',
        revision: 'v1.0'
      })
    ).toContain('/resolve/v1.0/');
  });

  it('rejects path traversal in the namespace', () => {
    expect(() =>
      buildModelScopeFileUrl({ namespace: '../etc', name: 'x', file: 'a.gguf' })
    ).toThrow('namespace 含非法字符。');
  });

  it('rejects path traversal in the file path', () => {
    expect(() =>
      buildModelScopeFileUrl({ namespace: 'Qwen', name: 'x', file: '../a.gguf' })
    ).toThrow('文件路径非法。');
  });
});

describe('findModelScopeFile', () => {
  const files = ['Qwen3-0.6B-Q4_K_M.gguf', 'Qwen3-0.6B-Q8_0.gguf', 'mmproj-Qwen3-0.6B-Q8_0.gguf'];

  it('maps a quant label to its file', () => {
    expect(findModelScopeFile(files, 'Q4_K_M')).toBe('Qwen3-0.6B-Q4_K_M.gguf');
  });

  it('does not match a quant embedded in another name', () => {
    expect(findModelScopeFile(files, '6B')).toBeUndefined();
  });

  it('returns undefined when the file list is missing', () => {
    expect(findModelScopeFile(undefined, 'Q4_K_M')).toBeUndefined();
  });
});
