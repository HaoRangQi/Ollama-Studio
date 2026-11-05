import { useEffect, useState } from 'react';
import { useConsole } from './context/console';
import { useDownloads } from './hooks/useDownloads';
import { useOllamaData } from './hooks/useOllamaData';
import { OLLAMA_BASE } from './lib/legacy';
import type { OllamaModel } from './lib/legacy';
import { hashForScreen, isScreenHash, screenFromHash, type ScreenId } from './navigation';
import { TopBar } from './components/TopBar';
import { RuntimeScreen } from './screens/RuntimeScreen';
import { ModelsScreen } from './screens/ModelsScreen';
import { PullScreen } from './screens/PullScreen';
import { ChatScreen } from './screens/ChatScreen';
import { ModelfileScreen } from './screens/ModelfileScreen';

const POLL_MS = 5000;
const SELECTED_KEY = 'ollama_console_model';

function readSelected(): string | null {
  try {
    return localStorage.getItem(SELECTED_KEY);
  } catch {
    return null;
  }
}

export function App() {
  const { lang, mode, t, toggleLang, toggleMode } = useConsole();
  const ollama = useOllamaData(lang, POLL_MS);
  const downloads = useDownloads();
  const [screen, setScreen] = useState<ScreenId>(() => screenFromHash(window.location.hash));
  const [selectedTag, setSelectedTag] = useState<string | null>(() => readSelected());
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const onHashChange = () => {
      if (!isScreenHash(window.location.hash)) return;
      setScreen(screenFromHash(window.location.hash));
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    document.title = `${t.app.name}: ${t.nav[screen]}`;
  }, [screen, t]);

  useEffect(() => {
    try {
      if (selectedTag) localStorage.setItem(SELECTED_KEY, selectedTag);
      else localStorage.removeItem(SELECTED_KEY);
    } catch {
      // Storage can be unavailable in private or restricted contexts.
    }
  }, [selectedTag]);

  const selectedModelTag =
    selectedTag && ollama.models.some((model) => model.fullTag === selectedTag)
      ? selectedTag
      : null;
  const resolvedTag = selectedModelTag ?? ollama.models[0]?.fullTag ?? null;
  const ready = ollama.lastUpdated != null;

  const refreshAll = async () => {
    setRefreshing(true);
    try {
      await Promise.all([ollama.refresh(), downloads.refresh()]);
    } finally {
      setRefreshing(false);
    }
  };

  const openScreen = (id: ScreenId) => {
    setScreen(id);
    window.location.hash = hashForScreen(id);
  };

  const selectModel = (model: OllamaModel) => {
    setSelectedTag(model.fullTag);
  };

  const openChatWith = (model: OllamaModel) => {
    setSelectedTag(model.fullTag);
    openScreen('chat');
  };

  const openModelfileWith = (model: OllamaModel) => {
    setSelectedTag(model.fullTag);
    openScreen('modelfile');
  };

  return (
    <div className="app">
      <a className="skip-link" href="#main">
        {t.app.skip}
      </a>

      <TopBar
        screen={screen}
        t={t}
        lang={lang}
        mode={mode}
        status={ollama.status}
        version={ollama.version}
        modelCount={ollama.models.length}
        runningCount={ollama.running.length}
        ready={ready}
        refreshing={refreshing}
        onToggleLang={toggleLang}
        onToggleMode={toggleMode}
        onRefresh={() => void refreshAll()}
      />

      <main id="main" className="app-main" tabIndex={-1}>
        <div className="container">
          {ollama.status === 'offline' ? (
            <div className="notice notice--bad">
              <span className="notice__text">
                {t.errors.ollama} {ollama.error ?? ''}
              </span>
              <div className="notice__actions">
                <button
                  type="button"
                  className="btn btn--quiet btn--small"
                  onClick={() => void refreshAll()}
                  disabled={refreshing}
                >
                  {t.common.retry}
                </button>
              </div>
            </div>
          ) : null}

          {screen === 'runtime' ? (
            <RuntimeScreen
              t={t}
              lang={lang}
              pollMs={POLL_MS}
              ollama={ollama}
              downloads={downloads}
              onOpenModels={() => openScreen('models')}
              onOpenPull={() => openScreen('pull')}
              onChatModel={openChatWith}
            />
          ) : null}

          {screen === 'models' ? (
            <ModelsScreen
              t={t}
              lang={lang}
              ollama={ollama}
              selectedTag={resolvedTag}
              onSelect={selectModel}
              onChatModel={openChatWith}
              onModelfileModel={openModelfileWith}
              onOpenPull={() => openScreen('pull')}
            />
          ) : null}

          {screen === 'pull' ? <PullScreen t={t} lang={lang} downloads={downloads} /> : null}

          {screen === 'chat' ? (
            <ChatScreen
              t={t}
              lang={lang}
              ollama={ollama}
              selectedTag={resolvedTag}
              onSelectModel={selectModel}
              onOpenModels={() => openScreen('models')}
            />
          ) : null}

          {screen === 'modelfile' ? (
            <ModelfileScreen
              t={t}
              ollama={ollama}
              selectedTag={resolvedTag}
              onSelectModel={selectModel}
              onChatModel={openChatWith}
              onOpenPull={() => openScreen('pull')}
            />
          ) : null}
        </div>
      </main>

      <footer className="app-footer">
        <div className="container app-footer__row">
          <span>{t.app.footerProduct}</span>
          <div className="app-footer__group">
            <span>
              {t.app.footerProxyLabel} <span className="measured">{OLLAMA_BASE}</span>
            </span>
            <span>
              {t.app.footerModeLabel}: {t.app.footerMode}
            </span>
            <a className="link" href="/">
              {t.app.classic}
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
