import { describe, expect, it } from 'vitest';
import { buildServeCommand } from './daemonConfig';
import type { DaemonConfig } from '../types';

const base: DaemonConfig = {
  host: '127.0.0.1:11434',
  modelsPath: '/Users/example/.ollama/models',
  numParallel: 4,
  keepAlive: '5m',
  flashAttention: true
};

describe('buildServeCommand', () => {
  it('生成完整的环境变量前缀', () => {
    expect(buildServeCommand(base)).toBe(
      'OLLAMA_HOST=127.0.0.1:11434 OLLAMA_MODELS=/Users/example/.ollama/models ' +
        'OLLAMA_NUM_PARALLEL=4 OLLAMA_KEEP_ALIVE=5m OLLAMA_FLASH_ATTENTION=1 ollama serve'
    );
  });

  it('forever 映射为 -1，并关闭 flash attention', () => {
    const command = buildServeCommand({
      ...base,
      keepAlive: 'forever',
      flashAttention: false
    });
    expect(command).toContain('OLLAMA_KEEP_ALIVE=-1');
    expect(command).toContain('OLLAMA_FLASH_ATTENTION=0');
  });

  it('给含空格和单引号的路径加 shell 引号', () => {
    const command = buildServeCommand({
      ...base,
      modelsPath: "/Volumes/My Disk/ollama's models"
    });
    expect(command).toContain(`OLLAMA_MODELS='/Volumes/My Disk/ollama'\\''s models'`);
  });

  it('把 ~ 展开为 $HOME，含空格时仍可正确传参', () => {
    const command = buildServeCommand({
      ...base,
      modelsPath: '~/My Models'
    });
    expect(command).toContain('OLLAMA_MODELS="$HOME/My Models"');
  });
});
