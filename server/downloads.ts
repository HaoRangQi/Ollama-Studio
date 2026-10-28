import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { GgufImportError } from './importGguf';
import { readJsonBody } from './http';
import { buildModelScopeFileUrl, pullFromModelScope } from './modelscope';

/**
 * 后台下载任务：下载由服务端持有，浏览器只轮询进度。
 * 这样刷新页面、切换页签都不会中断下载。
 */
const JOB_TTL_MS = 5 * 60 * 1000;

export type DownloadKind = 'pull' | 'modelscope';
export type DownloadStatus = 'running' | 'success' | 'error' | 'cancelled';

export interface ModelScopeTarget {
  namespace: string;
  name: string;
  file: string;
  revision?: string;
  model?: string;
}

export interface DownloadJobSnapshot {
  id: string;
  kind: DownloadKind;
  /** 展示名：pull 为模型标签，modelscope 为 namespace/name。 */
  model: string;
  status: DownloadStatus;
  layerStatus: string;
  /** 已下载/总字节数；total 未知时为 0。 */
  completed: number;
  total: number;
  error?: string;
  /** ModelScope 任务保留原始定位信息，便于暂停后或刷新后重新发起。 */
  target?: ModelScopeTarget;
  startedAt: number;
  updatedAt: number;
}

interface DownloadJob extends DownloadJobSnapshot {
  key: string;
  controller: AbortController;
}

const jobs = new Map<string, DownloadJob>();

/** 缓存清理需要知道是否有下载正在进行，避免删掉正在写入的 partial 文件。 */
export function hasRunningDownloads(): boolean {
  for (const job of jobs.values()) {
    if (job.status === 'running') return true;
  }
  return false;
}

function snapshot(job: DownloadJob): DownloadJobSnapshot {
  const { controller: _controller, key: _key, ...rest } = job;
  return { ...rest };
}

/** 已结束的任务保留一段时间，供客户端取到最终状态后自然淘汰。 */
function prune() {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (job.status !== 'running' && now - job.updatedAt > JOB_TTL_MS) jobs.delete(id);
  }
}

function findRunning(key: string): DownloadJob | undefined {
  for (const job of jobs.values()) {
    if (job.key === key && job.status === 'running') return job;
  }
  return undefined;
}

function createJob(
  kind: DownloadKind,
  key: string,
  model: string,
  layerStatus: string,
  target?: ModelScopeTarget
): DownloadJob {
  const now = Date.now();
  const job: DownloadJob = {
    id: `dl-${randomUUID()}`,
    kind,
    key,
    model,
    status: 'running',
    layerStatus,
    completed: 0,
    total: 0,
    target,
    startedAt: now,
    updatedAt: now,
    controller: new AbortController()
  };
  jobs.set(job.id, job);
  return job;
}

function fail(job: DownloadJob, message: string) {
  job.status = 'error';
  job.error = message.slice(0, 4000);
  job.layerStatus = 'error';
  job.updatedAt = Date.now();
}

function done(job: DownloadJob) {
  job.status = 'success';
  job.completed = job.total || job.completed;
  job.layerStatus = 'success';
  job.updatedAt = Date.now();
}

interface OllamaPullEvent {
  status?: string;
  digest?: string;
  total?: number;
  completed?: number;
  error?: string;
}

/**
 * 直接向 Ollama 发起 pull 并在服务端消费 NDJSON。
 * 分层的 total/completed 在这里聚合成整体字节数，客户端不需要再算。
 */
async function runPullJob(job: DownloadJob, ollamaHost: string) {
  const layers = new Map<string, { total: number; completed: number }>();
  try {
    const response = await fetch(`${ollamaHost}/api/pull`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/x-ndjson' },
      body: JSON.stringify({ name: job.model, stream: true }),
      signal: job.controller.signal
    });

    if (!response.ok || !response.body) {
      const detail = await response.text().catch(() => '');
      fail(job, detail.trim() || `Ollama 返回 HTTP ${response.status}`);
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    const handleLine = (line: string) => {
      if (!line) return;
      let event: OllamaPullEvent;
      try {
        event = JSON.parse(line) as OllamaPullEvent;
      } catch {
        return;
      }

      if (event.error) {
        fail(job, event.error);
        return;
      }

      if (event.digest) {
        const existing = layers.get(event.digest);
        const total = typeof event.total === 'number' ? event.total : (existing?.total ?? 0);
        const completed =
          typeof event.completed === 'number' ? event.completed : (existing?.completed ?? 0);
        layers.set(event.digest, { total, completed });

        let bytesTotal = 0;
        let bytesDone = 0;
        for (const layer of layers.values()) {
          bytesTotal += layer.total;
          bytesDone += layer.completed;
        }
        job.total = bytesTotal;
        job.completed = bytesDone;
      }

      if (event.status) {
        job.layerStatus = event.status;
        job.updatedAt = Date.now();
        if (event.status === 'success') done(job);
      }
    };

    while (true) {
      const { done: finished, value } = await reader.read();
      if (finished) break;
      buffer += decoder.decode(value, { stream: true });
      let newline = buffer.indexOf('\n');
      while (newline >= 0) {
        handleLine(buffer.slice(0, newline).trim());
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf('\n');
        if (job.status !== 'running') {
          await reader.cancel().catch(() => undefined);
          return;
        }
      }
    }
    handleLine(buffer.trim());

    if (job.status === 'running') done(job);
  } catch (error) {
    if (job.controller.signal.aborted) {
      job.status = 'cancelled';
      job.layerStatus = 'cancelled';
      job.updatedAt = Date.now();
      return;
    }
    fail(job, error instanceof Error ? error.message : String(error));
  }
}

async function runModelScopeJob(job: DownloadJob, target: ModelScopeTarget, ollamaHost: string) {
  try {
    await pullFromModelScope({
      ...target,
      ollamaHost,
      signal: job.controller.signal,
      onProgress: ({ downloaded, total }) => {
        job.completed = downloaded;
        job.total = total;
        job.layerStatus = 'downloading';
        job.updatedAt = Date.now();
      },
      onStage: (stage) => {
        job.layerStatus = stage;
        job.updatedAt = Date.now();
      }
    });
    done(job);
  } catch (error) {
    if (job.controller.signal.aborted) {
      job.status = 'cancelled';
      job.layerStatus = 'cancelled';
      job.updatedAt = Date.now();
      return;
    }
    fail(job, error instanceof Error ? error.message : String(error));
  }
}

function readString(body: Record<string, unknown>, key: string): string {
  return typeof body[key] === 'string' ? (body[key] as string).trim() : '';
}

function startFromBody(body: Record<string, unknown>, ollamaHost: string): DownloadJobSnapshot {
  const kind = readString(body, 'kind') || 'pull';

  if (kind === 'modelscope') {
    const namespace = readString(body, 'namespace');
    const name = readString(body, 'name');
    const file = readString(body, 'file');
    if (!namespace || !name || !file) {
      throw new GgufImportError('缺少 namespace / name / file。', 400);
    }
    // 先校验路径，避免为非法参数创建必然失败的任务
    buildModelScopeFileUrl({
      namespace,
      name,
      file,
      revision: readString(body, 'revision') || undefined
    });
    const key = `modelscope:${namespace}/${name}/${file}`;
    const running = findRunning(key);
    if (running) return snapshot(running);

    const target: ModelScopeTarget = {
      namespace,
      name,
      file,
      revision: readString(body, 'revision') || undefined,
      model: readString(body, 'model') || undefined
    };
    const job = createJob('modelscope', key, `${namespace}/${name}`, 'downloading', target);
    void runModelScopeJob(job, target, ollamaHost);
    return snapshot(job);
  }

  const model = readString(body, 'model');
  if (!model) throw new GgufImportError('缺少 model。', 400);

  const key = `pull:${model}`;
  const running = findRunning(key);
  if (running) return snapshot(running);

  const job = createJob('pull', key, model, 'pulling manifest');
  void runPullJob(job, ollamaHost);
  return snapshot(job);
}

function sendJson(response: ServerResponse, status: number, payload: unknown) {
  response.statusCode = status;
  response.setHeader('content-type', 'application/json');
  response.setHeader('cache-control', 'no-store');
  response.end(JSON.stringify(payload));
}

/**
 * `POST /api/downloads` 新建/复用任务，`GET /api/downloads` 列出任务，
 * `GET /api/downloads/<id>` 取单个，`DELETE /api/downloads/<id>` 取消。
 * Express 与 Vite 都会剥掉挂载前缀，因此这里只看到 `<id>` 或 `/`。
 */
export async function handleDownloadsRequest(
  request: IncomingMessage,
  response: ServerResponse,
  ollamaHost: string
): Promise<void> {
  prune();
  const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
  const id = pathname.replace(/^\/+/, '');

  try {
    if (request.method === 'POST' && !id) {
      sendJson(response, 200, startFromBody(await readJsonBody(request), ollamaHost));
      return;
    }

    if (request.method === 'GET' && !id) {
      sendJson(response, 200, { jobs: Array.from(jobs.values()).map(snapshot) });
      return;
    }

    if (!id) {
      sendJson(response, 405, { error: '不支持的方法。' });
      return;
    }

    const job = jobs.get(id);
    if (!job) {
      sendJson(response, 404, { error: '任务不存在或已过期。' });
      return;
    }

    if (request.method === 'GET') {
      sendJson(response, 200, snapshot(job));
      return;
    }

    if (request.method === 'DELETE') {
      if (job.status === 'running') {
        job.controller.abort();
        job.status = 'cancelled';
        job.layerStatus = 'cancelled';
        job.updatedAt = Date.now();
      }
      sendJson(response, 200, snapshot(job));
      return;
    }

    sendJson(response, 405, { error: '不支持的方法。' });
  } catch (error) {
    const status = error instanceof GgufImportError ? error.status : 500;
    const message = error instanceof Error ? error.message : String(error);
    sendJson(response, status, { error: message });
  }
}
