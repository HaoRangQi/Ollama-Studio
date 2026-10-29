import { describe, expect, it } from 'vitest';
import {
  buildDaemonCommands,
  parseLaunchctlList,
  parsePgrep,
  parsePsForOllamaApp,
  resolveDaemonManager,
  resolveExecutable
} from './daemon';

describe('parseLaunchctlList', () => {
  it('读取 ollama 的 label 与运行中 PID', () => {
    const output = [
      'PID\tStatus\tLabel',
      '-\t0\tcom.ollama.ollama',
      '6928\t0\tapplication.com.electron.ollama.1',
      '7001\t0\thomebrew.mxcl.ollama'
    ].join('\n');

    expect(parseLaunchctlList(output)).toEqual([
      { label: 'com.ollama.ollama', pid: undefined },
      { label: 'homebrew.mxcl.ollama', pid: 7001 }
    ]);
  });
});

describe('parsePsForOllamaApp', () => {
  it('识别 Ollama.app 主进程，不误匹配命令行参数中的同名文本', () => {
    const output = [
      '  123 /Applications/Ollama.app/Contents/MacOS/Ollama --hidden',
      '  456 /Applications/Ollama.app/Contents/Resources/ollama serve'
    ].join('\n');

    expect(parsePsForOllamaApp(output)).toBe(123);
  });
});

describe('parsePgrep', () => {
  it('忽略空行与非数字', () => {
    expect(parsePgrep('6967\n\n7200\n')).toEqual([6967, 7200]);
  });
});

describe('buildDaemonCommands', () => {
  it('Ollama.app 启动用 open，停止结束 app 主进程', () => {
    // AppleScript 的 quit 实测会弹 Automation 权限并以 -128 失败；
    // app 主进程是 serve 的父进程，结束它 serve 随之退出。
    expect(buildDaemonCommands('ollama-app', undefined, 501, 6928)).toEqual({
      start: 'open -a Ollama',
      stop: 'kill 6928',
      restart: 'kill 6928 && sleep 1 && open -a Ollama'
    });
  });

  it('Ollama.app 未运行时不给 stop/restart 命令', () => {
    expect(buildDaemonCommands('ollama-app')).toEqual({
      start: 'open -a Ollama',
      stop: undefined,
      restart: undefined
    });
  });

  it('launchd 使用 kickstart 与 TERM', () => {
    expect(buildDaemonCommands('launchd', 'com.ollama.ollama', 501)).toEqual({
      start: 'launchctl kickstart -k gui/501/com.ollama.ollama',
      restart: 'launchctl kickstart -k gui/501/com.ollama.ollama',
      stop: 'launchctl kill TERM gui/501/com.ollama.ollama'
    });
  });

  it('Homebrew 与 systemd 使用各自的服务命令', () => {
    expect(buildDaemonCommands('brew')).toEqual({
      start: 'brew services start ollama',
      restart: 'brew services restart ollama',
      stop: 'brew services stop ollama'
    });
    expect(buildDaemonCommands('systemd')).toEqual({
      start: 'sudo systemctl start ollama',
      restart: 'sudo systemctl restart ollama',
      stop: 'sudo systemctl stop ollama'
    });
  });

  it('普通进程只给后台启动命令，不自动停止或重启', () => {
    // `&` 与输出重定向缺一不可：execFile 用 pipe 接管 stdout，
    // 只加 `&` 会让后台进程继承管道，请求阻塞到 timeout。
    expect(buildDaemonCommands('process')).toEqual({
      start: 'ollama serve >/dev/null 2>&1 &',
      restart: undefined,
      stop: undefined
    });
  });

  it('未安装时不给任何命令', () => {
    expect(buildDaemonCommands('unknown')).toEqual({
      start: undefined,
      restart: undefined,
      stop: undefined
    });
  });

  it('拒绝含 shell 字符的 launchd label', () => {
    expect(buildDaemonCommands('launchd', 'com.ollama;rm -rf /', 501)).toEqual({
      start: undefined,
      restart: undefined,
      stop: undefined
    });
  });
});

describe('resolveExecutable', () => {
  it('由命令是否存在推导，普通进程只有 start 可执行', () => {
    expect(resolveExecutable('process', buildDaemonCommands('process'))).toEqual({
      start: true,
      restart: false,
      stop: false
    });
  });

  it('systemd 命令含 sudo，三个 action 都不可自动执行', () => {
    // 不能按"有命令即可执行"推导：sudo 需要密码，静默执行会失败。
    expect(resolveExecutable('systemd', buildDaemonCommands('systemd'))).toEqual({
      start: false,
      restart: false,
      stop: false
    });
  });

  it('Ollama.app 运行中时三个 action 都可执行', () => {
    expect(
      resolveExecutable('ollama-app', buildDaemonCommands('ollama-app', undefined, 501, 6928))
    ).toEqual({
      start: true,
      restart: true,
      stop: true
    });
  });

  it('Ollama.app 未运行时只有 start 可执行', () => {
    expect(resolveExecutable('ollama-app', buildDaemonCommands('ollama-app'))).toEqual({
      start: true,
      restart: false,
      stop: false
    });
  });

  it('launchd 与 brew 三个 action 都可执行', () => {
    expect(
      resolveExecutable('launchd', buildDaemonCommands('launchd', 'com.ollama.ollama', 501))
    ).toEqual({ start: true, restart: true, stop: true });
    expect(resolveExecutable('brew', buildDaemonCommands('brew'))).toEqual({
      start: true,
      restart: true,
      stop: true
    });
  });

  it('unknown 没有任何可执行 action', () => {
    expect(resolveExecutable('unknown', buildDaemonCommands('unknown'))).toEqual({
      start: false,
      restart: false,
      stop: false
    });
  });
});

describe('resolveDaemonManager', () => {
  it('app 已安装但 serve 未运行时仍判为 ollama-app', () => {
    // 回归：com.ollama.ollama 这个 label 实际指向 Squirrel 更新器，
    // 对它 kickstart 拉不起服务，因此不能因 serve 未运行就退判成 launchd。
    expect(
      resolveDaemonManager({
        appInstalled: true,
        systemdActive: false,
        launchdLabel: 'com.ollama.ollama',
        pids: []
      })
    ).toBe('ollama-app');
  });

  it('app 在运行中时判为 ollama-app', () => {
    expect(
      resolveDaemonManager({ appPid: 1234, appInstalled: true, systemdActive: false, pids: [] })
    ).toBe('ollama-app');
  });

  it('未安装 app 时 Homebrew label 判为 brew', () => {
    expect(
      resolveDaemonManager({
        appInstalled: false,
        systemdActive: false,
        launchdLabel: 'homebrew.mxcl.ollama',
        pids: []
      })
    ).toBe('brew');
  });

  it('未安装 app 时其他 launchd label 判为 launchd', () => {
    expect(
      resolveDaemonManager({
        appInstalled: false,
        systemdActive: false,
        launchdLabel: 'com.ollama.ollama',
        pids: []
      })
    ).toBe('launchd');
  });

  it('Linux systemd 优先于其他信号', () => {
    expect(
      resolveDaemonManager({
        appInstalled: false,
        systemdActive: true,
        launchdLabel: 'homebrew.mxcl.ollama',
        pids: []
      })
    ).toBe('systemd');
  });

  it('只有裸进程时判为 process', () => {
    expect(resolveDaemonManager({ appInstalled: false, systemdActive: false, pids: [7001] })).toBe(
      'process'
    );
  });

  it('没有任何信号时判为 unknown', () => {
    expect(resolveDaemonManager({ appInstalled: false, systemdActive: false, pids: [] })).toBe(
      'unknown'
    );
  });
});
