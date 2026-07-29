'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../lib/cn.js';

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children?: ReactNode;
  footer?: ReactNode;
  /** Which logical edge the panel slides from (RTL-aware). Default: 'end'. */
  side?: 'start' | 'end';
  className?: string;
}

/**
 * Accessible slide-over panel rendered in a portal. Closes on Escape and backdrop
 * click, locks body scroll, restores focus. Anchored to a logical edge (start/end)
 * so it mirrors correctly under RTL. Stacking uses the `z-modal` token.
 */
export function Drawer({
  open,
  onClose,
  title,
  children,
  footer,
  side = 'end',
  className,
}: DrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      previouslyFocused?.focus?.();
    };
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-modal flex"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="fixed inset-0 bg-foreground/40 backdrop-blur-xs" aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          'relative z-modal flex h-full w-full max-w-md flex-col border-border bg-card text-card-foreground shadow-card outline-none',
          side === 'end' ? 'ms-auto border-s' : 'me-auto border-e',
          className,
        )}
      >
        <div className="flex items-center justify-between gap-2 border-b border-border p-6">
          <h2 id={titleId} className="font-display text-lg font-semibold leading-none">
            {title}
          </h2>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-6">{children}</div>
        {footer ? (
          <div className="flex items-center justify-end gap-2 border-t border-border p-6">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
