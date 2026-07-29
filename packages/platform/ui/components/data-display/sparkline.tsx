import { useId } from 'react';
import { cn } from '../../lib/cn.js';

export type SparklineTone = 'primary' | 'success' | 'warning' | 'danger' | 'muted';

const STROKE: Record<SparklineTone, string> = {
  primary: 'stroke-primary-strong',
  success: 'stroke-success-strong',
  warning: 'stroke-warning-strong',
  danger: 'stroke-destructive',
  muted: 'stroke-muted-foreground',
};

const FILL: Record<SparklineTone, string> = {
  primary: 'text-primary-strong',
  success: 'text-success-strong',
  warning: 'text-warning-strong',
  danger: 'text-destructive',
  muted: 'text-muted-foreground',
};

export interface SparklineProps {
  values: number[];
  tone?: SparklineTone;
  width?: number;
  height?: number;
  /** Fill under the line. */
  area?: boolean;
  /** Mark the last point — where the series has got to is usually the point of a sparkline. */
  showLast?: boolean;
  /**
   * Accessible name. Omit it and the sparkline is hidden from assistive technology, which is
   * correct when it sits beside a figure that already says the same thing — the usual case in a
   * KPI card, where announcing "chart" after the number is noise.
   */
  'aria-label'?: string;
  className?: string;
}

/**
 * A tiny inline trend line, drawn as plain SVG.
 *
 * **Deliberately not ECharts.** An ECharts instance is a canvas or SVG root, a resize observer and
 * a full option pipeline; spending that on a sixty-pixel line inside a KPI card — twenty of them on
 * a dashboard — is an order of magnitude more machinery than the drawing needs, and it makes every
 * page with a stat tile pull in the charting bundle. A polyline is exact, has nothing to resize and
 * costs nothing.
 *
 * This is also the thing products were already hand-rolling: the same twelve lines of `viewBox`
 * arithmetic, copied, each with its own idea of padding.
 */
export function Sparkline({
  values,
  tone = 'primary',
  width = 96,
  height = 28,
  area = false,
  showLast = false,
  className,
  ...rest
}: SparklineProps) {
  const gradientId = useId();
  if (values.length < 2) return null;

  const pad = 2;
  const min = Math.min(...values);
  const max = Math.max(...values);
  // A flat series has no range to scale against; dividing by it would put every point at infinity.
  const range = max - min || 1;

  const points = values.map((value, index) => {
    const x = pad + (index / (values.length - 1)) * (width - 2 * pad);
    const y = height - pad - ((value - min) / range) * (height - 2 * pad);
    return [Number(x.toFixed(2)), Number(y.toFixed(2))] as const;
  });

  const line = points.map(([x, y]) => `${x},${y}`).join(' ');
  const last = points[points.length - 1] as readonly [number, number];
  const labelled = rest['aria-label'] !== undefined;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      className={cn('overflow-visible', FILL[tone], className)}
      {...(labelled
        ? { role: 'img', 'aria-label': rest['aria-label'] }
        : // Unlabelled it is decoration beside a figure that already carries the meaning.
          { 'aria-hidden': true })}
    >
      {area ? (
        <>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.28" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            d={`M${line.split(' ')[0]} L${line} L${width - pad},${height} L${pad},${height} Z`}
            fill={`url(#${gradientId})`}
          />
        </>
      ) : null}
      <polyline
        points={line}
        className={STROKE[tone]}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {showLast ? <circle cx={last[0]} cy={last[1]} r="2" fill="currentColor" /> : null}
    </svg>
  );
}
