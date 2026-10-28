import type { DaemonConfig } from '../types';

/** POSIX shell 安全引用；只用于展示/复制给用户，不会自动写入系统环境。 */
function quoteShellValue(value: string): string {
  // `~` 只有在未引用时才会展开；用 $HOME 兼顾展开与含空格路径。
  if (value.startsWith('~/')) {
    const rest = value.slice(2).replace(/(["\\$`])/g, '\\$1');
    return `"$HOME/${rest}"`;
  }
  if (/^[a-zA-Z0-9_./:@%+=,-]+$/.test(value) && value.length > 0) return value;
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * 根据界面里的 daemon 配置生成 `ollama serve` 启动命令。
 * 环境变量只在 Ollama 启动时读取，因此修改后必须重启服务才生效。
 */
export function buildServeCommand(config: DaemonConfig): string {
  const keepAlive = config.keepAlive === 'forever' ? '-1' : config.keepAlive;
  const env = [
    `OLLAMA_HOST=${quoteShellValue(config.host)}`,
    `OLLAMA_MODELS=${quoteShellValue(config.modelsPath)}`,
    `OLLAMA_NUM_PARALLEL=${config.numParallel}`,
    `OLLAMA_KEEP_ALIVE=${keepAlive}`,
    `OLLAMA_FLASH_ATTENTION=${config.flashAttention ? '1' : '0'}`
  ];
  return `${env.join(' ')} ollama serve`;
}
