import { useEffect } from 'react';
import type { RefObject } from 'react';

/** 点击浮层外部或按 Esc 时关闭。 */
export function useDismissable<T extends HTMLElement>(
  ref: RefObject<T | null>,
  onClose: () => void,
  active = true
): void {
  useEffect(() => {
    if (!active) return;
    const handlePointer = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', handlePointer, true);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('pointerdown', handlePointer, true);
      document.removeEventListener('keydown', handleKey);
    };
  }, [active, onClose, ref]);
}
