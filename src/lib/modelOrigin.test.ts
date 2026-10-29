import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MODEL_ORIGIN_KEY,
  lookupModelOrigin,
  originLabel,
  originUrl,
  recordModelOrigin
} from './modelOrigin';

function installStorage() {
  const data = new Map<string, string>();
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => {
        data.set(key, value);
      },
      removeItem: (key: string) => {
        data.delete(key);
      }
    }
  });
  return data;
}

describe('originUrl', () => {
  it('Hugging Face 仓库用 hf.co', () => {
    expect(
      originUrl({
        repo: 'saidutta69/minicpm-v-4.7-1b-heretic',
        file: 'a.gguf',
        quant: 'Q4_K_M',
        modelName: 'm'
      })
    ).toBe('https://huggingface.co/saidutta69/minicpm-v-4.7-1b-heretic');
  });

  it('ModelScope 用 modelscope.cn/models/<namespace>/<name>', () => {
    expect(
      originUrl({
        namespace: 'Qwen',
        name: 'Qwen3-8B-GGUF',
        file: 'a.gguf',
        quant: 'Q4_K_M',
        modelName: 'm'
      })
    ).toBe('https://modelscope.cn/models/Qwen/Qwen3-8B-GGUF');
  });
});

describe('recordModelOrigin / lookupModelOrigin', () => {
  beforeEach(() => {
    installStorage();
  });

  it('登记后能按模型名查回来源', () => {
    const source = {
      repo: 'saidutta69/minicpm-v-4.7-1b-heretic',
      file: 'x-Q4_K_M.gguf',
      quant: 'Q4_K_M',
      modelName: 'saidutta69/minicpm-v-4.7-1b-heretic:Q4_K_M'
    };
    recordModelOrigin('saidutta69/minicpm-v-4.7-1b-heretic:Q4_K_M', source);
    expect(lookupModelOrigin('saidutta69/minicpm-v-4.7-1b-heretic:Q4_K_M')).toEqual(source);
  });

  it('未登记过的模型返回 undefined', () => {
    expect(lookupModelOrigin('llama3:8b')).toBeUndefined();
  });

  it('同名模型重复登记时覆盖为最新来源', () => {
    const first = { repo: 'a/b', file: '1.gguf', quant: 'Q4_0', modelName: 'm' };
    const second = { repo: 'c/d', file: '2.gguf', quant: 'Q8_0', modelName: 'm' };
    recordModelOrigin('m', first);
    recordModelOrigin('m', second);
    expect(lookupModelOrigin('m')).toEqual(second);
  });

  it('空模型名不写入', () => {
    recordModelOrigin('   ', { repo: 'a/b', file: '1.gguf', quant: 'Q4_0', modelName: 'm' });
    expect(window.localStorage.getItem(MODEL_ORIGIN_KEY)).toBeNull();
  });

  it('忽略损坏的存储内容', () => {
    window.localStorage.setItem(MODEL_ORIGIN_KEY, '{"m":{"repo":123}}');
    expect(lookupModelOrigin('m')).toBeUndefined();
  });

  it('ModelScope 来源也能查回', () => {
    const source = {
      namespace: 'Qwen',
      name: 'Qwen3-8B-GGUF',
      file: 'Qwen3-8B-Q4_K_M.gguf',
      quant: 'Q4_K_M',
      modelName: 'Qwen/Qwen3-8B-GGUF:Q4_K_M'
    };
    recordModelOrigin('Qwen/Qwen3-8B-GGUF:Q4_K_M', source);
    expect(lookupModelOrigin('Qwen/Qwen3-8B-GGUF:Q4_K_M')).toEqual(source);
    expect(originLabel(source)).toBe('ModelScope');
  });
});
