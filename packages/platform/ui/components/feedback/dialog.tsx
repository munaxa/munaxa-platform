'use client';

import { useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../lib/cn.js';
import { useFocusTrap } from '../../hooks/use-focus-trap.js';

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  /** Max-width utility class for the panel (default: max-w-lg). */
  className?: string;
}

/**
 * Accessible modal dialog: rendered in a portal, labelled by its title, closes on
 * Escape and backdrop click, locks body scroll, and restores focus on close.
 * Stacking uses the design system's `z-modal` token.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
}: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();

  useFocusTrap({ active: open, containerRef: panelRef, onEscape: onClose });

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-modal flex items-center justify-center p-4"
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
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={cn(
          'relative z-modal w-full max-w-lg rounded-xl border border-border bg-card text-card-foreground shadow-card outline-none',
          className,
        )}
      >
        <div className="flex flex-col gap-1.5 p-6 pb-3">
          <h2 id={titleId} className="font-display text-lg font-semibold leading-none">
            {title}
          </h2>
          {description ? (
            <p id={descId} className="text-sm text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
        {children ? <div className="px-6 py-2">{children}</div> : null}
        {footer ? (
          <div className="flex items-center justify-end gap-2 p-6 pt-3">{footer}</div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
