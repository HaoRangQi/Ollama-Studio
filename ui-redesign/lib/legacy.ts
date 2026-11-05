/**
 * Read-only boundary to the existing Ollama Studio business logic.
 * Nothing under src/ is modified by the redesigned UI.
 */
export {
  OLLAMA_BASE,
  OllamaError,
  createModel,
  deleteModel,
  getConnection,
  getRunning,
  getTags,
  getVersion,
  loadModel,
  pullModel,
  streamChat,
  unloadModel
} from '../../src/api/ollama';
export type {
  CreateModelRequest,
  KeepAliveOptions,
  OllamaChatChunk,
  OllamaChatRequest,
  OllamaRunning,
  OllamaTag
} from '../../src/api/ollama';

export { mapOllamaModel, mapOllamaModels } from '../../src/api/ollamaMapper';

export { cancelDownloadJob, listDownloadJobs, startDownloadJob } from '../../src/api/downloads';
export type {
  DownloadJob,
  DownloadJobInput,
  DownloadJobStatus,
  HuggingFaceTarget,
  ModelScopeTarget
} from '../../src/api/downloads';

export { fetchSystemMetrics } from '../../src/api/metrics';
export type {
  CpuMetrics,
  DiskMetrics,
  GpuMetrics,
  MemoryMetrics,
  SystemMetrics
} from '../../src/api/metrics';

export { controlDaemon, fetchDaemonInfo } from '../../src/api/daemon';
export type { DaemonAction, DaemonInfo, DaemonManager } from '../../src/api/daemon';

export { cleanupCache, fetchCacheReport, revealCachePath } from '../../src/api/cache';
export type { CacheReport, CleanupResult, CleanupTarget } from '../../src/api/cache';

export {
  extractQuants,
  findQuantFile,
  searchHuggingFaceCatalog,
  searchModelScopeCatalog,
  searchOllamaCatalog
} from '../../src/api/catalog';
export type { CatalogSearchResult, CatalogSource } from '../../src/api/catalog';

export {
  defaultSettings,
  formatKeepAlive,
  loadModelSettings,
  saveModelSettings
} from '../../src/lib/modelSettings';
export type { KeepAlive, ModelSettings } from '../../src/lib/modelSettings';

export {
  createSession,
  deriveSessionTitle,
  getActiveSession,
  getSessions,
  loadChatStore,
  removeSession,
  saveChatStore,
  setActiveSession,
  updateSessionMessages,
  upsertSession
} from '../../src/lib/chatSessions';
export type { ChatSession, ChatStore } from '../../src/lib/chatSessions';

export { parseMessageSegments } from '../../src/lib/markdown';
export type { MessageSegment } from '../../src/lib/markdown';

export type { ChatAttachment, ChatMessage, OllamaModel } from '../../src/types';
