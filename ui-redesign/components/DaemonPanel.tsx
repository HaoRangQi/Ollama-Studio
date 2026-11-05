import { useState } from 'react';
import type { Copy } from '../copy';
import { OLLAMA_BASE } from '../lib/legacy';
import type { DaemonAction, DaemonInfo, DaemonManager } from '../lib/legacy';
import { errorMessage } from '../lib/format';
import { ConfirmDialog } from './ConfirmDialog';
import { ErrorState, LoadingState } from './StateBlock';

interface DaemonPanelProps {
  daemon: DaemonInfo | null;
  loading: boolean;
  error: string | null;
  t: Copy;
  onRetry: () => void;
  onControl: (action: DaemonAction) => Promise<void>;
}

function managerLabel(manager: DaemonManager | undefined, t: Copy): string {
  switch (manager) {
    case 'ollama-app':
      return t.runtime.managers.ollamaApp;
    case 'launchd':
      return t.runtime.managers.launchd;
    case 'brew':
      return t.runtime.managers.brew;
    case 'systemd':
      return t.runtime.managers.systemd;
    case 'process':
      return t.runtime.managers.process;
    default:
      return t.runtime.managers.unknown;
  }
}

export function DaemonPanel({ daemon, loading, error, t, onRetry, onControl }: DaemonPanelProps) {
  const [pending, setPending] = useState<DaemonAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [controlError, setControlError] = useState<string | null>(null);

  const pendingCopy =
    pending === 'start'
      ? { title: t.confirm.startTitle, text: t.confirm.startText }
      : pending === 'restart'
        ? { title: t.confirm.restartTitle, text: t.confirm.restartText }
        : pending === 'stop'
          ? { title: t.confirm.stopTitle, text: t.confirm.stopText }
          : null;

  const run = async (action: DaemonAction) => {
    setBusy(true);
    setControlError(null);
    try {
      await onControl(action);
      setPending(null);
    } catch (caught) {
      setControlError(errorMessage(caught) || t.common.unknownError);
    } finally {
      setBusy(false);
    }
  };

  const canRun = (action: DaemonAction): boolean => {
    if (!daemon) return false;
    return daemon.controlEnabled && (daemon.executable?.[action] ?? daemon.canExecute);
  };

  const disabledTitle = (action: DaemonAction): string | undefined => {
    if (!daemon) return undefined;
    if (!daemon.controlEnabled) return t.runtime.controlOff;
    if (!(daemon.executable?.[action] ?? daemon.canExecute)) return t.runtime.commandMissing;
    return undefined;
  };

  const commands = daemon
    ? [
        { label: t.runtime.daemonStart, value: daemon.startCommand },
        { label: t.runtime.daemonRestart, value: daemon.restartCommand },
        { label: t.runtime.daemonStop, value: daemon.stopCommand }
      ].filter((item): item is { label: string; value: string } => Boolean(item.value))
    : [];

  const missingAny =
    daemon?.controlEnabled &&
    (['start', 'restart', 'stop'] as const).some(
      (action) => !(daemon.executable?.[action] ?? daemon.canExecute)
    );

  return (
    <section className="panel">
      <div className="panel__head">
        <h2 className="panel__title">{t.runtime.daemon}</h2>
        {daemon ? (
          <span className={daemon.running ? 'chip chip--ok' : 'chip chip--bad'}>
            {daemon.running ? t.runtime.daemonRunning : t.runtime.daemonStopped}
          </span>
        ) : (
          <span className="panel__meta">{loading ? t.common.loading : t.common.notAvailable}</span>
        )}
      </div>

      {loading && !daemon ? (
        <LoadingState text={t.common.loading} />
      ) : error && !daemon ? (
        <ErrorState
          title={t.runtime.daemon}
          text={`${t.errors.daemon} ${error}`}
          retry={onRetry}
          retryLabel={t.common.retry}
        />
      ) : daemon ? (
        <div className="panel__body stack">
          {error ? (
            <p className="error-text" role="alert">
              {t.errors.daemon} {error}
            </p>
          ) : null}

          <div className="detail-list">
            <div className="detail-row">
              <span className="detail-row__label">{t.runtime.daemonManager}</span>
              <span className="detail-row__value">{managerLabel(daemon.manager, t)}</span>
            </div>
            <div className="detail-row">
              <span className="detail-row__label">{t.runtime.daemonPid}</span>
              <span className="detail-row__value measured">
                {daemon.pid != null ? String(daemon.pid) : t.common.notAvailable}
              </span>
            </div>
            <div className="detail-row">
              <span className="detail-row__label">{t.runtime.daemonProxy}</span>
              <span className="detail-row__value measured">{OLLAMA_BASE}</span>
            </div>
          </div>

          {commands.length > 0 ? (
            <details className="details">
              <summary className="details__summary">{t.runtime.commands}</summary>
              <div className="details__body">
                <div className="detail-list">
                  {commands.map((command) => (
                    <div className="detail-row" key={command.label}>
                      <span className="detail-row__label">{command.label}</span>
                      <code className="detail-row__value measured command-value">
                        {command.value}
                      </code>
                    </div>
                  ))}
                </div>
              </div>
            </details>
          ) : null}

          {!daemon.controlEnabled ? <p className="field__help">{t.runtime.controlOff}</p> : null}
          {missingAny ? <p className="field__help">{t.runtime.commandMissing}</p> : null}

          <div className="actions-row">
            {!daemon.running ? (
              <button
                type="button"
                className="btn btn--quiet"
                onClick={() => {
                  setControlError(null);
                  setPending('start');
                }}
                disabled={!canRun('start') || busy}
                title={disabledTitle('start')}
              >
                {t.runtime.start}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="btn btn--quiet"
                  onClick={() => {
                    setControlError(null);
                    setPending('restart');
                  }}
                  disabled={!canRun('restart') || busy}
                  title={disabledTitle('restart')}
                >
                  {t.runtime.restart}
                </button>
                <button
                  type="button"
                  className="btn btn--danger"
                  onClick={() => {
                    setControlError(null);
                    setPending('stop');
                  }}
                  disabled={!canRun('stop') || busy}
                  title={disabledTitle('stop')}
                >
                  {t.runtime.stop}
                </button>
              </>
            )}
          </div>

          {controlError ? (
            <p className="error-text" role="alert">
              {t.runtime.controlError}: {controlError}
            </p>
          ) : null}
        </div>
      ) : (
        <LoadingState text={t.common.loading} />
      )}

      <ConfirmDialog
        open={pending !== null}
        title={pendingCopy?.title ?? ''}
        confirmLabel={
          pending === 'start'
            ? t.runtime.start
            : pending === 'restart'
              ? t.runtime.restart
              : t.runtime.stop
        }
        busyLabel={t.runtime.controlBusy}
        cancelLabel={t.common.cancel}
        busy={busy}
        danger={pending !== 'start'}
        onCancel={() => {
          if (!busy) setPending(null);
        }}
        onConfirm={() => {
          if (pending) void run(pending);
        }}
      >
        {pendingCopy ? <p className="state__text">{pendingCopy.text}</p> : null}
        {controlError ? (
          <p className="error-text" role="alert">
            {t.runtime.controlError}: {controlError}
          </p>
        ) : null}
      </ConfirmDialog>
    </section>
  );
}
