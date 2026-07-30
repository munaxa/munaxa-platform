import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../lib/cn.js';
import { TrendingDown, TrendingUp } from '../../icons/index.js';
import { Sparkline, type SparklineTone } from '../components/data-display/sparkline.js';
import type { Tone } from '../components/primitives/badge.js';

const toneAccent: Record<Tone, string> = {
  default: 'text-primary-strong',
  success: 'text-accent-cool',
  warning: 'text-accent-warm',
  danger: 'text-destructive',
  muted: 'text-muted-foreground',
};

/**
 * A period-on-period change.
 *
 * `goodWhen` is the field that matters and the one KPI tiles usually get wrong. A rise is not
 * inherently good: attendance going up is good, absences going up is not, and colouring every
 * increase green tells half the dashboard the opposite of the truth. Direction is what happened;
 * `goodWhen` is what it means.
 */
export interface StatDelta {
  /** The change. Its sign is the direction. */
  value: number;
  /** How it reads — `'+12%'`, `'-4 students'`. Defaults to the signed number. */
  label?: ReactNode;
  /** Which way is the good way. Omit for a neutral, uncoloured change. */
  goodWhen?: 'up' | 'down';
  /** What it is compared against — "vs last term". */
  comparison?: ReactNode;
}

export interface StatCardProps extends HTMLAttributes<HTMLDivElement> {
  /** Short label above the figure (e.g. "Students"). */
  label: ReactNode;
  /** The headline figure. */
  value: ReactNode;
  /** Optional secondary line under the value (e.g. "of 1,300"). */
  hint?: ReactNode;
  /** Optional leading glyph/icon. */
  icon?: ReactNode;
  /** Accent tone applied to the value + icon. */
  tone?: Tone;
  /** Period-on-period change, rendered under the figure. */
  delta?: StatDelta;
  /** Recent history, drawn as an inline sparkline. Decorative — the figure carries the meaning. */
  trend?: number[];
  trendTone?: SparklineTone;
}

/**
 * A compact KPI/metric tile. The building block for the operational strips on Academic Year
 * cards and dashboards. Token-only styling → RTL + dark/light come for free.
 */
export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = 'default',
  delta,
  trend,
  trendTone,
  className,
  ...props
}: StatCardProps) {
  const rising = delta !== undefined && delta.value > 0;
  const deltaTone =
    delta?.goodWhen === undefined
      ? 'text-muted-foreground'
      : (delta.goodWhen === 'up') === rising
        ? 'text-success-strong'
        : 'text-destructive';
  const DeltaIcon = rising ? TrendingUp : TrendingDown;
  return (
    <div
      className={cn(
        'flex flex-col gap-1 rounded-xl border border-border bg-card/60 p-4',
        className,
      )}
      {...props}
    >
      <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {icon ? <span className={cn('shrink-0', toneAccent[tone])}>{icon}</span> : null}
        <span className="truncate">{label}</span>
      </div>
      <div className="flex items-end justify-between gap-2">
        <div className={cn('font-display text-2xl font-semibold tabular-nums', toneAccent[tone])}>
          {value}
        </div>
        {trend && trend.length > 1 ? (
          <Sparkline values={trend} tone={trendTone ?? sparklineTone(tone)} showLast />
        ) : null}
      </div>
      {delta ? (
        <div className={cn('flex items-center gap-1 text-xs font-medium', deltaTone)}>
          {delta.value === 0 ? null : <DeltaIcon className="size-3.5" aria-hidden="true" />}
          <span className="tabular-nums">
            {delta.label ?? `${delta.value > 0 ? '+' : ''}${delta.value}`}
          </span>
          {delta.comparison ? (
            <span className="font-normal text-muted-foreground">{delta.comparison}</span>
          ) : null}
        </div>
      ) : null}
      {hint ? <div className="text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

/** The card's tone vocabulary mapped onto the sparkline's. */
function sparklineTone(tone: Tone): SparklineTone {
  return tone === 'default' ? 'primary' : tone === 'muted' ? 'muted' : tone;
}
