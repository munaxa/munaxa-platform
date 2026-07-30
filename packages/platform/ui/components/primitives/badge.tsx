import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/cn.js';

export type Tone = 'default' | 'success' | 'warning' | 'danger' | 'muted';

/*
 * A badge is a tinted wash with a label on top, so the label needs the `-strong` form of each
 * role: the plain status colours are fills and sit at ~2.2:1 on a light surface. `success` and
 * `warning` previously borrowed the decorative accent roles, which is a different question
 * entirely — an accent is ornament, a status carries meaning.
 */
const toneClass: Record<Tone, string> = {
  default: 'border-primary/30 bg-primary/15 text-primary-strong',
  success: 'border-success/30 bg-success/15 text-success-strong',
  warning: 'border-warning/30 bg-warning/15 text-warning-strong',
  danger: 'border-destructive/30 bg-destructive/15 text-destructive',
  muted: 'border-border bg-secondary/60 text-muted-foreground',
};

export function Badge({
  tone = 'default',
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium',
        toneClass[tone],
        className,
      )}
      {...props}
    />
  );
}
