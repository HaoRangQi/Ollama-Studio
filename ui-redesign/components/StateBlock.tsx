import type { ReactNode } from 'react';

export function LoadingState({
  text,
  rows = 2,
  reading = false
}: {
  text: string;
  rows?: number;
  reading?: boolean;
}) {
  return (
    <div className="state" role="status" aria-live="polite">
      <span className="visually-hidden">{text}</span>
      {reading ? <span className="skeleton skeleton--reading" aria-hidden="true" /> : null}
      {Array.from({ length: rows }, (_, index) => (
        <span
          key={index}
          className={`skeleton skeleton--line${index === rows - 1 ? ' skeleton--short' : ''}`}
          aria-hidden="true"
        />
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  text,
  action
}: {
  title: string;
  text?: string;
  action?: ReactNode;
}) {
  return (
    <div className="state">
      <p className="state__title">{title}</p>
      {text ? <p className="state__text">{text}</p> : null}
      {action}
    </div>
  );
}

export function ErrorState({
  title,
  text,
  retry,
  retryLabel
}: {
  title?: string;
  text: string;
  retry?: () => void;
  retryLabel: string;
}) {
  return (
    <div className="state" role="alert">
      {title ? <p className="state__title">{title}</p> : null}
      <p className="state__text error-text">{text}</p>
      {retry ? (
        <button type="button" className="btn btn--quiet" onClick={retry}>
          {retryLabel}
        </button>
      ) : null}
    </div>
  );
}
