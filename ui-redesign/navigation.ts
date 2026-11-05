export const SCREEN_IDS = ['runtime', 'models', 'pull', 'chat', 'modelfile'] as const;

export type ScreenId = (typeof SCREEN_IDS)[number];

const ALIASES: Record<string, ScreenId> = {
  'telemetry-settings': 'runtime',
  'modelfile-lab': 'modelfile'
};

export function screenFromHash(hash: string): ScreenId {
  const raw = hash.replace(/^#/, '').trim();
  if (!raw) return 'runtime';
  if ((SCREEN_IDS as readonly string[]).includes(raw)) return raw as ScreenId;
  return ALIASES[raw] ?? 'runtime';
}

export function isScreenHash(hash: string): boolean {
  const raw = hash.replace(/^#/, '').trim();
  if (!raw) return false;
  return (SCREEN_IDS as readonly string[]).includes(raw) || raw in ALIASES;
}

export function hashForScreen(screen: ScreenId): string {
  return `#${screen}`;
}
