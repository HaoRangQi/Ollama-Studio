import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Icon } from './Icon';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel: string;
  cancelLabel: string;
  danger?: boolean;
  busy?: boolean;
  icon?: string;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  danger = false,
  busy = false,
  icon,
  onConfirm,
  onCancel,
  children
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onCancel, open]);

  if (!open) return null;

  return (
    <div
      className="overlay"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div className="dialog" role="dialog" aria-modal="true" aria-label={title}>
        <div className="dialog-mark" data-danger={danger || undefined}>
          <Icon name={icon ?? (danger ? 'warning' : 'help')} size={22} filled={danger} />
        </div>
        <h3>{title}</h3>
        {description && <p className="dialog-desc">{description}</p>}
        {children}
        <div className="dialog-actions">
          <button
            ref={cancelRef}
            type="button"
            className="btn btn-ghost"
            onClick={onCancel}
            disabled={busy}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? '…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export interface PromptDialogProps {
  open: boolean;
  title: string;
  description?: string;
  label: string;
  defaultValue: string;
  confirmLabel: string;
  cancelLabel: string;
  busy?: boolean;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

export function PromptDialog({
  open,
  title,
  description,
  label,
  defaultValue,
  confirmLabel,
  cancelLabel,
  busy = false,
  onConfirm,
  onCancel
}: PromptDialogProps) {
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setValue(defaultValue);
    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 30);
    return () => window.clearTimeout(timer);
  }, [defaultValue, open]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onCancel, open]);

  if (!open) return null;

  const trimmed = value.trim();
  return (
    <div
      className="overlay"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <form
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onSubmit={(event) => {
          event.preventDefault();
          if (trimmed) onConfirm(trimmed);
        }}
      >
        <div className="dialog-mark">
          <Icon name="edit" size={22} />
        </div>
        <h3>{title}</h3>
        {description && <p className="dialog-desc">{description}</p>}
        <label className="dialog-field">
          <span>{label}</span>
          <input
            ref={inputRef}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            maxLength={120}
            spellCheck={false}
          />
        </label>
        <div className="dialog-actions">
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button type="submit" className="btn btn-primary" disabled={!trimmed || busy}>
            {busy ? '…' : confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
