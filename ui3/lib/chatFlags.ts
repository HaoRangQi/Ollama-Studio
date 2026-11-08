import { readStorageJson, writeStorageJson } from './legacy';

export const CHAT_FLAGS_KEY = 'ollama_ui3_chat_flags_v1';
export const PERSONAS_KEY = 'ollama_ui3_personas_v1';

export interface ChatFlags {
  forceJson: boolean;
  showThinking: boolean;
  stream: boolean;
  /** 0 表示不发送 num_predict，使用模型默认值。 */
  numPredict: number;
}

export function defaultChatFlags(showThinking: boolean): ChatFlags {
  return { forceJson: false, showThinking, stream: true, numPredict: 0 };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function loadChatFlags(modelTag: string, fallback: ChatFlags): ChatFlags {
  if (!modelTag) return fallback;
  const all = readStorageJson<unknown>(CHAT_FLAGS_KEY, {});
  if (!isRecord(all)) return fallback;
  const value = all[modelTag];
  if (!isRecord(value)) return fallback;
  return {
    forceJson: typeof value.forceJson === 'boolean' ? value.forceJson : fallback.forceJson,
    showThinking:
      typeof value.showThinking === 'boolean' ? value.showThinking : fallback.showThinking,
    stream: typeof value.stream === 'boolean' ? value.stream : fallback.stream,
    numPredict:
      typeof value.numPredict === 'number' && Number.isFinite(value.numPredict)
        ? Math.max(0, Math.min(32768, Math.round(value.numPredict)))
        : fallback.numPredict
  };
}

export function saveChatFlags(modelTag: string, flags: ChatFlags): void {
  if (!modelTag) return;
  const all = readStorageJson<Record<string, unknown>>(CHAT_FLAGS_KEY, {});
  all[modelTag] = flags;
  writeStorageJson(CHAT_FLAGS_KEY, all);
}

export function loadPersona(modelTag: string): string {
  if (!modelTag) return '';
  const all = readStorageJson<Record<string, unknown>>(PERSONAS_KEY, {});
  const value = all[modelTag];
  return typeof value === 'string' ? value : '';
}

export function savePersona(modelTag: string, persona: string): void {
  if (!modelTag) return;
  const all = readStorageJson<Record<string, unknown>>(PERSONAS_KEY, {});
  all[modelTag] = persona;
  writeStorageJson(PERSONAS_KEY, all);
}
