import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { useDownloads } from './hooks/useDownloads';
import type { DownloadsApi } from './hooks/useDownloads';
import { useEvents } from './hooks/useEvents';
import { useOllamaData } from './hooks/useOllamaData';
import type { OllamaStatus } from './hooks/useOllamaData';
import { useSystemMetrics } from './hooks/useSystemMetrics';
import {
  copyModel,
  deleteModel,
  exportModelGguf,
  importGguf,
  loadModel,
  readStorageJson,
  recordModelOrigin,
  unloadModel,
  writeStorageJson
} from './lib/legacy';
import type { OllamaModel } from './lib/legacy';
import { shortModelName } from './lib/format';
import { SCREEN_HASH, persistScreen, readPersistedScreen, readScreenFromHash } from './navigation';
import type { Screen } from './navigation';
import { CommandPalette } from './components/CommandPalette';
import { MobileNav } from './components/MobileNav';
import { Sidebar } from './components/Sidebar';
import { ThemePaletteModal } from './components/ThemePaletteModal';
import { Toast } from './components/Toast';
import type { ToastState, ToastTone } from './components/Toast';
import { TopBar } from './components/TopBar';
import { ChatScreen } from './screens/ChatScreen';
import { ModelfileScreen } from './screens/ModelfileScreen';
import { ModelsScreen } from './screens/ModelsScreen';
import { PullScreen } from './screens/PullScreen';
import { TelemetryScreen } from './screens/TelemetryScreen';

const SELECTED_MODEL_KEY = 'ollama_ui3_selected_model_v1';
const LAB_BASE_KEY = 'ollama_ui3_lab_base_v1';

function initialScreen(): Screen {
  return readScreenFromHash() ?? readPersistedScreen() ?? 'chat';
}

function readInitialLabBase(): string | null {
  const value = readStorageJson<unknown>(LAB_BASE_KEY, null);
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function AppShell() {
  const { c, language, preferences } = useTheme();
  const ollama = useOllamaData(language);
  const metricsState = useSystemMetrics();
  const { events, pushEvent } = useEvents();
  const [screen, setScreen] = useState<Screen>(initialScreen);
  const [selectedTag, setSelectedTag] = useState(() =>
    readStorageJson<string>(SELECTED_MODEL_KEY, '')
  );
  const [labBase, setLabBase] = useState<string | null>(readInitialLabBase);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [busyModelTag, setBusyModelTag] = useState<string | null>(null);
  const toastTimer = useRef(0);
  const lastStatusRef = useRef<OllamaStatus>('connecting');

  const notify = useCallback((message: string, tone: ToastTone = 'info') => {
    const id = Date.now();
    setToast({ id, message, tone });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => {
      setToast((current) => (current?.id === id ? null : current));
    }, 3800);
  }, []);

  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  const downloads = useDownloads({
    onCompleted: (record) => {
      notify(c.toast.downloadCompleted(shortModelName(record.model)), 'success');
      pushEvent('success', c.toast.downloadCompleted(record.model));
      void ollama.refresh(true);
    },
    onFailed: (record) => {
      notify(c.toast.downloadFailed(shortModelName(record.model)), 'error');
      pushEvent('error', c.toast.downloadFailed(record.model));
    }
  });

  const navigate = useCallback((next: Screen) => {
    setScreen(next);
    persistScreen(next);
    const hash = `#/${SCREEN_HASH[next]}`;
    if (window.location.hash !== hash) window.history.pushState(null, '', hash);
  }, []);

  useEffect(() => {
    const initial = initialScreen();
    persistScreen(initial);
    if (!readScreenFromHash()) {
      window.history.replaceState(null, '', `#/${SCREEN_HASH[initial]}`);
    }
    const sync = () => {
      const next = readScreenFromHash();
      if (!next) return;
      setScreen(next);
      persistScreen(next);
    };
    window.addEventListener('hashchange', sync);
    window.addEventListener('popstate', sync);
    return () => {
      window.removeEventListener('hashchange', sync);
      window.removeEventListener('popstate', sync);
    };
  }, []);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  useEffect(() => {
    const previous = lastStatusRef.current;
    if (previous === ollama.status) return;
    lastStatusRef.current = ollama.status;
    if (ollama.status === 'online') {
      pushEvent(
        'success',
        `${c.telemetry.online}${ollama.version ? ` · Ollama v${ollama.version}` : ''}`
      );
      if (previous === 'offline') notify(c.toast.connectionRestored, 'success');
    } else if (ollama.status === 'offline') {
      pushEvent('warn', `${c.telemetry.offline}${ollama.error ? `: ${ollama.error}` : ''}`);
      notify(c.toast.connectionLost, 'warn');
    }
  }, [c, notify, ollama.error, ollama.status, ollama.version, pushEvent]);

  const selectedModel = useMemo(
    () => ollama.models.find((model) => model.fullTag === selectedTag) ?? ollama.models[0] ?? null,
    [ollama.models, selectedTag]
  );

  const persistSelection = (tag: string) => {
    setSelectedTag(tag);
    writeStorageJson(SELECTED_MODEL_KEY, tag);
  };

  const selectModel = (model: OllamaModel) => {
    persistSelection(model.fullTag);
  };

  const launchChat = (model: OllamaModel) => {
    persistSelection(model.fullTag);
    navigate('chat');
  };

  const openLab = (model: OllamaModel) => {
    setLabBase(model.fullTag);
    writeStorageJson(LAB_BASE_KEY, model.fullTag);
    navigate('modelfile');
  };

  const openChatWithModel = async (tag: string) => {
    await ollama.refresh(true);
    persistSelection(tag);
    navigate('chat');
  };

  const handleLoadToggle = async (model: OllamaModel) => {
    setBusyModelTag(model.fullTag);
    const options = {
      kind: model.capabilities?.includes('embedding') ? ('embed' as const) : ('generate' as const)
    };
    try {
      if (model.status === 'running') {
        await unloadModel(model.fullTag, options);
        notify(c.models.unloadDone(model.fullTag), 'success');
        pushEvent('info', c.models.unloadDone(model.fullTag));
      } else {
        await loadModel(model.fullTag, -1, options);
        notify(c.models.loadDone(model.fullTag), 'success');
        pushEvent('info', c.models.loadDone(model.fullTag));
      }
      await ollama.refresh(true);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      notify(`${c.models.actionFailed}: ${message}`, 'error');
      pushEvent('error', `${c.models.actionFailed}: ${message}`);
    } finally {
      setBusyModelTag(null);
    }
  };

  const handleDelete = async (model: OllamaModel) => {
    try {
      await deleteModel(model.fullTag);
      await ollama.refresh(true);
      notify(c.models.deleteDone(model.fullTag), 'success');
      pushEvent('info', c.models.deleteDone(model.fullTag));
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      notify(`${c.models.actionFailed}: ${message}`, 'error');
      throw caught;
    }
  };

  const handleClone = async (model: OllamaModel, name: string) => {
    try {
      await copyModel(model.fullTag, name);
      await ollama.refresh(true);
      notify(c.models.cloneDone(name), 'success');
      pushEvent('info', c.models.cloneDone(name));
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      notify(`${c.models.actionFailed}: ${message}`, 'error');
      throw caught;
    }
  };

  const handleExport = (model: OllamaModel) => {
    void (async () => {
      notify(c.models.exportPreparing, 'info');
      try {
        const result = await exportModelGguf(model.fullTag);
        notify(c.models.exportDone(result.directory), 'success');
        pushEvent('success', c.models.exportDone(result.directory));
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : String(caught);
        notify(`${c.models.exportFailed}: ${message}`, 'error');
      }
    })();
  };

  const handleImportGguf = async (file: File) => {
    notify(c.models.importPreparing, 'info');
    try {
      const result = await importGguf(file);
      await ollama.refresh(true);
      notify(c.models.importDone(result.model), 'success');
      pushEvent('success', c.models.importDone(result.model));
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      notify(`${c.models.importFailed}: ${message}`, 'error');
      throw caught;
    }
  };

  const handleStartPull: DownloadsApi['startPull'] = async (model, quant) => {
    const record = await downloads.startPull(model, quant);
    return record;
  };

  const handleStartModelScope: DownloadsApi['startModelScope'] = async (target) => {
    const record = await downloads.startModelScope(target);
    recordModelOrigin(target.modelName, {
      namespace: target.namespace,
      name: target.name,
      file: target.file,
      quant: target.quant,
      modelName: target.modelName
    });
    return record;
  };

  const handleStartHuggingFace: DownloadsApi['startHuggingFace'] = async (target) => {
    const record = await downloads.startHuggingFace(target);
    recordModelOrigin(target.modelName, {
      repo: target.repo,
      file: target.file ?? '',
      quant: target.quant ?? '',
      modelName: target.modelName
    });
    return record;
  };

  const handleQuickPull = (name: string) => {
    navigate('pull');
    void downloads
      .startPull(name)
      .then(() => notify(c.toast.downloadStarted(name), 'success'))
      .catch((caught) => {
        const message = caught instanceof Error ? caught.message : String(caught);
        notify(`${c.pull.startFailed}: ${message}`, 'error');
      });
  };

  const scrollToTelemetry = (anchor: 'env' | 'settings') => {
    const scroll = () => {
      document.getElementById(`telemetry-${anchor}`)?.scrollIntoView({
        behavior: preferences.reduceMotion ? 'auto' : 'smooth',
        block: 'start'
      });
    };
    if (screen !== 'telemetry') {
      navigate('telemetry');
      window.setTimeout(scroll, 120);
    } else {
      scroll();
    }
  };

  const activeDownloads = downloads.records.filter(
    (record) => record.status === 'running' || record.status === 'paused'
  ).length;
  const runningDownloads = downloads.records.filter((record) => record.status === 'running').length;
  const loadedVramBytes = ollama.models
    .filter((model) => model.status === 'running')
    .reduce((sum, model) => sum + (model.sizeVramBytes ?? 0), 0);

  return (
    <div className="app-shell" data-screen={screen}>
      <Sidebar
        screen={screen}
        onNavigate={navigate}
        modelCount={ollama.models.length}
        runningCount={ollama.runningCount}
        loadedVramBytes={loadedVramBytes}
        memoryTotalBytes={metricsState.metrics?.memory.totalBytes ?? 0}
        gpuName={metricsState.metrics?.gpu.name}
        status={ollama.status}
        version={ollama.version}
        records={downloads.records}
        onTelemetryAnchor={scrollToTelemetry}
      />

      <div className="app-main">
        <TopBar
          screen={screen}
          status={ollama.status}
          version={ollama.version}
          hasAlert={
            ollama.status === 'offline' ||
            downloads.records.some((record) => record.status === 'error')
          }
          onOpenPalette={() => setPaletteOpen(true)}
          onOpenThemeModal={() => setThemeOpen(true)}
          onOpenTelemetry={() => navigate('telemetry')}
        />

        <main className={`app-content screen-${screen}`}>
          {screen === 'chat' && (
            <ChatScreen
              models={ollama.models}
              model={selectedModel}
              defaultKeepAlive={preferences.defaultKeepAlive}
              defaultNumCtx={preferences.defaultNumCtx}
              defaultShowThinking={preferences.showThinking}
              onSelectModel={selectModel}
              onGoPull={() => navigate('pull')}
              notify={notify}
            />
          )}

          {screen === 'models' && (
            <ModelsScreen
              models={ollama.models}
              selectedModel={selectedModel}
              metrics={metricsState.metrics}
              busyModelId={busyModelTag}
              defaultNumCtx={preferences.defaultNumCtx}
              defaultKeepAlive={preferences.defaultKeepAlive}
              defaultShowThinking={preferences.showThinking}
              onSelectModel={selectModel}
              onLaunchChat={launchChat}
              onLoadToggle={handleLoadToggle}
              onDelete={handleDelete}
              onClone={handleClone}
              onExport={handleExport}
              onImportGguf={handleImportGguf}
              onOpenPull={() => navigate('pull')}
              onOpenLab={openLab}
              notify={notify}
            />
          )}

          {screen === 'pull' && (
            <PullScreen
              records={downloads.records}
              onStartPull={handleStartPull}
              onStartModelScope={handleStartModelScope}
              onStartHuggingFace={handleStartHuggingFace}
              onPause={downloads.pause}
              onResume={downloads.resume}
              onCancel={downloads.cancel}
              onImportGguf={handleImportGguf}
              onGoModels={() => navigate('models')}
              notify={notify}
            />
          )}

          {screen === 'modelfile' && (
            <ModelfileScreen
              models={ollama.models}
              initialBase={labBase}
              onBuilt={(name) => {
                void ollama.refresh(true);
                pushEvent('success', c.lab.buildSuccess(name));
              }}
              onOpenChat={(name) => void openChatWithModel(name)}
              notify={notify}
            />
          )}

          {screen === 'telemetry' && (
            <TelemetryScreen
              status={ollama.status}
              version={ollama.version}
              models={ollama.models}
              events={events}
              metrics={metricsState.metrics}
              metricsError={metricsState.error}
              metricsLoading={metricsState.loading}
              onRefreshMetrics={metricsState.refresh}
              pushEvent={pushEvent}
              onRefreshOllama={() => ollama.refresh(true)}
              notify={notify}
            />
          )}
        </main>
      </div>

      <MobileNav
        screen={screen}
        onNavigate={navigate}
        activeDownloads={activeDownloads}
        runningDownloads={runningDownloads}
      />

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        models={ollama.models}
        selectedTag={selectedModel?.fullTag ?? ''}
        onSelectModel={(model) => {
          setPaletteOpen(false);
          launchChat(model);
        }}
        onNavigate={(next) => {
          setPaletteOpen(false);
          navigate(next);
        }}
        onQuickPull={(name) => {
          setPaletteOpen(false);
          handleQuickPull(name);
        }}
      />

      <ThemePaletteModal open={themeOpen} onClose={() => setThemeOpen(false)} />

      <Toast toast={toast} closeLabel={c.common.close} onClose={() => setToast(null)} />
    </div>
  );
}

export function App() {
  return (
    <ThemeProvider>
      <AppShell />
    </ThemeProvider>
  );
}
