export type NavScreen = 'chat' | 'models' | 'pull' | 'modelfile-lab' | 'telemetry-settings';

export type ModelCategory = 'all' | 'llm' | 'vision' | 'code' | 'embedding';

export interface OllamaModel {
  id: string;
  name: string;
  tag: string;
  fullTag: string;
  category: 'llm' | 'vision' | 'code' | 'embedding';
  categoryLabel: string;
  description: string;
  descriptionEn?: string;
  quantization: string;
  size: string;
  sizeGb: number;
  context: string;
  speed?: string;
  status: 'running' | 'idle';
  vramUsage?: string;
  sizeVramBytes?: number;
  gpuLayers?: string;
  kvCache?: string;
  lastUsed?: string;
  lastUsedEn?: string;
  note?: string;
  capabilities?: string[];
  icon: string;
  iconBg: string;
  iconColor: string;
  parameters: {
    temperature: number;
    topP: number;
    numCtx: number;
    repeatPenalty: number;
  };
  modelfile: {
    from: string;
    stop: string;
    temperature: number;
    system: string;
  };
}

export interface CuratedHubModel {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  descriptionEn?: string;
  category: 'reason' | 'general' | 'code' | 'vision';
  hardwareFit: string;
  hardwareFitEn?: string;
  hardwareFitColor: 'green' | 'yellow' | 'purple';
  sizes: string[];
  activeSize: string;
  sizeGb: string;
  pullCount: string;
  icon: string;
  iconBg: string;
  iconColor: string;
  tagNote?: string;
  tagNoteEn?: string;
}

export interface DownloadTask {
  id: string;
  modelName: string;
  quant: string;
  layerStatus: string;
  speed: string;
  remainingTime: string;
  progress: number;
  downloadedGb: number;
  totalGb: number;
  targetPath: string;
  sha256: string;
  isPaused: boolean;
  isActive: boolean;
  isComplete?: boolean;
  isInterrupted?: boolean;
  error?: string;
}

export interface ChatAttachment {
  id: string;
  kind: 'image' | 'video';
  name: string;
  mimeType: string;
  /** JPEG data URLs. A video contributes one URL per sampled frame. */
  dataUrls: string[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  modelName?: string;
  attachments?: ChatAttachment[];
  duration?: string;
  thinkingTime?: string;
  thinkingTokens?: number;
  thinkingContent?: string;
  targetPlatform?: string;
  codeSnippet?: {
    filename: string;
    language: string;
    code: string;
  };
  totalTokens?: number;
  tokensPerSecond?: number;
}

export interface DaemonConfig {
  host: string;
  modelsPath: string;
  numParallel: number;
  keepAlive: '5m' | '15m' | '1h' | 'forever';
  flashAttention: boolean;
}

export interface DaemonLog {
  id: string;
  timestamp: string;
  module: 'system' | 'server' | 'runner' | 'http' | 'gc' | 'telemetry' | 'stream';
  level?: 'info' | 'warn' | 'success' | 'detail';
  text: string;
}
