import { execFile } from 'node:child_process';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { promisify } from 'node:util';
import { readJsonBody } from './http';
import { GgufImportError } from './importGguf';

const execFileAsync = promisify(execFile);

export type DaemonManager = 'ollama-app' | 'launchd' | 'brew' | 'systemd' | 'process' | 'unknown';

export interface DaemonInfo {
  platform: NodeJS.Platform;
  running: boolean;
  manager: DaemonManager;
  label?: string;
  pid?: number;
  restartCommand?: string;
  stopCommand?: string;
  /** 当前管理方式是否支持由本服务执行（仍需显式开启控制开关）。 */
  canExecute: boolean;
  /** `ALLOW_DAEMON_CONTROL=1` 时才会真正执行命令。 */
  controlEnabled: boolean;
}

interface LaunchdEntry {
  label: string;
  pid?: number;
}

interface RunResult {
  ok: boolean;
  stdout: string;
}

async function run(command: string, args: string[], timeout = 2000): Promise<RunResult> {
  try {
    const { stdout } = await execFileAsync(command, args, {
      timeout,
      maxBuffer: 2 * 1024 * 1024,
      encoding: 'utf8'
    });
    return { ok: true, stdout };
  } catch (error) {
    const stdout = (error as { stdout?: unknown }).stdout;
    return { ok: false, stdout: typeof stdout === 'string' ? stdout : '' };
  }
}

/** 解析 `launchctl list` 的 `PID Status Label` 行。 */
export function parseLaunchctlList(output: string): LaunchdEntry[] {
  const entries: LaunchdEntry[] = [];
  for (const line of output.split('\n')) {
    const match = /^(\S+)\s+(-?\d+)\s+(\S+)$/.exec(line.trim());
    if (!match) continue;
    const [, pidText, , label] = match;
    if (label !== 'com.ollama.ollama' && !label.startsWith('homebrew.mxcl.ollama')) continue;
    const pid = pidText === '-' ? undefined : Number(pidText);
    entries.push({
      label,
      pid: pid !== undefined && Number.isInteger(pid) && pid > 0 ? pid : undefined
    });
  }
  return entries;
}

/** 从 `ps -axo pid=,command=` 中找 Ollama.app 主进程。 */
export function parsePsForOllamaApp(output: string): number | undefined {
  for (const line of output.split('\n')) {
    const match = /^\s*(\d+)\s+(.*)$/.exec(line);
    if (!match) continue;
    if (/Ollama\.app\/Contents\/MacOS\/Ollama(?:\s|$)/.test(match[2])) {
      return Number(match[1]);
    }
  }
  return undefined;
}

/** 解析 `pgrep -x ollama` 的 PID 列表。 */
export function parsePgrep(output: string): number[] {
  return output
    .split(/\s+/)
    .map((part) => Number(part))
    .filter((pid) => Number.isInteger(pid) && pid > 0);
}

/**
 * 生成展示与复制用的重启/停止命令。命令只由受控的 manager、label 和 uid
 * 拼接，不接收用户输入；真正执行前仍会经过 `ALLOW_DAEMON_CONTROL` 开关。
 */
export function buildDaemonCommands(
  manager: DaemonManager,
  label?: string,
  uid = typeof process.getuid === 'function' ? process.getuid() : 501
): { restart?: string; stop?: string } {
  if (manager === 'ollama-app') {
    return {
      stop: `osascript -e 'tell application "Ollama" to quit'`,
      restart: `osascript -e 'tell application "Ollama" to quit' && sleep 1 && open -a Ollama`
    };
  }
  if (manager === 'launchd' && label && /^[a-zA-Z0-9._-]+$/.test(label)) {
    const domain = `gui/${uid}/${label}`;
    return {
      restart: `launchctl kickstart -k ${domain}`,
      stop: `launchctl kill TERM ${domain}`
    };
  }
  if (manager === 'brew') {
    return {
      restart: 'brew services restart ollama',
      stop: 'brew services stop ollama'
    };
  }
  if (manager === 'systemd') {
    return {
      restart: 'sudo systemctl restart ollama',
      stop: 'sudo systemctl stop ollama'
    };
  }
  return {};
}

/** 只读检测 Ollama 的进程与服务管理方式，不执行任何控制命令。 */
export async function detectDaemon(): Promise<DaemonInfo> {
  const platform = process.platform;
  const controlEnabled = (process.env.ALLOW_DAEMON_CONTROL || '').trim() === '1';
  const pids: number[] = [];
  let appPid: number | undefined;
  let launchdEntry: LaunchdEntry | undefined;
  let systemdActive = false;

  if (platform === 'darwin') {
    const [psResult, launchdResult] = await Promise.all([
      run('ps', ['-axo', 'pid=,command=']),
      run('launchctl', ['list'])
    ]);
    appPid = parsePsForOllamaApp(psResult.stdout);
    const entries = parseLaunchctlList(launchdResult.stdout);
    launchdEntry =
      entries.find((entry) => entry.label === 'com.ollama.ollama') ??
      entries.find((entry) => entry.label === 'homebrew.mxcl.ollama') ??
      entries[0];
  } else if (platform === 'linux') {
    const systemdResult = await run('systemctl', [
      'show',
      '-p',
      'ActiveState',
      '--value',
      'ollama'
    ]);
    systemdActive = systemdResult.ok && systemdResult.stdout.trim() === 'active';
  }

  if (platform !== 'win32') {
    const pgrepResult = await run('pgrep', ['-x', 'ollama']);
    pids.push(...parsePgrep(pgrepResult.stdout));
  }

  let manager: DaemonManager = 'unknown';
  if (appPid) {
    manager = 'ollama-app';
  } else if (systemdActive) {
    manager = 'systemd';
  } else if (launchdEntry) {
    manager = launchdEntry.label.startsWith('homebrew.mxcl.') ? 'brew' : 'launchd';
  } else if (pids.length > 0) {
    manager = 'process';
  }

  const commands = buildDaemonCommands(manager, launchdEntry?.label);
  const running =
    appPid !== undefined || pids.length > 0 || launchdEntry?.pid !== undefined || systemdActive;
  const canExecute = manager === 'ollama-app' || manager === 'launchd' || manager === 'brew';

  return {
    platform,
    running,
    manager,
    label: launchdEntry?.label,
    pid: appPid ?? pids[0] ?? launchdEntry?.pid,
    restartCommand: commands.restart,
    stopCommand: commands.stop,
    canExecute,
    controlEnabled
  };
}

function writeJson(response: ServerResponse, status: number, payload: unknown): void {
  response.statusCode = status;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.setHeader('cache-control', 'no-store');
  response.end(JSON.stringify(payload));
}

/** `GET /api/daemon`：返回检测结果与可复制的命令，不执行任何操作。 */
export async function handleDaemonRequest(
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  if (request.method !== 'GET') {
    writeJson(response, 405, { error: '仅支持 GET。' });
    return;
  }
  try {
    writeJson(response, 200, await detectDaemon());
  } catch (error) {
    writeJson(response, 500, {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

function isLoopback(address: string | undefined): boolean {
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

/**
 * `POST /api/daemon/control`，请求体 `{ action: 'restart' | 'stop', confirm: true }`。
 *
 * 默认只读：必须设置 `ALLOW_DAEMON_CONTROL=1`，并且请求来自 loopback，
 * 才允许执行检测到的服务管理命令。Ollama.app / launchd / Homebrew 之外的
 * 管理方式（systemd、普通进程）不自动执行，避免 sudo 或误杀。
 */
export async function handleDaemonControlRequest(
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  if (request.method !== 'POST') {
    writeJson(response, 405, { error: '仅支持 POST。' });
    return;
  }
  if (!isLoopback(request.socket.remoteAddress)) {
    writeJson(response, 403, { error: '只允许本机请求执行服务控制。' });
    return;
  }

  const info = await detectDaemon();
  if (!info.controlEnabled) {
    writeJson(response, 403, {
      error: '自动控制未启用。设置 ALLOW_DAEMON_CONTROL=1 并重启本应用后可执行。',
      info
    });
    return;
  }

  try {
    const body = await readJsonBody(request);
    const action = body.action === 'stop' ? 'stop' : body.action === 'restart' ? 'restart' : null;
    if (!action) throw new GgufImportError('action 必须是 restart 或 stop。', 400);
    if (body.confirm !== true) throw new GgufImportError('需要 confirm: true 才能执行。', 400);
    if (!info.canExecute) {
      throw new GgufImportError('当前管理方式不支持自动执行，请复制命令手动运行。', 409);
    }

    const command = action === 'restart' ? info.restartCommand : info.stopCommand;
    if (!command) throw new GgufImportError('没有可执行的命令。', 409);

    try {
      await execFileAsync('/bin/sh', ['-c', command], {
        timeout: 15000,
        maxBuffer: 1024 * 1024,
        encoding: 'utf8'
      });
    } catch (error) {
      const stderr = (error as { stderr?: unknown }).stderr;
      const detail = typeof stderr === 'string' && stderr.trim() ? `：${stderr.trim()}` : '';
      throw new GgufImportError(`执行失败${detail}`, 502);
    }

    writeJson(response, 200, {
      ok: true,
      action,
      manager: info.manager,
      command
    });
  } catch (error) {
    const status = error instanceof GgufImportError ? error.status : 500;
    writeJson(response, status, {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}
