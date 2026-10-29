import { execFile } from 'node:child_process';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { promisify } from 'node:util';
import { readJsonBody } from './http';
import { GgufImportError } from './importGguf';

const execFileAsync = promisify(execFile);

export type DaemonManager = 'ollama-app' | 'launchd' | 'brew' | 'systemd' | 'process' | 'unknown';

export type DaemonAction = 'start' | 'restart' | 'stop';

export const DAEMON_ACTIONS: DaemonAction[] = ['start', 'restart', 'stop'];

export interface DaemonInfo {
  platform: NodeJS.Platform;
  running: boolean;
  manager: DaemonManager;
  label?: string;
  pid?: number;
  startCommand?: string;
  restartCommand?: string;
  stopCommand?: string;
  /** 各 action 是否有可执行的命令；由命令是否存在推导，不单独维护。 */
  executable: Record<DaemonAction, boolean>;
  /** `ALLOW_DAEMON_CONTROL=1` 时才会真正执行命令。 */
  controlEnabled: boolean;
  /** 兼容字段：任一 action 可执行即为 true。新代码请用 `executable`。 */
  canExecute: boolean;
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
 * 生成展示与复制用的启动/重启/停止命令。命令只由受控的 manager、label、uid 和
 * appPid 拼接，不接收用户输入；真正执行前仍会经过 `ALLOW_DAEMON_CONTROL` 开关。
 *
 * `process` 的启动命令带 `&` 与输出重定向，缺一不可：`execFile` 用 pipe 接管
 * 子进程 stdout，`&` 只让 shell 不等进程退出，后台进程仍继承该管道导致请求
 * 阻塞到 timeout。实测：`sleep 5` 5015ms、仅 `&` 不重定向 6004ms、
 * `>/dev/null 2>&1 &` 8ms。
 *
 * `ollama-app` 的 stop 用 `kill <appPid>` 而非 AppleScript：实测
 * `osascript -e 'tell application "Ollama" to quit'` 会弹 Automation 权限
 * 对话框并以 `-128`（用户已取消）失败。app 主进程是 serve 的父进程，
 * 结束它 serve 会随之退出；反过来只 pkill serve 会被 app 重新拉起。
 */
export function buildDaemonCommands(
  manager: DaemonManager,
  label?: string,
  uid = typeof process.getuid === 'function' ? process.getuid() : 501,
  appPid?: number
): Record<DaemonAction, string | undefined> {
  if (manager === 'ollama-app') {
    // appPid 缺失时（装了 app 但没在跑）stop/restart 无意义，交给幂等短路。
    const stop = appPid ? `kill ${appPid}` : undefined;
    return {
      start: 'open -a Ollama',
      stop,
      restart: stop ? `kill ${appPid} && sleep 1 && open -a Ollama` : undefined
    };
  }
  if (manager === 'launchd' && label && /^[a-zA-Z0-9._-]+$/.test(label)) {
    const domain = `gui/${uid}/${label}`;
    return {
      start: `launchctl kickstart -k ${domain}`,
      restart: `launchctl kickstart -k ${domain}`,
      stop: `launchctl kill TERM ${domain}`
    };
  }
  if (manager === 'brew') {
    return {
      start: 'brew services start ollama',
      restart: 'brew services restart ollama',
      stop: 'brew services stop ollama'
    };
  }
  if (manager === 'systemd') {
    return {
      start: 'sudo systemctl start ollama',
      restart: 'sudo systemctl restart ollama',
      stop: 'sudo systemctl stop ollama'
    };
  }
  if (manager === 'process') {
    // 命令行形式安装且无人托管：只负责拉起来，生命周期由 Ollama 自己管。
    return {
      start: 'ollama serve >/dev/null 2>&1 &',
      restart: undefined,
      stop: undefined
    };
  }
  return { start: undefined, restart: undefined, stop: undefined };
}

/**
 * 可执行矩阵。systemd 命令含 sudo，不能按"有命令即可执行"推导，
 * 需要显式排除；其余 manager 都由命令是否存在推导。
 */
export function resolveExecutable(
  manager: DaemonManager,
  commands: Record<DaemonAction, string | undefined>
): Record<DaemonAction, boolean> {
  if (manager === 'systemd') return { start: false, restart: false, stop: false };
  return {
    start: Boolean(commands.start),
    restart: Boolean(commands.restart),
    stop: Boolean(commands.stop)
  };
}

export interface ManagerSignals {
  /** Ollama.app 主进程 PID。 */
  appPid?: number;
  /** `/Applications/Ollama.app` 是否存在。 */
  appInstalled: boolean;
  systemdActive: boolean;
  launchdLabel?: string;
  /** `pgrep -x ollama` 得到的 PID 列表。 */
  pids: number[];
}

/**
 * 判定管理方式。Ollama.app 已安装时优先判为 `ollama-app`：serve 由 app 主进程
 * 自行拉起，launchd 里的 `com.ollama.ollama` 实为 Squirrel 更新器
 * （`program identifier = .../Squirrel.framework/.../Squirrel`，`mode: 2`），
 * 对它 kickstart 拉不起服务。未安装 app 时该 label 才可能对应真实服务。
 */
export function resolveDaemonManager(signals: ManagerSignals): DaemonManager {
  if (signals.appPid !== undefined || signals.appInstalled) return 'ollama-app';
  if (signals.systemdActive) return 'systemd';
  if (signals.launchdLabel?.startsWith('homebrew.mxcl.')) return 'brew';
  if (signals.launchdLabel) return 'launchd';
  if (signals.pids.length > 0) return 'process';
  return 'unknown';
}

/** 只读检测 Ollama 的进程与服务管理方式，不执行任何控制命令。 */
export async function detectDaemon(): Promise<DaemonInfo> {
  const platform = process.platform;
  const controlEnabled = (process.env.ALLOW_DAEMON_CONTROL || '').trim() === '1';
  const pids: number[] = [];
  let appPid: number | undefined;
  let appInstalled = false;
  let launchdEntry: LaunchdEntry | undefined;
  let systemdActive = false;

  if (platform === 'darwin') {
    const [psResult, launchdResult, appCheck] = await Promise.all([
      run('ps', ['-axo', 'pid=,command=']),
      run('launchctl', ['list']),
      // 路径写死，不接收用户输入；装在 ~/Applications 时退化为 launchd 判定。
      run('test', ['-d', '/Applications/Ollama.app'])
    ]);
    appPid = parsePsForOllamaApp(psResult.stdout);
    appInstalled = appCheck.ok;
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

  const manager = resolveDaemonManager({
    appPid,
    appInstalled,
    systemdActive,
    launchdLabel: launchdEntry?.label,
    pids
  });

  const commands = buildDaemonCommands(manager, launchdEntry?.label, undefined, appPid);
  const executable = resolveExecutable(manager, commands);
  const running =
    appPid !== undefined || pids.length > 0 || launchdEntry?.pid !== undefined || systemdActive;

  return {
    platform,
    running,
    manager,
    label: launchdEntry?.label,
    pid: appPid ?? pids[0] ?? launchdEntry?.pid,
    startCommand: commands.start,
    restartCommand: commands.restart,
    stopCommand: commands.stop,
    executable,
    canExecute: executable.start || executable.restart || executable.stop,
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
 * `POST /api/daemon/control`，请求体 `{ action: 'start' | 'restart' | 'stop', confirm: true }`。
 *
 * 默认只读：必须设置 `ALLOW_DAEMON_CONTROL=1`，并且请求来自 loopback，
 * 才允许执行检测到的服务管理命令。systemd 命令含 sudo，`unknown` 无命令，
 * 均不自动执行。start/stop 在状态已符合目标时短路返回，避免对未运行的
 * 服务执行 `launchctl kill TERM`（exit 3）之类的无效报错。
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
    const requested = (DAEMON_ACTIONS as string[]).includes(body.action as string)
      ? (body.action as DaemonAction)
      : null;
    if (!requested) throw new GgufImportError('action 必须是 start、restart 或 stop。', 400);
    if (body.confirm !== true) throw new GgufImportError('需要 confirm: true 才能执行。', 400);

    // 服务未运行时 restart 没有可 kill 的 PID，语义上等价于 start；
    // 先归一化再校验，否则 restart 会在恰好停止时误报"不支持"。
    const action: DaemonAction =
      requested === 'restart' && !info.running && info.executable.start ? 'start' : requested;
    if (!info.executable[action]) {
      throw new GgufImportError(
        `当前管理方式（${info.manager}）不支持自动${action === 'start' ? '启动' : action === 'restart' ? '重启' : '停止'}，请复制命令手动运行。`,
        409
      );
    }

    // 幂等：状态已符合目标时不发命令，省掉一次无效执行与随之而来的报错。
    const alreadySatisfied =
      (action === 'start' && info.running) || (action === 'stop' && !info.running);
    if (alreadySatisfied) {
      writeJson(response, 200, {
        ok: true,
        action,
        requested,
        manager: info.manager,
        already: true
      });
      return;
    }

    const command =
      action === 'start'
        ? info.startCommand
        : action === 'restart'
          ? info.restartCommand
          : info.stopCommand;
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
      requested,
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
