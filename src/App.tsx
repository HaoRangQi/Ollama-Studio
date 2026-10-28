import { useEffect, useRef, useState } from 'react';
import { NavScreen, OllamaModel, DownloadTask } from './types';
import { INITIAL_MODELS } from './data/mockData';
import { ThemeProvider, useAppTheme } from './context/ThemeContext';
import { useOllama } from './hooks/useOllama';
import {
  copyModel,
  createModel,
  deleteModel,
  importGguf,
  loadModel,
  pullModel,
  unloadModel
} from './api/ollama';
import type { CreateModelRequest, KeepAliveOptions } from './api/ollama';
import { clearDownloadTask, loadDownloadTask, saveDownloadTask } from './lib/downloadTask';
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

const formatSpeed = (bytesPerSecond: number) => {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return '—';
  return `${(bytesPerSecond / 1_000_000).toFixed(1)} MB/s`;
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
  const downloadAbortRef = useRef<AbortController | null>(null);
  const downloadRunIdRef = useRef(0);

  // Modals
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isPullModalOpen, setIsPullModalOpen] = useState(false);
  const [isQuantPickerOpen, setIsQuantPickerOpen] = useState(false);
  const [isPaletteModalOpen, setIsPaletteModalOpen] = useState(false);

  const ollama = useOllama();

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
    saveDownloadTask(downloadTask);
  }, [downloadTask]);

  // Load or eject a model through real keep_alive requests
  const handleToggleVram = async (modelId: string) => {
    const target = models.find((model) => model.id === modelId) ?? selectedModel;
    if (!target) return;

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

  // Start a real Ollama pull and stream progress into the task card
  const handleStartNewDownload = async (modelTag: string) => {
    const name = modelTag.trim();
    if (!name) return;

    downloadAbortRef.current?.abort();
    const controller = new AbortController();
    downloadAbortRef.current = controller;
    const runId = ++downloadRunIdRef.current;
    const taskId = `task-${Date.now()}-${runId}`;
    const quant = name.includes(':') ? name.slice(name.lastIndexOf(':') + 1) : selectedQuant;
    const layers = new Map<string, { total: number; completed: number }>();
    let lastCompleted = 0;
    let lastAt = Date.now();

    setDownloadTask({
      id: taskId,
      modelName: name,
      quant,
      layerStatus: zh ? '正在连接 Ollama…' : 'Connecting to Ollama…',
      speed: '—',
      remainingTime: zh ? '计算中…' : 'Calculating…',
      progress: 0,
      downloadedGb: 0,
      totalGb: 0,
      targetPath: name.startsWith('hf.co/') ? name : `~/.ollama/models/manifests/${name}`,
      sha256: zh ? '等待校验' : 'Pending verification',
      isPaused: false,
      isActive: true,
      isComplete: false,
      error: undefined
    });
    setCurrentScreen('pull');

    try {
      await pullModel(
        name,
        {
          onProgress: (progress) => {
            if (downloadRunIdRef.current !== runId) return;

            if (progress.digest && typeof progress.total === 'number') {
              const existing = layers.get(progress.digest);
              layers.set(progress.digest, {
                total: progress.total,
                completed: progress.completed ?? existing?.completed ?? 0
              });
            } else if (progress.digest && typeof progress.completed === 'number') {
              const existing = layers.get(progress.digest);
              if (existing) {
                layers.set(progress.digest, {
                  ...existing,
                  completed: progress.completed
                });
              }
            }

            let total = 0;
            let completed = 0;
            for (const layer of layers.values()) {
              total += layer.total;
              completed += layer.completed;
            }

            const pct = total > 0 ? Math.min(100, (completed / total) * 100) : 0;
            const now = Date.now();
            const elapsed = (now - lastAt) / 1000;
            const delta = completed - lastCompleted;
            let speed = 0;
            if (elapsed > 0 && delta > 0) {
              speed = delta / elapsed;
              lastCompleted = completed;
              lastAt = now;
            }

            setDownloadTask((previous) =>
              previous.id !== taskId
                ? previous
                : {
                    ...previous,
                    layerStatus: progress.status || previous.layerStatus,
                    progress: Number(pct.toFixed(1)),
                    downloadedGb: Number((completed / 1e9).toFixed(2)),
                    totalGb: Number((total / 1e9).toFixed(2)),
                    speed: speed > 0 ? formatSpeed(speed) : previous.speed,
                    remainingTime:
                      speed > 0
                        ? formatRemaining((total - completed) / speed, zh)
                        : previous.remainingTime,
                    sha256: progress.digest ? `${progress.digest.slice(0, 19)}…` : previous.sha256
                  }
            );
          },
          onDone: () => {
            if (downloadRunIdRef.current !== runId) return;
            setDownloadTask((previous) =>
              previous.id !== taskId
                ? previous
                : {
                    ...previous,
                    progress: 100,
                    isComplete: true,
                    isPaused: false,
                    isActive: true,
                    layerStatus: zh ? '拉取完成' : 'Pull complete',
                    speed: '—',
                    remainingTime: zh ? '已完成' : 'Done',
                    sha256: zh ? '校验完成' : 'Verified'
                  }
            );
            void ollama.refresh();
          }
        },
        controller.signal
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      if (downloadRunIdRef.current !== runId) return;
      const message = error instanceof Error ? error.message : String(error);
      setDownloadTask((previous) =>
        previous.id !== taskId
          ? previous
          : {
              ...previous,
              isActive: true,
              isPaused: false,
              layerStatus: zh ? '拉取失败' : 'Pull failed',
              error: message,
              speed: '—',
              remainingTime: '—'
            }
      );
    } finally {
      if (downloadAbortRef.current === controller) {
        downloadAbortRef.current = null;
      }
    }
  };

  const handlePauseDownload = () => {
    if (!downloadTask.isActive || downloadTask.isPaused || downloadTask.isComplete) {
      return;
    }
    downloadAbortRef.current?.abort();
    downloadAbortRef.current = null;
    downloadRunIdRef.current += 1;
    setDownloadTask((previous) => ({
      ...previous,
      isPaused: true,
      layerStatus: zh ? '已暂停' : 'Paused',
      speed: '—',
      remainingTime: zh ? '已暂停' : 'Paused'
    }));
  };

  const handleResumeDownload = () => {
    if (!downloadTask.isPaused) return;
    void handleStartNewDownload(downloadTask.modelName);
  };

  const handleCancelDownload = () => {
    downloadAbortRef.current?.abort();
    downloadAbortRef.current = null;
    downloadRunIdRef.current += 1;
    clearDownloadTask();
    setDownloadTask((previous) => ({
      ...previous,
      isActive: false,
      isPaused: false,
      layerStatus: zh ? '已取消' : 'Cancelled'
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
  const loadedVramGb =
    ollama.status === 'online'
      ? models
          .filter((model) => model.status === 'running')
          .reduce((sum, model) => {
            const value = Number.parseFloat(model.vramUsage ?? '');
            return sum + (Number.isFinite(value) ? value : 0);
          }, 0)
      : 0;

  return (
    <div className="min-h-screen bg-[var(--app-bg)] text-[var(--app-text)] font-body transition-colors duration-200">
      {/* Left macOS Sidebar */}
      <Sidebar
        currentScreen={currentScreen}
        onNavigate={setCurrentScreen}
        runningModelCount={runningModelCount}
        loadedVramGb={loadedVramGb}
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
            />
          )}

          {currentScreen === 'pull' && (
            <PullScreen
              downloadTask={downloadTask}
              onPauseDownload={handlePauseDownload}
              onResumeDownload={handleResumeDownload}
              onCancelDownload={handleCancelDownload}
              onOpenQuantPicker={() => setIsQuantPickerOpen(true)}
              selectedQuant={selectedQuant}
              onImportGguf={handleImportGguf}
              onStartNewDownload={handleStartNewDownload}
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
