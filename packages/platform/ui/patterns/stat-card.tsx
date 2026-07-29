import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../lib/cn.js';
import type { Tone } from '../components/primitives/badge.js';

const toneAccent: Record<Tone, string> = {
  default: 'text-primary-strong',
  success: 'text-accent-cool',
  warning: 'text-accent-warm',
  danger: 'text-destructive',
  muted: 'text-muted-foreground',
};

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
  className,
  ...props
}: StatCardProps) {
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
      <div className={cn('font-display text-2xl font-semibold tabular-nums', toneAccent[tone])}>
        {value}
      </div>
      {hint ? <div className="text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}
