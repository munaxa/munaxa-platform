'use client';

import { useId, useState, type ReactNode } from 'react';
import { cn } from '../../lib/cn.js';

/**
 * Lightweight tooltip shown on hover and keyboard focus (accessible: the trigger
 * is described by the tooltip via aria-describedby). For richer positioning, wrap a
 * focusable element as `children`.
 */
export function Tooltip({
  content,
  children,
  className,
}: {
  content: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocusCapture={() => setOpen(true)}
      onBlurCapture={() => setOpen(false)}
    >
      <span aria-describedby={open ? id : undefined}>{children}</span>
      {open ? (
        <span
          role="tooltip"
          id={id}
          className={cn(
            'absolute bottom-full left-1/2 z-dropdown mb-2 -translate-x-1/2 whitespace-nowrap rounded-md',
            'border border-border bg-card px-2 py-1 text-xs text-card-foreground shadow-card',
            className,
          )}
        >
          {content}
        </span>
      ) : null}
    </span>
  );
}
