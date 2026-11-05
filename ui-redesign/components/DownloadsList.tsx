import type { Copy } from '../copy';
import { fill } from '../copy';
import { formatBytes, ratio, sanitizeMeta } from '../lib/format';
import type { DownloadJob, DownloadJobStatus } from '../lib/legacy';
import { EmptyState } from './StateBlock';
import { Meter } from './Meter';

interface DownloadsListProps {
  jobs: DownloadJob[];
  t: Copy;
  onCancel?: (id: string) => void;
  onOpenPull?: () => void;
  limit?: number;
}

const STATUS_RANK: Record<DownloadJobStatus, number> = {
  running: 0,
  error: 1,
  success: 2,
  cancelled: 3
};

function statusLabel(status: DownloadJobStatus, t: Copy): string {
  switch (status) {
    case 'running':
      return t.pull.jobRunning;
    case 'success':
      return t.pull.jobSuccess;
    case 'error':
      return t.pull.jobError;
    case 'cancelled':
      return t.pull.jobCancelled;
  }
}

function statusClass(status: DownloadJobStatus): string {
  switch (status) {
    case 'running':
      return 'chip chip--cool';
    case 'success':
      return 'chip chip--ok';
    case 'error':
      return 'chip chip--bad';
    case 'cancelled':
      return 'chip chip--plain';
  }
}

function sourceLabel(job: DownloadJob, t: Copy): string {
  if (job.kind === 'huggingface') return t.pull.sourceHuggingFace;
  if (job.kind === 'modelscope') return t.pull.sourceModelScope;
  return t.pull.sourceOllama;
}

export function DownloadsList({ jobs, t, onCancel, onOpenPull, limit }: DownloadsListProps) {
  if (jobs.length === 0) {
    return (
      <EmptyState
        title={t.pull.noJobs}
        text={t.pull.noJobsText}
        action={
          onOpenPull ? (
            <button type="button" className="btn btn--quiet" onClick={onOpenPull}>
              {t.runtime.openPull}
            </button>
          ) : undefined
        }
      />
    );
  }

  const ordered = [...jobs]
    .sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || b.updatedAt - a.updatedAt)
    .slice(0, limit ?? jobs.length);

  return (
    <div className="downloads-list">
      {ordered.map((job) => {
        const completed = formatBytes(job.completed) ?? t.common.notAvailable;
        const total = formatBytes(job.total);
        const percent = job.total > 0 ? ratio(job.completed, job.total) : 0;
        const bytesLabel =
          job.total > 0 && total
            ? `${completed} / ${total}`
            : fill(t.pull.unknownTotal, { done: completed });
        const layerStatus = job.layerStatus ? sanitizeMeta(job.layerStatus) : '';

        return (
          <div className="download-row" key={job.id}>
            <div className="download-row__main">
              <span className="download-row__title">{job.model}</span>
              <div className="download-row__meta">
                <span className="chip chip--plain">{sourceLabel(job, t)}</span>
                <span>{job.kind === 'pull' ? t.pull.jobPull : t.pull.jobGguf}</span>
                {layerStatus ? <span>{layerStatus}</span> : null}
              </div>
              {job.error ? (
                <p className="error-text" role="alert">
                  {sanitizeMeta(job.error)}
                </p>
              ) : null}
            </div>
            <div className="download-row__side">
              <span className={statusClass(job.status)}>{statusLabel(job.status, t)}</span>
              {job.status === 'running' && onCancel ? (
                <button
                  type="button"
                  className="btn btn--quiet btn--small"
                  onClick={() => onCancel(job.id)}
                >
                  {t.pull.cancel}
                </button>
              ) : null}
            </div>
            {job.total > 0 ? (
              <div className="download-row__bar">
                <Meter value={percent} label={`${job.model} ${Math.round(percent * 100)}%`} />
                <div className="download-row__bar-meta">
                  <span>{bytesLabel}</span>
                  <span className="measured">{Math.round(percent * 100)}%</span>
                </div>
              </div>
            ) : (
              <div className="download-row__bar">
                <div className="download-row__bar-meta">
                  <span>{bytesLabel}</span>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
