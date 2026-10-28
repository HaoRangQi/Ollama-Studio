import { proxyAuthHeaders } from './ollama';

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

export interface SystemMetrics {
  collectedAt: number;
  disk: DiskMetrics;
  memory: MemoryMetrics;
  cpu: CpuMetrics;
  gpu: GpuMetrics;
  ane: {
    available: false;
    reason: 'no-public-api';
  };
}

/** 读取本地服务采集的磁盘、内存、CPU 与 GPU 指标。 */
export async function fetchSystemMetrics(): Promise<SystemMetrics> {
  let response: Response;
  try {
    response = await fetch('/api/metrics', {
      headers: { accept: 'application/json', ...proxyAuthHeaders() }
    });
  } catch (error) {
    throw new Error('无法连接本地服务，无法读取系统指标。', { cause: error });
  }
  if (!response.ok) {
    throw new Error(`系统指标读取失败（HTTP ${response.status}）`);
  }
  return (await response.json()) as SystemMetrics;
}
