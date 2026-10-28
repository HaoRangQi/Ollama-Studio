import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseIoregGpu, readDiskUsage } from './metrics';

const created: string[] = [];

afterEach(async () => {
  await Promise.all(created.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('readDiskUsage', () => {
  it('返回文件系统的总量、可用量与已用量', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'ollama-metrics-'));
    created.push(dir);

    const disk = await readDiskUsage(dir);

    expect(disk.path).toBe(dir);
    expect(disk.totalBytes).toBeGreaterThan(0);
    expect(disk.freeBytes).toBeGreaterThanOrEqual(0);
    expect(disk.usedBytes).toBe(disk.totalBytes - disk.freeBytes);
  });
});

describe('parseIoregGpu', () => {
  it('读取 Apple Silicon 的型号与 Device Utilization', () => {
    const output = `
      "PerformanceStatistics" = {"Tiler Utilization %"=41,"Device Utilization %"=41}
      "model" = "Apple M1 Pro"
    `;
    expect(parseIoregGpu(output)).toEqual({
      available: true,
      source: 'ioreg',
      name: 'Apple M1 Pro',
      utilizationPercent: 41
    });
  });

  it('有型号但没有利用率时明确标记原因', () => {
    expect(parseIoregGpu('"model" = "Intel Iris Plus Graphics"')).toEqual({
      available: true,
      source: 'ioreg',
      name: 'Intel Iris Plus Graphics',
      reason: 'utilization-unavailable'
    });
  });

  it('没有可识别字段时返回不可用', () => {
    expect(parseIoregGpu('')).toEqual({
      available: false,
      source: 'none',
      reason: 'not-detected'
    });
  });

  it('多个 accelerator 时取最高利用率', () => {
    const output = `
      "Device Utilization %"=12 "model" = "GPU A"
      "Device Utilization %"=78 "model" = "GPU B"
    `;
    expect(parseIoregGpu(output).utilizationPercent).toBe(78);
  });
});
