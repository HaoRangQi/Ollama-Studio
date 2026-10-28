import { execFile } from 'node:child_process';
import { statfs } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import os from 'node:os';
import { promisify } from 'node:util';
import { resolveModelsDir } from './cache';

const execFileAsync = promisify(execFile);

export interface DiskMetrics {
  path: string;
  totalBytes: number;
  freeBytes: number;
  usedBytes: number;
}

export interface MemoryMetrics {
  totalBytes: number;
  freeBytes: number;
  usedBytes: number;
}

export interface CpuMetrics {
  cores: number;
  load1: number;
  load5: number;
  load15: number;
}

export interface GpuMetrics {
  available: boolean;
  source: 'ioreg' | 'none';
  name?: string;
  utilizationPercent?: number;
  reason?: 'unsupported-platform' | 'command-failed' | 'not-detected' | 'utilization-unavailable';
}

export interface AneMetrics {
  available: false;
  reason: 'no-public-api';
}

export interface SystemMetrics {
  collectedAt: number;
  disk: DiskMetrics;
  memory: MemoryMetrics;
  cpu: CpuMetrics;
  gpu: GpuMetrics;
  ane: AneMetrics;
}

/** 读取指定路径所在文件系统的容量；路径不存在时由调用方回退。 */
export async function readDiskUsage(targetPath: string): Promise<DiskMetrics> {
  const stats = await statfs(targetPath);
  const totalBytes = Number(stats.blocks) * Number(stats.bsize);
  const freeBytes = Number(stats.bavail) * Number(stats.bsize);
  return {
    path: targetPath,
    totalBytes,
    freeBytes,
    usedBytes: Math.max(0, totalBytes - freeBytes)
  };
}

/**
 * 解析 `ioreg -c IOAccelerator` 的输出。
 * Apple Silicon 通常同时提供 `model` 与 `Device Utilization %`；Intel Mac
 * 可能只有名称或两者都没有，因此 `available` 与利用率分别判断。
 */
export function parseIoregGpu(output: string): GpuMetrics {
  const name = /"model"\s*=\s*"([^"]+)"/.exec(output)?.[1];
  const utilizationMatches = [...output.matchAll(/"Device Utilization %"\s*=\s*(\d+)/g)];
  const utilization =
    utilizationMatches.length > 0
      ? Math.min(100, Math.max(...utilizationMatches.map((match) => Number(match[1]))))
      : undefined;

  if (!name && utilization === undefined) {
    return { available: false, source: 'none', reason: 'not-detected' };
  }
  if (utilization === undefined) {
    return {
      available: true,
      source: 'ioreg',
      name,
      reason: 'utilization-unavailable'
    };
  }
  return {
    available: true,
    source: 'ioreg',
    name,
    utilizationPercent: utilization
  };
}

async function readGpuUsage(): Promise<GpuMetrics> {
  if (process.platform !== 'darwin') {
    return { available: false, source: 'none', reason: 'unsupported-platform' };
  }
  try {
    const { stdout } = await execFileAsync(
      'ioreg',
      ['-r', '-d', '1', '-w', '0', '-c', 'IOAccelerator'],
      { timeout: 1500, maxBuffer: 4 * 1024 * 1024, encoding: 'utf8' }
    );
    return parseIoregGpu(stdout);
  } catch {
    return { available: false, source: 'none', reason: 'command-failed' };
  }
}

/**
 * 采集系统指标。磁盘优先取 Ollama 模型目录所在文件系统；目录不存在时
 * 回退到用户主目录。GPU 仅在 macOS 上尝试 `ioreg`，失败时明确返回不可用，
 * 不用估算值填充。ANE 没有公开利用率 API，固定标记为不可用。
 */
export async function getSystemMetrics(): Promise<SystemMetrics> {
  const modelsDir = resolveModelsDir();
  let disk: DiskMetrics;
  try {
    disk = await readDiskUsage(modelsDir);
  } catch {
    disk = await readDiskUsage(os.homedir());
  }

  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const [load1, load5, load15] = os.loadavg();

  return {
    collectedAt: Date.now(),
    disk,
    memory: {
      totalBytes: totalMemory,
      freeBytes: freeMemory,
      usedBytes: Math.max(0, totalMemory - freeMemory)
    },
    cpu: {
      cores: os.cpus().length,
      load1,
      load5,
      load15
    },
    gpu: await readGpuUsage(),
    ane: { available: false, reason: 'no-public-api' }
  };
}

function writeJson(response: ServerResponse, status: number, payload: unknown): void {
  response.statusCode = status;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.setHeader('cache-control', 'no-store');
  response.end(JSON.stringify(payload));
}

/** `GET /api/metrics`：只读系统指标，供遥测页轮询。 */
export function handleMetricsRequest(
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  if (request.method !== 'GET') {
    writeJson(response, 405, { error: '仅支持 GET。' });
    return Promise.resolve();
  }
  return getSystemMetrics()
    .then((metrics) => writeJson(response, 200, metrics))
    .catch((error: unknown) => {
      writeJson(response, 500, {
        error: error instanceof Error ? error.message : String(error)
      });
    });
}
