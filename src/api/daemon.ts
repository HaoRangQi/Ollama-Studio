import { proxyAuthHeaders } from './ollama';

export type DaemonManager = 'ollama-app' | 'launchd' | 'brew' | 'systemd' | 'process' | 'unknown';

export interface DaemonInfo {
  platform: string;
  running: boolean;
  manager: DaemonManager;
  label?: string;
  pid?: number;
  restartCommand?: string;
  stopCommand?: string;
  canExecute: boolean;
  controlEnabled: boolean;
}

export type DaemonAction = 'restart' | 'stop';

async function readError(response: Response, fallback: string): Promise<string> {
  try {
    const data = (await response.json()) as { error?: string };
    if (data.error) return data.error;
  } catch {
    // Keep the fallback when the server returns non-JSON.
  }
  return fallback;
}

/** 检测 Ollama 由 Ollama.app、launchd、Homebrew、systemd 还是普通进程管理。 */
export async function fetchDaemonInfo(): Promise<DaemonInfo> {
  let response: Response;
  try {
    response = await fetch('/api/daemon', {
      headers: { accept: 'application/json', ...proxyAuthHeaders() }
    });
  } catch (error) {
    throw new Error('无法连接本地服务，无法检测 Ollama 守护进程。', { cause: error });
  }
  if (!response.ok) {
    throw new Error(await readError(response, `守护进程检测失败（HTTP ${response.status}）`));
  }
  return (await response.json()) as DaemonInfo;
}

/**
 * 请求本地服务重启/停止 Ollama。服务端默认拒绝；只有设置
 * `ALLOW_DAEMON_CONTROL=1` 且请求来自 loopback 才会执行。
 */
export async function controlDaemon(action: DaemonAction): Promise<void> {
  let response: Response;
  try {
    response = await fetch('/api/daemon/control', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        ...proxyAuthHeaders()
      },
      body: JSON.stringify({ action, confirm: true })
    });
  } catch (error) {
    throw new Error('无法连接本地服务，无法控制 Ollama 守护进程。', { cause: error });
  }
  if (!response.ok) {
    throw new Error(await readError(response, `服务控制失败（HTTP ${response.status}）`));
  }
}
