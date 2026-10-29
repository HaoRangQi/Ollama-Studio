import { describe, expect, it } from 'vitest';
import { extractGgufFiles, extractQuants, findQuantFile, isProjectorGguf } from './catalog';

describe('extractQuants', () => {
  it('返回全部可识别量化，不截断', () => {
    // 曾有 slice(0, 12)：15 个量化的仓库会被砍掉 Q5_K_S/Q6_K/Q8_0，
    // 卡片上的 “+N” 因此永远展不全。折叠交给 UI，数据层不再截断。
    const files = [
      'MiniCPM-V-4.7-1B-heretic-F16.gguf',
      'MiniCPM-V-4.7-1B-heretic-IQ3_S.gguf',
      'MiniCPM-V-4.7-1B-heretic-IQ4_XS.gguf',
      'MiniCPM-V-4.7-1B-heretic-Q2_K.gguf',
      'MiniCPM-V-4.7-1B-heretic-Q3_K_L.gguf',
      'MiniCPM-V-4.7-1B-heretic-Q3_K_M.gguf',
      'MiniCPM-V-4.7-1B-heretic-Q3_K_S.gguf',
      'MiniCPM-V-4.7-1B-heretic-Q4_0.gguf',
      'MiniCPM-V-4.7-1B-heretic-Q4_1.gguf',
      'MiniCPM-V-4.7-1B-heretic-Q4_K_M.gguf',
      'MiniCPM-V-4.7-1B-heretic-Q4_K_S.gguf',
      'MiniCPM-V-4.7-1B-heretic-Q5_K_M.gguf',
      'MiniCPM-V-4.7-1B-heretic-Q5_K_S.gguf',
      'MiniCPM-V-4.7-1B-heretic-Q6_K.gguf',
      'MiniCPM-V-4.7-1B-heretic-Q8_0.gguf'
    ];
    expect(extractQuants(files)).toHaveLength(15);
    expect(extractQuants(files)).toContain('Q6_K');
    expect(extractQuants(files)).toContain('Q8_0');
  });

  it('同一量化只保留一个', () => {
    expect(extractQuants(['a/b-Q4_K_M.gguf', 'a/c-Q4_K_M.gguf'])).toEqual(['Q4_K_M']);
  });

  it('无法识别量化名的文件不产出标签', () => {
    expect(extractQuants(['model.gguf', 'model-text.gguf'])).toEqual([]);
  });

  it('识别 BF16 与 F32', () => {
    expect(extractQuants(['m-BF16.gguf', 'm-F32.gguf'])).toEqual(['BF16', 'F32']);
  });
});

describe('extractGgufFiles', () => {
  it('排除分片与 mmproj，它们不是可独立对话的权重', () => {
    const files = extractGgufFiles([
      { rfilename: 'model-Q4_K_M.gguf' },
      { rfilename: 'model-00001-of-00002.gguf' },
      { rfilename: 'mmproj-model-f16.gguf' },
      { rfilename: 'model.bin' }
    ]);
    expect(files).toEqual(['model-Q4_K_M.gguf']);
  });

  it('识别 projector 命名', () => {
    expect(isProjectorGguf('a/mmproj-f16.gguf')).toBe(true);
    expect(isProjectorGguf('a/model-f16.gguf')).toBe(false);
  });
});

describe('findQuantFile', () => {
  const files = ['Qwen3-8B-Q4_K_M.gguf', 'Qwen3-8B-Q8_0.gguf'];

  it('按量化名找到对应文件', () => {
    expect(findQuantFile(files, 'Q8_0')).toBe('Qwen3-8B-Q8_0.gguf');
  });

  it('量化名中的正则元字符按字面匹配', () => {
    expect(findQuantFile(files, 'Q4_K.M')).toBeUndefined();
  });
});
