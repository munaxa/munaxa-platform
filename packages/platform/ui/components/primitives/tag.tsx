'use client';

import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '../../lib/cn.js';
import { X } from '../../../icons/index.js';

export type TagTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger';
export type TagSize = 'sm' | 'md';

const TONE: Record<TagTone, string> = {
  neutral: 'border-border bg-secondary text-secondary-foreground',
  primary: 'border-primary/30 bg-primary/10 text-primary-strong',
  success: 'border-success/30 bg-success/10 text-success-strong',
  warning: 'border-warning/30 bg-warning/10 text-warning-strong',
  danger: 'border-destructive/30 bg-destructive/10 text-destructive',
};

const SIZE: Record<TagSize, string> = {
  sm: 'h-6 gap-1 px-2 text-xs',
  md: 'h-7 gap-1.5 px-2.5 text-sm',
};

export interface TagProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: TagTone;
  size?: TagSize;
  /** Leading glyph. Decorative — the label carries the meaning. */
  icon?: ReactNode;
  /** Show a remove control. Only pass this when removal is actually possible. */
  onRemove?: () => void;
  /** Accessible name for the remove control. Include the tag's own label. */
  removeLabel?: string;
}

/**
 * A compact label for a value the user has chosen or that has been applied to a record — a filter
 * chip, a selected option, a keyword.
 *
 * `Badge` and `Tag` look similar and mean different things: a badge is *status the system reports*
 * and is never interactive; a tag is *a value*, and it may be removable. Keeping them apart is why
 * the remove affordance lives here and not there.
 *
 * The remove control is a real button — focusable, keyboard operable and separately named — rather
 * than a click handler on the tag itself, so it can be reached and dismissed without a pointer.
 */
export const Tag = forwardRef<HTMLSpanElement, TagProps>(function Tag(
  {
    tone = 'neutral',
    size = 'md',
    icon,
    onRemove,
    removeLabel = 'Remove',
    className,
    children,
    ...props
  },
  ref,
) {
  return (
    <span
      ref={ref}
      className={cn(
        'inline-flex max-w-full items-center rounded-md border font-medium',
        TONE[tone],
        SIZE[size],
        className,
      )}
      {...props}
    >
      {icon ? (
        <span className="shrink-0" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <span className="truncate">{children}</span>
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={removeLabel}
          className={cn(
            '-me-0.5 ms-0.5 flex shrink-0 items-center justify-center rounded-sm',
            'opacity-60 transition-opacity hover:opacity-100',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          )}
        >
          <X className={size === 'sm' ? 'size-3' : 'size-3.5'} aria-hidden="true" />
        </button>
      ) : null}
    </span>
  );
});
