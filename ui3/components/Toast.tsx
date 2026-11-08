import { Icon } from './Icon';

export type ToastTone = 'info' | 'success' | 'warn' | 'error';

export interface ToastState {
  id: number;
  message: string;
  tone: ToastTone;
  actionLabel?: string;
  onAction?: () => void;
}

const TONE_ICON: Record<ToastTone, string> = {
  info: 'info',
  success: 'check_circle',
  warn: 'warning',
  error: 'error'
};

export function Toast({
  toast,
  closeLabel,
  onClose
}: {
  toast: ToastState | null;
  closeLabel: string;
  onClose: () => void;
}) {
  if (!toast) return null;
  return (
    <div className={`toast toast-${toast.tone}`} role="status" aria-live="polite">
      <span className="toast-icon">
        <Icon name={TONE_ICON[toast.tone]} size={19} filled />
      </span>
      <span className="toast-message">{toast.message}</span>
      {toast.actionLabel && toast.onAction && (
        <button
          type="button"
          className="toast-action"
          onClick={() => {
            toast.onAction?.();
            onClose();
          }}
        >
          {toast.actionLabel}
        </button>
      )}
      <button type="button" className="toast-close" onClick={onClose} aria-label={closeLabel}>
        <Icon name="close" size={17} />
      </button>
    </div>
  );
}
