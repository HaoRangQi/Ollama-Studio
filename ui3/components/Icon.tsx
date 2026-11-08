import type { CSSProperties } from 'react';

export interface IconProps {
  name: string;
  className?: string;
  size?: number;
  weight?: number;
  filled?: boolean;
}

/** Material Symbols Rounded；装饰性图标默认从无障碍树隐藏。 */
export function Icon({ name, className = '', size = 20, weight = 400, filled = false }: IconProps) {
  const style: CSSProperties = {
    fontSize: `${size}px`,
    fontVariationSettings: `'FILL' ${filled ? 1 : 0}, 'wght' ${weight}, 'GRAD' 0, 'opsz' ${size}`
  };
  return (
    <span
      className={`material-symbols-rounded app-icon ${className}`.trim()}
      style={style}
      aria-hidden="true"
    >
      {name}
    </span>
  );
}

export function BrandMark({ size = 40 }: { size?: number }) {
  return (
    <span className="brand-mark" style={{ width: size, height: size }}>
      <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <path
          d="M16 5.8c5.7 0 9.2 4.2 9.2 9.6 0 5.8-4.1 10.8-9.2 10.8s-9.2-5-9.2-10.8c0-5.4 3.5-9.6 9.2-9.6Z"
          fill="#fffdf8"
        />
        <path d="M16 5.8V2.6" stroke="#fffdf8" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M16 3.2c1.8 0 3.2-1.3 3.2-3-1.8 0-3.2 1.3-3.2 3Z" fill="#fffdf8" />
        <circle cx="12.5" cy="14.6" r="1.15" fill="var(--color-sage-dark)" />
        <circle cx="19.5" cy="14.6" r="1.15" fill="var(--color-sage-dark)" />
        <path
          d="M13.4 18.9c1.6 1.3 3.6 1.3 5.2 0"
          stroke="var(--color-sage-dark)"
          strokeWidth="1.3"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}
