import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../lib/cn.js';
import { TrendingDown, TrendingUp } from '../../icons/index.js';
import { Sparkline, type SparklineTone } from '../components/data-display/sparkline.js';
import type { Tone } from '../components/primitives/badge.js';

const toneAccent: Record<Tone, string> = {
  default: 'text-primary-strong',
  // Semantic status tokens, not the decorative accents — Phase 8.5. `accent-cool` and `accent-warm`
  // are ornament by definition (see `generate-palettes.mjs`) and measured 2.55:1 and 2.58:1 as text
  // on the page. The `-strong` forms are the AA-safe text colours for exactly this, and `default`
  // and `danger` beside them already used them.
  success: 'text-success-strong',
  warning: 'text-warning-strong',
  danger: 'text-destructive-strong',
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
  /**
   * How the tile is set.
   *
   * `default` is the dense metric: a small capitalised label over the figure. `feature` is the one
   * to lead a screen with — a sentence-case label with its icon at the far end and a larger figure,
   * for the handful of numbers somebody must act on. `compact` is the quiet one for a row of
   * holdings: the icon in a tinted square beside the figure and its label, no hint. Delta and trend
   * render in `default` and `feature`; a compact tile has no room for them and ignores them.
   */
  variant?: 'default' | 'feature' | 'compact';
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
  variant = 'default',
  className,
  ...props
}: StatCardProps) {
  if (variant === 'compact') {
    return (
      <div
        className={cn(
          'flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3',
          className,
        )}
        {...props}
      >
        {icon ? (
          <span
            className={cn(
              'flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent',
              toneAccent[tone],
            )}
          >
            {icon}
          </span>
        ) : null}
        <div className="flex min-w-0 flex-col">
          <span className="text-xl leading-tight font-bold tabular-nums">{value}</span>
          <span className="truncate text-xs text-muted-foreground">{label}</span>
        </div>
      </div>
    );
  }
  const feature = variant === 'feature';
  const rising = delta !== undefined && delta.value > 0;
  const deltaTone =
    delta?.goodWhen === undefined
      ? 'text-muted-foreground'
      : (delta.goodWhen === 'up') === rising
        ? 'text-success-strong'
        : 'text-destructive-strong';
  const DeltaIcon = rising ? TrendingUp : TrendingDown;
  return (
    <div
      className={cn(
        // The card surface, opaque: a theme whose page canvas is not white (Docs) showed the page
        // through a translucent tile, so the tiles read as holes rather than cards.
        'flex flex-col rounded-xl border border-border bg-card p-4',
        feature ? 'gap-1.5 shadow-xs' : 'gap-1',
        className,
      )}
      {...props}
    >
      {feature ? (
        <div className="flex items-center justify-between gap-2 text-[13px] font-medium text-muted-foreground">
          <span className="truncate">{label}</span>
          {icon ? <span className="shrink-0">{icon}</span> : null}
        </div>
      ) : (
        <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {icon ? <span className={cn('shrink-0', toneAccent[tone])}>{icon}</span> : null}
          <span className="truncate">{label}</span>
        </div>
      )}
      <div className="flex items-end justify-between gap-2">
        <div
          className={cn(
            'font-display tabular-nums',
            feature ? 'text-3xl leading-tight font-bold' : 'text-2xl font-semibold',
            toneAccent[tone],
          )}
        >
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
