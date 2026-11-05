import type { CSSProperties } from 'react';

interface MeterProps {
  value: number;
  label?: string;
  tone?: 'cool' | 'accent' | 'bad';
}

export function Meter({ value, label, tone = 'cool' }: MeterProps) {
  const clamped = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
  const style = { '--meter-value': clamped } as CSSProperties;

  return (
    <div
      className="meter"
      role={label ? 'progressbar' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      aria-valuemin={label ? 0 : undefined}
      aria-valuemax={label ? 100 : undefined}
      aria-valuenow={label ? Math.round(clamped * 100) : undefined}
    >
      <span className={`meter__fill meter__fill--${tone}`} style={style} />
    </div>
  );
}
