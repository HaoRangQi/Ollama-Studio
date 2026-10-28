import { execFile } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Transform, type Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';

const MAX_IMPORT_BYTES = 20 * 1024 * 1024 * 1024;
const execFileAsync = promisify(execFile);

export class GgufImportError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'GgufImportError';
    this.status = status;
  }
}

export interface GgufImportOptions {
  filename: string;
  model?: string;
  ollamaHost: string;
}

export interface GgufImportResult {
  model: string;
}

let cliCheck: Promise<void> | null = null;

/**
 * Fails fast with a clear message when the server host has no `ollama` CLI.
 * The result is cached because GGUF import requires the CLI for every upload.
 */
export async function assertOllamaCliAvailable(): Promise<void> {
  if (cliCheck) return cliCheck;

  cliCheck = execFileAsync('ollama', ['--version'], {
    timeout: 5000,
    maxBuffer: 1024 * 1024
  })
    .then(() => undefined)
    .catch((error: unknown) => {
      cliCheck = null;
      const details = error as { code?: string; message?: string };
      if (details.code === 'ENOENT') {
        throw new GgufImportError('未找到 ollama CLI；GGUF 导入需要本机安装 Ollama。', 503);
      }
      throw new GgufImportError(`无法执行 ollama CLI：${details.message ?? String(error)}`, 503);
    });

  return cliCheck;
}

export function normalizeGgufModelName(requested: string | undefined, filename: string): string {
  const fallback = path.basename(filename).replace(/\.gguf$/i, '');
  const raw = (requested?.trim() || fallback).toLowerCase();
  const safe = raw
    .replace(/[^a-z0-9._:/-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/:+/g, ':')
    .replace(/^[-/:]+|[-/:]+$/g, '')
    .slice(0, 120);

  if (!safe) {
    throw new GgufImportError('无法从文件名推导模型名，请显式提供 name。');
  }

  return safe.includes(':') ? safe : `${safe}:latest`;
}

/**
 * Registers an existing local GGUF file with Ollama via `ollama create`.
 * Shared by the browser upload path and the ModelScope download path.
 */
export async function createModelFromGguf(
  filePath: string,
  model: string,
  ollamaHost: string
): Promise<void> {
  await assertOllamaCliAvailable();

  const directory = await mkdtemp(path.join(tmpdir(), 'ollama-studio-gguf-'));
  const modelfilePath = path.join(directory, 'Modelfile');
  await writeFile(modelfilePath, `FROM ${filePath}\n`, 'utf8');

  // Ollama's /api/create does not accept a local GGUF path in `from` (it
  // validates the value as a model name), so use the same CLI path that
  // `ollama create` uses. execFile avoids shell interpolation.
  try {
    await execFileAsync('ollama', ['create', model, '-f', modelfilePath], {
      env: { ...process.env, OLLAMA_HOST: ollamaHost },
      timeout: 10 * 60 * 1000,
      maxBuffer: 10 * 1024 * 1024
    });
  } catch (error) {
    const details = error as {
      code?: string;
      stdout?: string;
      stderr?: string;
      message?: string;
    };
    if (details.code === 'ENOENT') {
      throw new GgufImportError('未找到 ollama CLI；GGUF 导入需要本机安装 Ollama。', 503);
    }
    const output = [details.stdout, details.stderr, details.message]
      .filter(Boolean)
      .join('\n')
      // eslint-disable-next-line no-control-regex -- strip ANSI/terminal control characters from CLI output
      .replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, '')
      // eslint-disable-next-line no-control-regex -- strip remaining non-printable control characters
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '')
      .replaceAll(directory, '<临时目录>')
      .trim();
    throw new GgufImportError(`ollama create 失败：${output.slice(0, 800) || '未知错误'}`, 502);
  } finally {
    await rm(directory, { recursive: true, force: true }).catch(() => undefined);
  }
}

/**
 * Stream a browser upload to a temporary GGUF file, then register it with
 * Ollama via /api/create. The temp file is always removed, including on error.
 */
export async function importGgufStream(
  stream: Readable,
  options: GgufImportOptions
): Promise<GgufImportResult> {
  const filename = path.basename(options.filename || '');
  if (!filename.toLowerCase().endsWith('.gguf')) {
    throw new GgufImportError('仅支持 .gguf 文件。');
  }

  const model = normalizeGgufModelName(options.model, filename);
  const directory = await mkdtemp(path.join(tmpdir(), 'ollama-studio-gguf-'));
  const filePath = path.join(directory, 'upload.gguf');
  let received = 0;

  const limiter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      received += chunk.length;
      if (received > MAX_IMPORT_BYTES) {
        callback(new GgufImportError('GGUF 文件超过 20 GB 限制。', 413));
        return;
      }
      callback(null, chunk);
    }
  });

  try {
    await pipeline(stream, limiter, createWriteStream(filePath));

    if (received === 0) {
      throw new GgufImportError('上传的 GGUF 文件为空。');
    }

    await createModelFromGguf(filePath, model, options.ollamaHost);

    return { model };
  } catch (error) {
    if (error instanceof GgufImportError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new GgufImportError(`GGUF 导入失败：${message}`, 502);
  } finally {
    await rm(directory, { recursive: true, force: true }).catch(() => undefined);
  }
}
