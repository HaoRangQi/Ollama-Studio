import { useCallback, useEffect, useRef, useState } from 'react';
import {
  NavScreen,
  OllamaModel,
  DownloadTask,
  ModelScopeDownloadSource,
  HuggingFaceDownloadSource
} from './types';
import { INITIAL_MODELS } from './data/mockData';
import { ThemeProvider, useAppTheme } from './context/ThemeContext';
import { useOllama } from './hooks/useOllama';
import {
  copyModel,
  createModel,
  deleteModel,
  importGguf,
  loadModel,
  unloadModel
} from './api/ollama';
import type { CreateModelRequest, KeepAliveOptions } from './api/ollama';
import { exportModelGguf } from './api/export';
import {
  cancelDownloadJob,
  getDownloadJob,
  listDownloadJobs,
  startDownloadJob
} from './api/downloads';
import type { DownloadJob } from './api/downloads';
import {
  clearDownloadTask,
  isHuggingFaceTask,
  isModelScopeTask,
  loadDownloadTask,
  saveDownloadTask
} from './lib/downloadTask';
import { recordModelOrigin } from './lib/modelOrigin';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { ConnectionBanner } from './components/ConnectionBanner';
import { CommandPalette } from './components/CommandPalette';
import { PullModal } from './components/PullModal';
import { QuantizationPickerModal } from './components/QuantizationPickerModal';
import { ThemePaletteModal } from './components/ThemePaletteModal';
import { MobileNav } from './components/MobileNav';
import { ModelsScreen } from './screens/ModelsScreen';
import { PullScreen } from './screens/PullScreen';
import { ChatScreen } from './screens/ChatScreen';
import { TelemetryScreen } from './screens/TelemetryScreen';
import { ModelfileLabScreen } from './screens/ModelfileLabScreen';

type ModelScopeDownloadTarget = ModelScopeDownloadSource;
type HuggingFaceDownloadTarget = HuggingFaceDownloadSource;

const formatSpeed = (bytesPerSecond: number) => {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return '—';
  return `${(bytesPerSecond / 1_000_000).toFixed(1)} MB/s`;
};

/**
 * Ollama registry 找不到 manifest 时补充可操作提示：
 * 直接输入 Hugging Face 仓库名（如 unsloth/Qwen3.5-0.8B-GGUF）会走官方 registry 并 404。
 */
const explainPullError = (message: string, model: string, zh: boolean): string => {
  if (!/manifest.*does not exist/i.test(message)) return message;
  if (!model.includes('/') || model.startsWith('hf.co/')) return message;
  return zh
    ? `${message}\n提示：Ollama registry 中没有该路径。若这是 Hugging Face 仓库，请使用 hf.co/${model}:<量化>（应用内会改走本地服务直下）；也可在拉取页选择 Hugging Face / ModelScope 渠道。`
    : `${message}\nHint: Ollama's registry has no such path. For Hugging Face repos use hf.co/${model}:<quant> (the app downloads it via the local server); you can also pick the Hugging Face or ModelScope channel.`;
};

/**
 * 把 `hf.co/<repo>:<quant>` 转成服务端直下任务。
 * 应用内不再把这串命令交给 Ollama，避免其拒绝代理/CDN 的非公网重定向目标。
 */
const parseHuggingFacePullTarget = (modelTag: string): HuggingFaceDownloadTarget | null => {
  if (!/^hf\.co\//i.test(modelTag)) return null;
  const raw = modelTag.replace(/^hf\.co\//i, '').trim();
  if (!raw.includes('/')) return null;
  const colon = raw.lastIndexOf(':');
  const repo = (colon >= 0 ? raw.slice(0, colon) : raw).trim();
  const quant = colon >= 0 ? raw.slice(colon + 1).trim() : '';
  if (!repo) return null;
  return {
    repo,
    file: '',
    quant,
    modelName: `${repo}${quant ? `:${quant}` : ''}`
  };
};

const formatRemaining = (seconds: number, zh: boolean) => {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return zh ? '计算中…' : 'Calculating…';
  }
  if (seconds < 60) {
    return zh ? `预计剩余 ${Math.ceil(seconds)}s` : `${Math.ceil(seconds)}s left`;
  }
  const minutes = Math.floor(seconds / 60);
  const rest = Math.ceil(seconds % 60);
  return zh ? `预计剩余 ${minutes}m ${rest}s` : `${minutes}m ${rest}s left`;
};

const IDLE_DOWNLOAD_TASK: DownloadTask = {
  id: 'task-idle',
  modelName: '',
  quant: '',
  layerStatus: '',
  speed: '—',
  remainingTime: '—',
  progress: 0,
  downloadedGb: 0,
  totalGb: 0,
  targetPath: '',
  sha256: '',
  isPaused: false,
  isActive: false
};

function MainApp() {
  const { language } = useAppTheme();
  const zh = language === 'zh';
  const [currentScreen, setCurrentScreen] = useState<NavScreen>('models');
  const [models, setModels] = useState<OllamaModel[]>(INITIAL_MODELS);
  const [selectedModel, setSelectedModel] = useState<OllamaModel | null>(INITIAL_MODELS[0] ?? null);
  const [chatModel, setChatModel] = useState<OllamaModel | null>(INITIAL_MODELS[0] ?? null);
  const [downloadTask, setDownloadTask] = useState<DownloadTask>(() => {
    return loadDownloadTask() ?? IDLE_DOWNLOAD_TASK;
  });
  const [selectedQuant, setSelectedQuant] = useState<string>('Q4_K_M');
  // 远程 GGUF 任务不走 ollama pull，恢复时需要原始仓库与文件名
  const modelScopeTargetRef = useRef<ModelScopeDownloadTarget | null>(null);
  const huggingFaceTargetRef = useRef<HuggingFaceDownloadTarget | null>(null);
  const refreshModelsRef = useRef<(() => Promise<unknown>) | null>(null);
  const adoptedRef = useRef(false);
  // 轮询 effect 只需要在任务状态变化时重订阅；quant 用 ref 读最新值，
  // 避免把它加进依赖数组导致每次量化切换都重启轮询。
  const downloadQuantRef = useRef('');
  useEffect(() => {
    downloadQuantRef.current = downloadTask.quant;
  }, [downloadTask.quant]);

  // Modals
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isPullModalOpen, setIsPullModalOpen] = useState(false);
  const [isQuantPickerOpen, setIsQuantPickerOpen] = useState(false);
  const [isPaletteModalOpen, setIsPaletteModalOpen] = useState(false);

  const ollama = useOllama();
  // 轮询回调里用最新的 refresh，避免把 ollama 放进 effect 依赖导致定时器反复重建
  useEffect(() => {
    refreshModelsRef.current = ollama.refresh;
  }, [ollama.refresh]);

  useEffect(() => {
    if (ollama.status === 'connecting') return;

    if (ollama.status === 'online') {
      if (ollama.models.length === 0) {
        setModels([]);
        setSelectedModel(null);
        setChatModel(null);
        return;
      }

      setModels(ollama.models);
      setSelectedModel(
        (previous) =>
          ollama.models.find((model) => model.fullTag === previous?.fullTag) ?? ollama.models[0]
      );
      setChatModel(
        (previous) =>
          ollama.models.find((model) => model.fullTag === previous?.fullTag) ?? ollama.models[0]
      );
      return;
    }

    // Offline: keep the clearly-labelled demo list available for exploration.
    setSelectedModel((previous) => previous ?? INITIAL_MODELS[0] ?? null);
    setChatModel((previous) => previous ?? INITIAL_MODELS[0] ?? null);
  }, [ollama.status, ollama.models]);

  useEffect(() => {
    if (!downloadTask.modelName) return;
    if (!downloadTask.isActive && !downloadTask.isComplete) return;
    const timer = window.setTimeout(() => saveDownloadTask(downloadTask), 300);
    return () => window.clearTimeout(timer);
  }, [downloadTask]);

  // Load or eject a model through real keep_alive requests
  const handleToggleVram = async (modelId: string) => {
    const target = models.find((model) => model.id === modelId) ?? selectedModel;
    if (!target) {
      throw new Error(zh ? '未找到模型。' : 'Model not found.');
    }

    const options: KeepAliveOptions = {
      kind: target.capabilities?.includes('embedding') ? 'embed' : 'generate'
    };

    if (target.status === 'running') {
      await unloadModel(target.fullTag, options);
    } else {
      await loadModel(target.fullTag, -1, options);
    }
    await ollama.refresh();
  };

  // Launch model directly into chat
  const handleLaunchInChat = (model: OllamaModel) => {
    setChatModel(model);
    setSelectedModel(model);
    setCurrentScreen('chat');
  };

  // Delete a model through Ollama, then refresh the real list
  const handleDeleteModel = async (modelId: string) => {
    const target = models.find((model) => model.id === modelId);
    if (!target) return;

    await deleteModel(target.fullTag);
    const remaining = models.filter((model) => model.id !== modelId);
    setModels(remaining);
    setSelectedModel((previous) => (previous?.id === modelId ? (remaining[0] ?? null) : previous));
    setChatModel((previous) => (previous?.id === modelId ? (remaining[0] ?? null) : previous));
    await ollama.refresh();
  };

  // Clone a model through Ollama /api/copy
  const handleCloneModel = async (model: OllamaModel) => {
    const baseName =
      model.name
        .split('/')
        .pop()
        ?.replace(/[^a-zA-Z0-9._-]/g, '-') || 'model';
    const destination = `${baseName}-copy-${Date.now().toString(36)}:latest`;
    await copyModel(model.fullTag, destination);
    await ollama.refresh();
  };

  // 导出 Ollama 已安装的 GGUF 权重；由本地服务读取 manifest/blob 后写盘
  const handleExportModel = (model: OllamaModel) => exportModelGguf(model.fullTag);

  // 下载在服务端后台执行：请求只创建任务，进度靠轮询，刷新页面不会中断
  const buildTaskFromJob = useCallback(
    (job: DownloadJob, targetPath?: string): DownloadTask => {
      const isModelScope = job.kind === 'modelscope';
      const isHuggingFace = job.kind === 'huggingface';
      const isGguf = isModelScope || isHuggingFace;
      const target = job.target;
      const targetQuant =
        target && 'quant' in target && typeof target.quant === 'string' ? target.quant : '';
      const quant =
        targetQuant ||
        (job.model.includes(':') ? job.model.slice(job.model.lastIndexOf(':') + 1) : selectedQuant);
      const remoteFile = target && 'file' in target ? target.file : undefined;
      return {
        id: job.id,
        kind: job.kind,
        modelName: job.model,
        quant,
        layerStatus: job.layerStatus,
        speed: '—',
        remainingTime: zh ? '计算中…' : 'Calculating…',
        progress: 0,
        downloadedGb: 0,
        totalGb: 0,
        targetPath:
          targetPath ??
          (isGguf
            ? (remoteFile?.split('/').pop() ?? '')
            : job.model.startsWith('hf.co/')
              ? job.model
              : `~/.ollama/models/manifests/${job.model}`),
        sha256: isGguf
          ? zh
            ? '下载后由 ollama create 注册'
            : 'Registered via ollama create'
          : zh
            ? '等待校验'
            : 'Pending verification',
        isPaused: false,
        isActive: true,
        isComplete: false,
        error: undefined,
        source:
          isModelScope && target && 'namespace' in target
            ? {
                namespace: target.namespace,
                name: target.name,
                file: target.file,
                quant,
                modelName: target.model ?? job.model
              }
            : isHuggingFace && target && 'repo' in target
              ? {
                  repo: target.repo,
                  file: target.file ?? '',
                  quant,
                  modelName: target.model ?? job.model
                }
              : undefined
      };
    },
    [selectedQuant, zh]
  );

  // Hugging Face 不走 ollama pull：服务端直连下载 GGUF 后再 ollama create
  const startHuggingFaceDownload = async (target: HuggingFaceDownloadTarget) => {
    const filename = target.file.split('/').pop() ?? '';

    modelScopeTargetRef.current = null;
    huggingFaceTargetRef.current = target;
    setCurrentScreen('pull');

    try {
      const job = await startDownloadJob({
        kind: 'huggingface',
        repo: target.repo,
        file: target.file || undefined,
        quant: target.quant || undefined,
        model: target.modelName
      });
      setDownloadTask({
        ...buildTaskFromJob(job, filename || undefined),
        quant: target.quant,
        targetPath: filename,
        source: target
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setDownloadTask({
        id: `failed-${Date.now()}`,
        kind: 'huggingface',
        modelName: target.modelName || target.repo,
        quant: target.quant,
        layerStatus: zh ? '无法开始下载' : 'Could not start download',
        speed: '—',
        remainingTime: '—',
        progress: 0,
        downloadedGb: 0,
        totalGb: 0,
        targetPath: filename,
        sha256: '—',
        isPaused: false,
        isActive: true,
        isComplete: false,
        error: message,
        source: target
      });
    }
  };

  const handleStartHuggingFaceDownload = (target: {
    repo: string;
    file?: string;
    quant: string;
    modelName: string;
  }) => {
    void startHuggingFaceDownload({ ...target, file: target.file ?? '' });
  };

  const startPullDownload = async (modelTag: string) => {
    const name = modelTag.trim();
    if (!name) return;

    const huggingFaceTarget = parseHuggingFacePullTarget(name);
    if (huggingFaceTarget) {
      await startHuggingFaceDownload(huggingFaceTarget);
      return;
    }

    modelScopeTargetRef.current = null;
    huggingFaceTargetRef.current = null;
    setCurrentScreen('pull');

    try {
      const job = await startDownloadJob({ kind: 'pull', model: name });
      setDownloadTask(buildTaskFromJob(job));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setDownloadTask({
        id: `failed-${Date.now()}`,
        kind: 'pull',
        modelName: name,
        quant: name.includes(':') ? name.slice(name.lastIndexOf(':') + 1) : selectedQuant,
        layerStatus: zh ? '无法开始下载' : 'Could not start download',
        speed: '—',
        remainingTime: '—',
        progress: 0,
        downloadedGb: 0,
        totalGb: 0,
        targetPath: `~/.ollama/models/manifests/${name}`,
        sha256: '—',
        isPaused: false,
        isActive: true,
        isComplete: false,
        error: message
      });
    }
  };

  const handleStartNewDownload = (modelTag: string) => {
    void startPullDownload(modelTag);
  };

  // ModelScope 无法被 ollama pull：由本地服务下载 GGUF 后再 ollama create
  const startModelScopeDownload = async (target: ModelScopeDownloadTarget) => {
    const filename = target.file.split('/').pop() ?? target.file;

    modelScopeTargetRef.current = target;
    huggingFaceTargetRef.current = null;
    setCurrentScreen('pull');

    try {
      const job = await startDownloadJob({
        kind: 'modelscope',
        namespace: target.namespace,
        name: target.name,
        file: target.file,
        model: target.modelName
      });
      setDownloadTask({
        ...buildTaskFromJob(job, filename),
        quant: target.quant,
        targetPath: filename,
        source: target
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setDownloadTask({
        id: `failed-${Date.now()}`,
        kind: 'modelscope',
        modelName: `${target.namespace}/${target.name}`,
        quant: target.quant,
        layerStatus: zh ? '无法开始下载' : 'Could not start download',
        speed: '—',
        remainingTime: '—',
        progress: 0,
        downloadedGb: 0,
        totalGb: 0,
        targetPath: filename,
        sha256: '—',
        isPaused: false,
        isActive: true,
        isComplete: false,
        error: message,
        source: target
      });
    }
  };

  const handleStartModelScopeDownload = (target: ModelScopeDownloadTarget) => {
    void startModelScopeDownload(target);
  };

  // 刷新或新标签页：接上服务端仍在运行的下载任务
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const jobs = await listDownloadJobs().catch(() => []);
      if (cancelled) return;
      const running = jobs
        .filter((job) => job.status === 'running')
        .sort((a, b) => b.startedAt - a.startedAt)[0];
      if (!running) return;
      // 恢复暂停所需的原始仓库信息只存在服务端任务里
      if (running.kind === 'modelscope' && running.target && 'namespace' in running.target) {
        modelScopeTargetRef.current = {
          ...running.target,
          quant: selectedQuant,
          modelName: running.target.model ?? running.model
        };
      }
      if (running.kind === 'huggingface' && running.target && 'repo' in running.target) {
        huggingFaceTargetRef.current = {
          repo: running.target.repo,
          file: running.target.file ?? '',
          quant: running.target.quant ?? selectedQuant,
          modelName: running.target.model ?? running.model
        };
      }
      // 本地记录会被 markInterrupted 标成“已中断”，即使 id 相同也要用服务端状态覆盖
      setDownloadTask((previous) =>
        previous.id === running.id && !previous.isPaused && !previous.isInterrupted
          ? previous
          : buildTaskFromJob(running)
      );
      // 刷新后直接回到拉取页，让用户看到仍在进行的下载（只跳一次）
      if (!adoptedRef.current) {
        adoptedRef.current = true;
        setCurrentScreen('pull');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [buildTaskFromJob, selectedQuant]);

  // 轮询后台任务；任务结束、暂停或取消时自动停止
  useEffect(() => {
    const jobId = downloadTask.id;
    if (!jobId.startsWith('dl-')) return;
    if (!downloadTask.isActive || downloadTask.isComplete || downloadTask.isPaused) return;
    if (downloadTask.error) return;

    let stopped = false;
    let lastCompleted: number | null = null;
    let lastAt = Date.now();

    const poll = async () => {
      let job: DownloadJob | null;
      try {
        job = await getDownloadJob(jobId);
      } catch {
        return; // 网络抖动：保留当前进度，下次轮询再试
      }
      if (stopped) return;

      if (!job) {
        setDownloadTask((previous) =>
          previous.id !== jobId || previous.isPaused || !previous.isActive
            ? previous
            : {
                ...previous,
                isPaused: true,
                isInterrupted: true,
                speed: '—',
                remainingTime: '—',
                layerStatus: zh ? '后台任务已丢失，请重新下载' : 'Background task lost, restart it'
              }
        );
        return;
      }

      const now = Date.now();
      const elapsed = (now - lastAt) / 1000;
      let speed = 0;
      if (lastCompleted !== null && elapsed > 0 && job.completed > lastCompleted) {
        speed = (job.completed - lastCompleted) / elapsed;
      }
      if (job.completed > 0) {
        lastCompleted = job.completed;
        lastAt = now;
      }

      const pct = job.total > 0 ? Math.min(100, (job.completed / job.total) * 100) : 0;
      const isGguf = job.kind === 'modelscope' || job.kind === 'huggingface';
      const succeeded = job.status === 'success';
      const failed = job.status === 'error';
      const cancelled = job.status === 'cancelled';

      setDownloadTask((previous) => {
        if (previous.id !== jobId || previous.isPaused || !previous.isActive) return previous;
        const hfTarget =
          job.kind === 'huggingface' && job.target && 'repo' in job.target ? job.target : undefined;
        return {
          ...previous,
          layerStatus: cancelled
            ? zh
              ? '已取消'
              : 'Cancelled'
            : succeeded
              ? isGguf
                ? zh
                  ? '下载完成，已注册到 Ollama'
                  : 'Downloaded and registered'
                : zh
                  ? '拉取完成'
                  : 'Pull complete'
              : isGguf
                ? job.layerStatus === 'creating'
                  ? zh
                    ? '正在用 ollama create 注册模型…'
                    : 'Registering with ollama create…'
                  : job.layerStatus === 'resolving'
                    ? zh
                      ? '正在解析 GGUF 文件…'
                      : 'Resolving GGUF file…'
                    : zh
                      ? '正在下载 GGUF…'
                      : 'Downloading GGUF…'
                : job.layerStatus || previous.layerStatus,
          progress: succeeded ? 100 : Number(pct.toFixed(1)),
          downloadedGb: Number((job.completed / 1e9).toFixed(2)),
          totalGb: Number((job.total / 1e9).toFixed(2)),
          targetPath: hfTarget?.file
            ? (hfTarget.file.split('/').pop() ?? previous.targetPath)
            : previous.targetPath,
          source: hfTarget
            ? {
                repo: hfTarget.repo,
                file: hfTarget.file ?? '',
                quant: hfTarget.quant ?? previous.quant,
                modelName: hfTarget.model ?? previous.modelName
              }
            : previous.source,
          speed:
            succeeded || failed || cancelled
              ? '—'
              : speed > 0
                ? formatSpeed(speed)
                : previous.speed,
          remainingTime: succeeded
            ? zh
              ? '已完成'
              : 'Done'
            : failed || cancelled
              ? '—'
              : speed > 0 && job.total > 0
                ? formatRemaining((job.total - job.completed) / speed, zh)
                : previous.remainingTime,
          isComplete: succeeded,
          isActive: !cancelled,
          error: failed
            ? isGguf
              ? job.error || (zh ? '下载失败' : 'Download failed')
              : explainPullError(job.error || (zh ? '下载失败' : 'Download failed'), job.model, zh)
            : undefined,
          sha256: succeeded
            ? isGguf
              ? zh
                ? '已通过 ollama create 注册'
                : 'Registered via ollama create'
              : zh
                ? '校验完成'
                : 'Verified'
            : previous.sha256
        };
      });

      if (succeeded) {
        // 登记来源：/api/tags 不提供仓库信息，模型卡片靠这个跳回渠道页。
        if (job.kind === 'modelscope' && job.target && 'namespace' in job.target) {
          recordModelOrigin(job.target.model ?? job.model, {
            namespace: job.target.namespace,
            name: job.target.name,
            file: job.target.file ?? '',
            quant: downloadQuantRef.current,
            modelName: job.target.model ?? job.model
          });
        }
        if (job.kind === 'huggingface' && job.target && 'repo' in job.target) {
          recordModelOrigin(job.target.model ?? job.model, {
            repo: job.target.repo,
            file: job.target.file ?? '',
            quant: job.target.quant ?? downloadQuantRef.current,
            modelName: job.target.model ?? job.model
          });
        }
        void refreshModelsRef.current?.();
      }
    };

    void poll();
    const timer = window.setInterval(() => {
      void poll();
    }, 900);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [
    downloadTask.id,
    downloadTask.isActive,
    downloadTask.isComplete,
    downloadTask.isPaused,
    downloadTask.error,
    zh
  ]);

  const handlePauseDownload = () => {
    if (!downloadTask.isActive || downloadTask.isPaused || downloadTask.isComplete) {
      return;
    }
    void cancelDownloadJob(downloadTask.id);
    setDownloadTask((previous) => ({
      ...previous,
      isPaused: true,
      isInterrupted: false,
      layerStatus: zh ? '已暂停' : 'Paused',
      speed: '—',
      remainingTime: zh ? '已暂停' : 'Paused'
    }));
  };

  const handleResumeDownload = () => {
    if (!downloadTask.isPaused) return;

    if (downloadTask.kind === 'modelscope') {
      const cached = modelScopeTargetRef.current;
      const [namespace, name] = downloadTask.modelName.split('/');
      const file = cached?.file ?? downloadTask.targetPath;
      if (!namespace || !name || !file) return;
      void startModelScopeDownload({
        namespace,
        name,
        file,
        quant: cached?.quant ?? downloadTask.quant,
        modelName: cached?.modelName ?? downloadTask.modelName
      });
      return;
    }

    if (downloadTask.kind === 'huggingface') {
      const cached =
        huggingFaceTargetRef.current ??
        (downloadTask.source && 'repo' in downloadTask.source ? downloadTask.source : null);
      const repo =
        cached?.repo ??
        (downloadTask.modelName.includes(':')
          ? downloadTask.modelName.slice(0, downloadTask.modelName.lastIndexOf(':'))
          : downloadTask.modelName);
      if (!repo) return;
      void startHuggingFaceDownload({
        repo,
        file: cached?.file ?? downloadTask.targetPath,
        quant: cached?.quant ?? downloadTask.quant,
        modelName: cached?.modelName ?? downloadTask.modelName
      });
      return;
    }

    void startPullDownload(downloadTask.modelName);
  };

  // 失败后原样重跑；远程 GGUF 任务优先用持久化的 source，刷新后也能重试
  const handleRetryDownload = () => {
    if (!downloadTask.error) return;

    if (isHuggingFaceTask(downloadTask)) {
      const source =
        downloadTask.source && 'repo' in downloadTask.source
          ? downloadTask.source
          : huggingFaceTargetRef.current;
      if (source) {
        void startHuggingFaceDownload(source);
        return;
      }
      const repo = downloadTask.modelName.includes(':')
        ? downloadTask.modelName.slice(0, downloadTask.modelName.lastIndexOf(':'))
        : downloadTask.modelName;
      if (repo) {
        void startHuggingFaceDownload({
          repo,
          file: downloadTask.targetPath,
          quant: downloadQuantRef.current,
          modelName: downloadTask.modelName
        });
        return;
      }
      setDownloadTask((previous) => ({
        ...previous,
        layerStatus: zh ? '无法恢复下载信息，请重新搜索' : 'Source info lost; search again'
      }));
      return;
    }

    if (isModelScopeTask(downloadTask)) {
      const source = downloadTask.source ?? modelScopeTargetRef.current;
      if (source && 'namespace' in source) {
        void startModelScopeDownload(source);
        return;
      }
      // 旧任务没有 source：用展示字段重建（文件位于仓库根目录时可用）
      const [namespace, name] = downloadTask.modelName.split('/');
      if (namespace && name && downloadTask.targetPath) {
        void startModelScopeDownload({
          namespace,
          name,
          file: downloadTask.targetPath,
          quant: downloadQuantRef.current,
          modelName: downloadTask.modelName
        });
        return;
      }
      setDownloadTask((previous) => ({
        ...previous,
        layerStatus: zh ? '无法恢复下载信息，请重新搜索' : 'Source info lost; search again'
      }));
      return;
    }

    void startPullDownload(downloadTask.modelName);
  };

  const handleCancelDownload = () => {
    modelScopeTargetRef.current = null;
    huggingFaceTargetRef.current = null;
    void cancelDownloadJob(downloadTask.id);
    clearDownloadTask();
    setDownloadTask((previous) => ({
      ...previous,
      isActive: false,
      isPaused: false,
      layerStatus: zh ? '已取消' : 'Cancelled',
      speed: '—',
      remainingTime: '—'
    }));
  };

  const handleCreateModel = async (request: CreateModelRequest) => {
    await createModel(request);
    const refreshed = await ollama.refresh();
    const target = request.model.includes(':') ? request.model : `${request.model}:latest`;
    const created = refreshed.find((model) => model.fullTag === target) ?? null;
    if (created) {
      setModels(refreshed);
      setSelectedModel(created);
    }
    return created;
  };

  // Import a real GGUF file through the same-origin upload endpoint
  const handleImportGguf = async (file: File) => {
    const result = await importGguf(file);
    const refreshed = await ollama.refresh();
    const target = result.model.includes(':') ? result.model : `${result.model}:latest`;
    const imported = refreshed.find((model) => model.fullTag === target);
    if (!imported) {
      throw new Error(
        zh
          ? `Ollama 已创建 ${target}，但模型列表未找到该条目；请点击刷新后重试。`
          : `Ollama created ${target}, but it is missing from the model list. Refresh and try again.`
      );
    }
    setModels(refreshed);
    setSelectedModel(imported);
  };

  const runningModelCount =
    ollama.status === 'online'
      ? ollama.runningCount
      : models.filter((m) => m.status === 'running').length;
  const loadedVramBytes =
    ollama.status === 'online'
      ? models
          .filter((model) => model.status === 'running')
          .reduce((sum, model) => sum + (model.sizeVramBytes ?? 0), 0)
      : 0;

  return (
    <div className="min-h-screen bg-[var(--app-bg)] text-[var(--app-text)] font-body transition-colors duration-200">
      {/* Left macOS Sidebar */}
      <Sidebar
        currentScreen={currentScreen}
        onNavigate={setCurrentScreen}
        runningModelCount={runningModelCount}
        loadedVramBytes={loadedVramBytes}
        ollamaStatus={ollama.status}
        ollamaVersion={ollama.version}
      />

      {/* Main Content Area */}
      <div className="lg:pl-64 flex flex-col min-h-screen">
        {/* Top Header */}
        <Header
          onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
          onOpenSettings={() => setIsPaletteModalOpen(true)}
          onOpenPullModal={() => setIsPullModalOpen(true)}
          onOpenPaletteModal={() => setIsPaletteModalOpen(true)}
          ollamaStatus={ollama.status}
          ollamaVersion={ollama.version}
          runningCount={runningModelCount}
          modelCount={ollama.status === 'online' ? ollama.models.length : models.length}
          onRefreshOllama={() => {
            void ollama.refresh();
          }}
        />

        {/* Content Screens */}
        <main className="relative pt-16 pb-20 lg:pb-0 bg-[var(--app-bg)] min-h-screen transition-colors">
          <ConnectionBanner
            status={ollama.status}
            version={ollama.version}
            modelCount={ollama.models.length}
            error={ollama.error}
            onRetry={() => {
              void ollama.refresh();
            }}
            onOpenPull={() => setCurrentScreen('pull')}
          />
          {currentScreen === 'models' && (
            <ModelsScreen
              models={models}
              selectedModel={selectedModel}
              onSelectModel={setSelectedModel}
              onToggleVram={handleToggleVram}
              onLaunchInChat={handleLaunchInChat}
              onOpenPullModal={() => setIsPullModalOpen(true)}
              onGoToModelfileLab={(m) => {
                setSelectedModel(m);
                setCurrentScreen('modelfile-lab');
              }}
              onDeleteModel={handleDeleteModel}
              onCloneModel={handleCloneModel}
              onExportModel={handleExportModel}
            />
          )}

          {currentScreen === 'pull' && (
            <PullScreen
              downloadTask={downloadTask}
              onPauseDownload={handlePauseDownload}
              onResumeDownload={handleResumeDownload}
              onRetryDownload={handleRetryDownload}
              onCancelDownload={handleCancelDownload}
              onOpenQuantPicker={() => setIsQuantPickerOpen(true)}
              selectedQuant={selectedQuant}
              onImportGguf={handleImportGguf}
              onStartNewDownload={handleStartNewDownload}
              onStartModelScopeDownload={handleStartModelScopeDownload}
              onStartHuggingFaceDownload={handleStartHuggingFaceDownload}
            />
          )}

          {currentScreen === 'chat' && (
            <ChatScreen
              currentModel={chatModel}
              models={models}
              onOpenPull={() => setCurrentScreen('pull')}
              onSelectModel={(m) => {
                setChatModel(m);
                setSelectedModel(m);
              }}
            />
          )}

          {currentScreen === 'telemetry-settings' && <TelemetryScreen />}

          {currentScreen === 'modelfile-lab' && (
            <ModelfileLabScreen
              models={models}
              initialModel={selectedModel ?? undefined}
              onCreateModel={handleCreateModel}
              onLaunchTestChat={(m) => {
                setChatModel(m);
                setCurrentScreen('chat');
              }}
            />
          )}
        </main>
      </div>

      <MobileNav
        currentScreen={currentScreen}
        onNavigate={setCurrentScreen}
        runningModelCount={runningModelCount}
      />

      {/* Global Modals */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onOpen={() => setIsCommandPaletteOpen(true)}
        onClose={() => setIsCommandPaletteOpen(false)}
        models={models}
        onSelectModel={(m) => {
          setSelectedModel(m);
          setChatModel(m);
        }}
        onNavigate={setCurrentScreen}
        onQuickPull={handleStartNewDownload}
      />

      <PullModal
        isOpen={isPullModalOpen}
        onClose={() => setIsPullModalOpen(false)}
        onStartPull={handleStartNewDownload}
      />

      <QuantizationPickerModal
        isOpen={isQuantPickerOpen}
        onClose={() => setIsQuantPickerOpen(false)}
        currentQuant={selectedQuant}
        onSelectQuant={setSelectedQuant}
      />

      <ThemePaletteModal isOpen={isPaletteModalOpen} onClose={() => setIsPaletteModalOpen(false)} />
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <MainApp />
    </ThemeProvider>
  );
}
