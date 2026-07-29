import type { HTMLAttributes } from 'react';
import { cn } from '../lib/cn.js';
import type { Tone } from '../components/primitives/badge.js';

const barTone: Record<Tone, string> = {
  default: 'bg-primary',
  success: 'bg-accent-cool',
  warning: 'bg-accent-warm',
  danger: 'bg-destructive',
  muted: 'bg-muted-foreground',
};

function clampPct(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export interface ProgressProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  /** 0–100. Values outside the range are clamped. */
  value: number;
  tone?: Tone;
  /** Track height in Tailwind units (default 2 => h-2). */
  size?: 'sm' | 'md';
  label?: string;
}

/** Linear progress/completion bar. Accessible (role=progressbar). */
export function Progress({
  value,
  tone = 'default',
  size = 'md',
  label,
  className,
  ...props
}: ProgressProps) {
  const pct = clampPct(value);
  return (
    <div
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={cn(
        'w-full overflow-hidden rounded-full bg-secondary',
        size === 'sm' ? 'h-1.5' : 'h-2',
        className,
      )}
      {...props}
    >
      <div
        className={cn('h-full rounded-full transition-[width] duration-500', barTone[tone])}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export interface ReadinessRingProps {
  /** 0–100 completion. */
  value: number;
  /** Diameter in px. */
  size?: number;
  /** Stroke thickness in px. */
  thickness?: number;
  /** Override the auto tone (>=90 success, >=60 default/primary, else warning). */
  tone?: Tone;
  className?: string;
  /** Small caption rendered under the percentage (e.g. "Ready"). */
  caption?: string;
}

const ringStroke: Record<Tone, string> = {
  default: 'stroke-primary-strong',
  success: 'stroke-accent-cool',
  warning: 'stroke-accent-warm',
  danger: 'stroke-destructive',
  muted: 'stroke-muted-foreground',
};

/**
 * A circular readiness gauge — the "Academic Readiness Score" at-a-glance indicator.
 * Auto-tones by completion: <60 warning, <90 primary, >=90 success (overridable).
 */
export function ReadinessRing({
  value,
  size = 72,
  thickness = 7,
  tone,
  className,
  caption,
}: ReadinessRingProps) {
  const pct = clampPct(value);
  const resolvedTone: Tone = tone ?? (pct >= 90 ? 'success' : pct >= 60 ? 'default' : 'warning');
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - pct / 100);
  return (
    <div
      className={cn('relative inline-flex shrink-0 items-center justify-center', className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${pct}%${caption ? ` ${caption}` : ''}`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={thickness}
          className="stroke-secondary"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          className={cn('transition-[stroke-dashoffset] duration-700', ringStroke[resolvedTone])}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className="font-display text-sm font-semibold tabular-nums">{pct}%</span>
        {caption ? (
          <span className="mt-0.5 text-[9px] uppercase tracking-wide text-muted-foreground">
            {caption}
          </span>
        ) : null}
      </div>
    </div>
  );
}
