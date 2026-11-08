export type Screen = 'chat' | 'models' | 'pull' | 'modelfile' | 'telemetry';

export const SCREEN_ORDER: Screen[] = ['chat', 'models', 'pull', 'modelfile', 'telemetry'];

export const SCREEN_HASH: Record<Screen, string> = {
  chat: 'chat',
  models: 'models',
  pull: 'pull',
  modelfile: 'lab',
  telemetry: 'telemetry'
};

export const SCREEN_ICON: Record<Screen, string> = {
  chat: 'forum',
  models: 'deployed_code',
  pull: 'download',
  modelfile: 'code',
  telemetry: 'monitoring'
};

/** 读取 hash；兼容经典界面的旧锚点。 */
export function readScreenFromHash(hash = window.location.hash): Screen | null {
  const value = hash.replace(/^#\/?/, '').toLowerCase();
  if (value === 'chat') return 'chat';
  if (value === 'models') return 'models';
  if (value === 'pull') return 'pull';
  if (value === 'lab' || value === 'modelfile' || value === 'modelfile-lab') return 'modelfile';
  if (value === 'telemetry' || value === 'telemetry-settings') return 'telemetry';
  return null;
}

export function persistScreen(screen: Screen): void {
  try {
    window.localStorage.setItem('ollama_ui3_screen', screen);
  } catch {
    // 存储不可用时仅依赖 hash。
  }
}

export function readPersistedScreen(): Screen | null {
  try {
    const value = window.localStorage.getItem('ollama_ui3_screen');
    if (
      value === 'chat' ||
      value === 'models' ||
      value === 'pull' ||
      value === 'modelfile' ||
      value === 'telemetry'
    ) {
      return value;
    }
  } catch {
    // ignore
  }
  return null;
}
