import { useCallback, useEffect, useRef, useState } from 'react';
import { quantFromTag } from '../lib/format';
import {
  cancelDownloadJob,
  listDownloadJobs,
  readStorageJson,
  startDownloadJob,
  writeStorageJson
} from '../lib/legacy';
import type {
  DownloadKind,
  DownloadJob,
  DownloadJobInput,
  HuggingFaceTarget,
  ModelScopeTarget
} from '../lib/legacy';

export const DOWNLOAD_RECORDS_KEY = 'ollama_ui3_downloads_v1';

export type DownloadRecordStatus = 'running' | 'success' | 'error' | 'cancelled' | 'paused';

export interface DownloadRecord {
  id: string;
  kind: DownloadKind;
  model: string;
  status: DownloadRecordStatus;
  layerStatus: string;
  completed: number;
  total: number;
  error?: string;
  target?: ModelScopeTarget | HuggingFaceTarget;
  startedAt: number;
  updatedAt: number;
  /** 远程 GGUF 的量化标签；pull 任务从 tag 推断。 */
  quant: string;
  speedBps: number;
}

export interface StartTargets {
  modelscope: ModelScopeTarget & { quant: string; modelName: string };
  huggingface: HuggingFaceTarget & { quant: string; modelName: string };
}

interface UseDownloadsOptions {
  onCompleted: (record: DownloadRecord) => void;
  onFailed: (record: DownloadRecord) => void;
}

export interface DownloadsApi {
  records: DownloadRecord[];
  startPull: (model: string, quant?: string) => Promise<DownloadRecord>;
  startModelScope: (target: StartTargets['modelscope']) => Promise<DownloadRecord>;
  startHuggingFace: (target: StartTargets['huggingface']) => Promise<DownloadRecord>;
  pause: (record: DownloadRecord) => Promise<void>;
  resume: (record: DownloadRecord) => Promise<DownloadRecord>;
  cancel: (record: DownloadRecord) => Promise<void>;
  clearFinished: () => void;
}

const POLL_MS = 1500;
const MAX_RECORDS = 40;
const KEEP_MS = 7 * 86_400_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseTarget(value: unknown): ModelScopeTarget | HuggingFaceTarget | undefined {
  if (!isRecord(value)) return undefined;
  if (typeof value.repo === 'string') {
    return {
      repo: value.repo,
      ...(typeof value.file === 'string' ? { file: value.file } : {}),
      ...(typeof value.quant === 'string' ? { quant: value.quant } : {}),
      ...(typeof value.revision === 'string' ? { revision: value.revision } : {}),
      ...(typeof value.model === 'string' ? { model: value.model } : {})
    };
  }
  if (
    typeof value.namespace === 'string' &&
    typeof value.name === 'string' &&
    typeof value.file === 'string'
  ) {
    return {
      namespace: value.namespace,
      name: value.name,
      file: value.file,
      ...(typeof value.revision === 'string' ? { revision: value.revision } : {}),
      ...(typeof value.model === 'string' ? { model: value.model } : {})
    };
  }
  return undefined;
}

function parseRecord(value: unknown): DownloadRecord | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== 'string' || typeof value.model !== 'string') return null;
  const status = value.status;
  if (
    status !== 'running' &&
    status !== 'success' &&
    status !== 'error' &&
    status !== 'cancelled' &&
    status !== 'paused'
  ) {
    return null;
  }
  const kind =
    value.kind === 'modelscope' || value.kind === 'huggingface' || value.kind === 'pull'
      ? value.kind
      : 'pull';
  const numberOr = (key: string, fallback = 0) =>
    typeof value[key] === 'number' && Number.isFinite(value[key])
      ? (value[key] as number)
      : fallback;
  return {
    id: value.id,
    kind,
    model: value.model,
    status,
    layerStatus: typeof value.layerStatus === 'string' ? value.layerStatus : '',
    completed: Math.max(0, numberOr('completed')),
    total: Math.max(0, numberOr('total')),
    error: typeof value.error === 'string' ? value.error : undefined,
    target: parseTarget(value.target),
    startedAt: numberOr('startedAt', Date.now()),
    updatedAt: numberOr('updatedAt', Date.now()),
    quant: typeof value.quant === 'string' ? value.quant : quantFromTag(value.model),
    speedBps: Math.max(0, numberOr('speedBps'))
  };
}

function loadRecords(): DownloadRecord[] {
  const raw = readStorageJson<unknown>(DOWNLOAD_RECORDS_KEY, []);
  if (!Array.isArray(raw)) return [];
  return prune(raw.map(parseRecord).filter((item): item is DownloadRecord => item !== null));
}

function prune(records: DownloadRecord[]): DownloadRecord[] {
  const cutoff = Date.now() - KEEP_MS;
  return records
    .filter(
      (record) =>
        record.status === 'running' || record.status === 'paused' || record.updatedAt > cutoff
    )
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_RECORDS);
}

function recordFromJob(
  job: DownloadJob,
  previous?: DownloadRecord,
  quantOverride?: string
): DownloadRecord {
  const targetQuant =
    job.target && 'quant' in job.target && typeof job.target.quant === 'string'
      ? job.target.quant
      : '';
  return {
    id: job.id,
    kind: job.kind,
    model: job.model,
    status: job.status,
    layerStatus: job.layerStatus,
    completed: job.completed,
    total: job.total,
    error: job.error,
    target: job.target,
    startedAt: job.startedAt,
    updatedAt: job.updatedAt,
    quant: quantOverride || previous?.quant || targetQuant || quantFromTag(job.model),
    speedBps: previous?.speedBps ?? 0
  };
}

function resumeInput(record: DownloadRecord): DownloadJobInput | null {
  if (record.kind === 'modelscope') {
    const target = record.target;
    if (!target || !('namespace' in target)) return null;
    return {
      kind: 'modelscope',
      namespace: target.namespace,
      name: target.name,
      file: target.file,
      ...(target.revision ? { revision: target.revision } : {}),
      model: target.model ?? record.model
    };
  }

  if (record.kind === 'huggingface') {
    const target = record.target;
    if (target && 'repo' in target) {
      return {
        kind: 'huggingface',
        repo: target.repo,
        file: target.file || undefined,
        quant: target.quant || record.quant || undefined,
        ...(target.revision ? { revision: target.revision } : {}),
        model: target.model ?? record.model
      };
    }
    const raw = record.model.replace(/^hf\.co\//i, '');
    const colon = raw.lastIndexOf(':');
    const repo = colon > 0 ? raw.slice(0, colon) : raw;
    if (!repo.includes('/')) return null;
    return {
      kind: 'huggingface',
      repo,
      quant: record.quant || (colon > 0 ? raw.slice(colon + 1) : undefined),
      model: record.model
    };
  }

  return { kind: 'pull', model: record.model };
}

/**
 * 下载队列以服务端任务为准，同时在 localStorage 保留本地历史。
 * 暂停 = 取消服务端任务并保留本地记录；继续 = 用保存的 target 新建任务。
 */
export function useDownloads(options: UseDownloadsOptions): DownloadsApi {
  const [records, setRecords] = useState<DownloadRecord[]>(loadRecords);
  const recordsRef = useRef(records);
  const statusRef = useRef<Map<string, DownloadRecordStatus>>(
    new Map(records.map((record) => [record.id, record.status]))
  );
  const speedRef = useRef<Map<string, { completed: number; at: number; bps: number }>>(new Map());
  const initializedRef = useRef(false);
  const mountedAtRef = useRef(Date.now());
  const mountedRef = useRef(true);
  const pollingRef = useRef(false);
  const onCompletedRef = useRef(options.onCompleted);
  const onFailedRef = useRef(options.onFailed);

  useEffect(() => {
    onCompletedRef.current = options.onCompleted;
    onFailedRef.current = options.onFailed;
  }, [options.onCompleted, options.onFailed]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    recordsRef.current = records;
  }, [records]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      writeStorageJson(DOWNLOAD_RECORDS_KEY, records);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [records]);

  const commit = useCallback((next: DownloadRecord[]) => {
    const pruned = prune(next);
    recordsRef.current = pruned;
    setRecords(pruned);
  }, []);

  const upsert = useCallback(
    (record: DownloadRecord) => {
      const existing = recordsRef.current.filter((item) => item.id !== record.id);
      commit([record, ...existing]);
      statusRef.current.set(record.id, record.status);
    },
    [commit]
  );

  const poll = useCallback(async () => {
    if (pollingRef.current) return;
    pollingRef.current = true;
    try {
      let jobs: DownloadJob[];
      try {
        jobs = await listDownloadJobs();
      } catch {
        return;
      }
      if (!mountedRef.current) return;

      const now = Date.now();
      const next = new Map(recordsRef.current.map((record) => [record.id, record]));
      const serverIds = new Set(jobs.map((job) => job.id));
      const completed: DownloadRecord[] = [];
      const failed: DownloadRecord[] = [];

      for (const job of jobs) {
        const previous = next.get(job.id);
        // 本地刚暂停的任务对应服务端的 cancelled 快照，不要把 paused 覆盖掉。
        if (previous?.status === 'paused' && job.status === 'cancelled') continue;

        const previousSpeed = speedRef.current.get(job.id);
        let speed = previousSpeed?.bps ?? 0;
        if (job.status === 'running' && previousSpeed) {
          const elapsed = (now - previousSpeed.at) / 1000;
          const delta = job.completed - previousSpeed.completed;
          if (elapsed > 0 && delta > 0) {
            const measured = delta / elapsed;
            speed = previousSpeed.bps > 0 ? previousSpeed.bps * 0.35 + measured * 0.65 : measured;
          }
        } else if (job.status !== 'running') {
          speed = 0;
        }
        speedRef.current.set(job.id, { completed: job.completed, at: now, bps: speed });

        const record = recordFromJob(job, previous);
        record.speedBps = speed;
        next.set(job.id, record);

        const previousStatus = statusRef.current.get(job.id);
        const startedAfterMount = job.startedAt >= mountedAtRef.current;
        const changed = previousStatus
          ? previousStatus !== job.status
          : initializedRef.current && startedAfterMount;
        if (changed) {
          if (job.status === 'success') completed.push(record);
          if (job.status === 'error') failed.push(record);
        }
        statusRef.current.set(job.id, job.status);
      }

      for (const [id, record] of next) {
        if (record.status === 'running' && !serverIds.has(id) && now - record.startedAt > 15000) {
          const lost: DownloadRecord = {
            ...record,
            status: 'error',
            layerStatus: 'error',
            error: '后台任务已丢失（本地服务可能重启过）。请点击重试重新开始下载。',
            speedBps: 0,
            updatedAt: now
          };
          next.set(id, lost);
          statusRef.current.set(id, 'error');
          failed.push(lost);
        }
      }

      initializedRef.current = true;
      commit([...next.values()]);
      for (const record of completed) onCompletedRef.current(record);
      for (const record of failed) onFailedRef.current(record);
    } finally {
      pollingRef.current = false;
    }
  }, [commit]);

  useEffect(() => {
    void poll();
    const timer = window.setInterval(() => {
      if (!document.hidden) void poll();
    }, POLL_MS);
    const handleVisibility = () => {
      if (!document.hidden) void poll();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [poll]);

  const startPull = useCallback(
    async (model: string, quant = '') => {
      const job = await startDownloadJob({ kind: 'pull', model });
      const record = recordFromJob(job, undefined, quant || quantFromTag(model));
      upsert(record);
      return record;
    },
    [upsert]
  );

  const startModelScope = useCallback(
    async (target: StartTargets['modelscope']) => {
      const job = await startDownloadJob({
        kind: 'modelscope',
        namespace: target.namespace,
        name: target.name,
        file: target.file,
        model: target.modelName
      });
      const record = recordFromJob(job, undefined, target.quant);
      upsert(record);
      return record;
    },
    [upsert]
  );

  const startHuggingFace = useCallback(
    async (target: StartTargets['huggingface']) => {
      const job = await startDownloadJob({
        kind: 'huggingface',
        repo: target.repo,
        file: target.file || undefined,
        quant: target.quant || undefined,
        model: target.modelName
      });
      const record = recordFromJob(job, undefined, target.quant);
      upsert(record);
      return record;
    },
    [upsert]
  );

  const pause = useCallback(
    async (record: DownloadRecord) => {
      if (record.status === 'running') await cancelDownloadJob(record.id);
      const nextRecord: DownloadRecord = {
        ...record,
        status: 'paused',
        layerStatus: 'paused',
        speedBps: 0,
        updatedAt: Date.now()
      };
      speedRef.current.delete(record.id);
      commit(recordsRef.current.map((item) => (item.id === record.id ? nextRecord : item)));
      statusRef.current.set(record.id, 'paused');
    },
    [commit]
  );

  const resume = useCallback(
    async (record: DownloadRecord) => {
      const input = resumeInput(record);
      if (!input) throw new Error('缺少下载来源信息，请重新搜索后再下载。');
      const job = await startDownloadJob(input);
      const nextRecord = recordFromJob(job, record, record.quant);
      nextRecord.speedBps = 0;
      commit([nextRecord, ...recordsRef.current.filter((item) => item.id !== record.id)]);
      statusRef.current.delete(record.id);
      statusRef.current.set(job.id, 'running');
      return nextRecord;
    },
    [commit]
  );

  const cancel = useCallback(
    async (record: DownloadRecord) => {
      if (record.status === 'running') {
        await cancelDownloadJob(record.id).catch(() => undefined);
      }
      speedRef.current.delete(record.id);
      statusRef.current.delete(record.id);
      commit(recordsRef.current.filter((item) => item.id !== record.id));
    },
    [commit]
  );

  const clearFinished = useCallback(() => {
    commit(
      recordsRef.current.filter(
        (record) => record.status === 'running' || record.status === 'paused'
      )
    );
  }, [commit]);

  return {
    records,
    startPull,
    startModelScope,
    startHuggingFace,
    pause,
    resume,
    cancel,
    clearFinished
  };
}
