'use client';

import { useCallback, useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../lib/cn.js';

/** Elements that can receive focus, in DOM order — the tab ring the trap cycles through. */
const FOCUSABLE = [
  'a[href]',
  'button',
  'input',
  'select',
  'textarea',
  '[tabindex]:not([tabindex="-1"])',
]
  .map((s) => `${s}:not([disabled]):not([tabindex="-1"])`)
  .join(',');

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

  // Keep the latest onClose without making the focus/scroll-lock effect depend on it: callers pass a
  // fresh inline `onClose` on every render, and if the effect re-ran each time it would steal focus
  // back to the panel after every keystroke (so typing in a field only registered one character).
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const handleClose = useCallback(() => onCloseRef.current(), []);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
        return;
      }
      if (e.key !== 'Tab') return;

      // Focus trap. `aria-modal` hides the rest of the page from assistive technology but does
      // nothing to the tab order, so without this Tab walks straight out of the dialog and into
      // the page behind it — where the user cannot see what is focused.
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true',
      );
      if (focusable.length === 0) {
        // Nothing to move to; keep focus on the panel itself rather than losing it to the page.
        e.preventDefault();
        panel.focus();
        return;
      }
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = document.activeElement;

      if (e.shiftKey && (active === first || active === panel)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
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
    // Only (re)run when the dialog opens/closes — NOT when onClose's identity changes each render.
  }, [open, handleClose]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-modal flex items-center justify-center p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="fixed inset-0 bg-foreground/40 backdrop-blur-sm" aria-hidden="true" />
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
