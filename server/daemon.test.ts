import { describe, expect, it } from 'vitest';
import { buildDaemonCommands, parseLaunchctlList, parsePgrep, parsePsForOllamaApp } from './daemon';

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
  it('Ollama.app 使用 AppleScript 退出并重新打开', () => {
    expect(buildDaemonCommands('ollama-app')).toEqual({
      stop: `osascript -e 'tell application "Ollama" to quit'`,
      restart: `osascript -e 'tell application "Ollama" to quit' && sleep 1 && open -a Ollama`
    });
  });

  it('launchd 使用 kickstart 与 TERM', () => {
    expect(buildDaemonCommands('launchd', 'com.ollama.ollama', 501)).toEqual({
      restart: 'launchctl kickstart -k gui/501/com.ollama.ollama',
      stop: 'launchctl kill TERM gui/501/com.ollama.ollama'
    });
  });

  it('Homebrew 与 systemd 使用各自的服务命令', () => {
    expect(buildDaemonCommands('brew').restart).toBe('brew services restart ollama');
    expect(buildDaemonCommands('systemd').restart).toBe('sudo systemctl restart ollama');
  });

  it('普通进程没有可执行的自动重启命令', () => {
    expect(buildDaemonCommands('process')).toEqual({});
  });

  it('拒绝含 shell 字符的 launchd label', () => {
    expect(buildDaemonCommands('launchd', 'com.ollama;rm -rf /', 501)).toEqual({});
  });
});
