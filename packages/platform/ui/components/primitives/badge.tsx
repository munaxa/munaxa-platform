import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/cn.js';

export type Tone = 'default' | 'success' | 'warning' | 'danger' | 'muted';

const toneClass: Record<Tone, string> = {
  default: 'border-primary/30 bg-primary/15 text-primary-strong',
  success: 'border-accent-cool/30 bg-accent-cool/15 text-accent-cool',
  warning: 'border-accent-warm/30 bg-accent-warm/15 text-accent-warm',
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
