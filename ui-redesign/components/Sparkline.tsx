interface SparklineProps {
  values: number[];
  emptyText: string;
}

/** A real sample trace: no seeded points, no area fill, no glow. */
export function Sparkline({ values, emptyText }: SparklineProps) {
  if (values.length < 2) {
    return <p className="sparkline__empty">{emptyText}</p>;
  }

  const width = 160;
  const height = 40;
  const pad = 2;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const flat = max === min;
  const span = flat ? 1 : max - min;

  const points = values.map((value, index) => {
    const x = pad + (index / (values.length - 1)) * (width - pad * 2);
    const y = flat ? height / 2 : height - pad - ((value - min) / span) * (height - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  return (
    <svg
      className="sparkline"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <line
        className="sparkline__grid"
        x1={pad}
        y1={height - pad}
        x2={width - pad}
        y2={height - pad}
      />
      <path className="sparkline__line" d={`M ${points.join(' L ')}`} />
    </svg>
  );
}
