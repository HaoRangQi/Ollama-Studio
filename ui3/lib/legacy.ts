/**
 * UI3 只读复用现有业务逻辑的边界。
 * `src/`、`ui-legacy/`、`ui-redesign/` 不因 UI3 改动；这里只做重导出。
 */

export {
  OLLAMA_BASE,
  OllamaError,
  copyModel,
  deleteModel,
  getConnection,
  getRunning,
  getTags,
  getVersion,
  importGguf,
  loadModel,
  streamChat,
  unloadModel
} from '../../src/api/ollama';
export type {
  KeepAliveOptions,
  OllamaChatChunk,
  OllamaChatMessage,
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

export { exportModelGguf } from '../../src/api/export';
export type { ExportFile, ExportResult } from '../../src/api/export';

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
export type { CacheItem, CacheReport, CleanupResult, CleanupTarget } from '../../src/api/cache';

export {
  extractQuants,
  findQuantFile,
  isProjectorGguf,
  searchHuggingFaceCatalog,
  searchModelScopeCatalog,
  searchOllamaCatalog
} from '../../src/api/catalog';
export type { CatalogSearchResult, CatalogSource } from '../../src/api/catalog';

export {
  DEFAULT_KEEP_ALIVE,
  defaultSettings,
  formatKeepAlive,
  loadModelSettings,
  normalizeSettings,
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
  renameSession,
  saveChatStore,
  setActiveSession,
  updateSessionMessages,
  upsertSession
} from '../../src/lib/chatSessions';
export type { ChatSession, ChatStore } from '../../src/lib/chatSessions';

export { parseMessageSegments } from '../../src/lib/markdown';
export type { MessageSegment } from '../../src/lib/markdown';

export {
  MAX_ATTACHMENTS,
  attachmentImages,
  createAttachment,
  isSupportedAttachment
} from '../../src/lib/attachments';

export {
  lookupModelOrigin,
  originLabel,
  originUrl,
  recordModelOrigin
} from '../../src/lib/modelOrigin';

export {
  FAVORITE_MODELS_KEY,
  favoriteKeyOf,
  loadFavoriteModels,
  resolveFavoriteQuant,
  saveFavoriteModels,
  toggleFavoriteModel
} from '../../src/lib/favoriteModels';
export type { FavoriteModel } from '../../src/lib/favoriteModels';

export { buildServeCommand } from '../../src/lib/daemonConfig';

export { readStorageJson, removeStorageKey, writeStorageJson } from '../../src/lib/storage';

export type {
  ChatAttachment,
  ChatMessage,
  DaemonConfig,
  DownloadKind,
  DownloadSource,
  HuggingFaceDownloadSource,
  ModelScopeDownloadSource,
  OllamaModel
} from '../../src/types';
