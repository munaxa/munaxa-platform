'use client';

import { useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../lib/cn.js';
import { X } from '../../icons/index.js';
import { useFocusTrap } from '../hooks/use-focus-trap.js';
import { usePrefersReducedMotion } from '../hooks/use-breakpoint.js';
import { useAppShell } from './app-shell-context.js';

export interface NavigationDrawerProps {
  children: ReactNode;
  /** Accessible name for the dialog — "Navigation". */
  label: string;
  brand?: ReactNode;
  footer?: ReactNode;
  closeLabel?: string;
  className?: string;
}

/**
 * The narrow-viewport navigation panel: a slide-in sheet holding the same links as the rail.
 *
 * It is a modal dialog, and it behaves like one — focus moves in on open, Tab is trapped, Escape
 * and the scrim close it, the page behind cannot scroll, and focus returns to the trigger. That
 * shared behaviour comes from `useFocusTrap`, the same hook `Dialog` uses, so the two cannot drift.
 *
 * It renders only below the drawer breakpoint. Above it the `Sidebar` takes over, and because both
 * read the shell context there is no width at which both are mounted.
 */
export function NavigationDrawer({
  children,
  label,
  brand,
  footer,
  closeLabel = 'Close navigation',
  className,
}: NavigationDrawerProps) {
  const { drawerOpen, setDrawerOpen, isMobile } = useAppShell();
  const panelRef = useRef<HTMLDivElement>(null);
  const reducedMotion = usePrefersReducedMotion();

  useFocusTrap({
    active: drawerOpen && isMobile,
    containerRef: panelRef,
    onEscape: () => setDrawerOpen(false),
  });

  if (!drawerOpen || !isMobile || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-modal md:hidden">
      <div
        className="absolute inset-0 bg-foreground/40"
        onClick={() => setDrawerOpen(false)}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={cn(
          // `start-0` rather than `left-0`: the drawer enters from the leading edge, which is the
          // right-hand side in Arabic.
          'absolute inset-y-0 start-0 flex w-72 max-w-[85%] flex-col overflow-y-auto',
          'border-e border-border bg-card p-4 shadow-lg outline-none',
          !reducedMotion && 'animate-in slide-in-from-start duration-200',
          className,
        )}
      >
        <div className="flex items-center justify-between gap-2 px-2 py-3">
          {brand ?? <span />}
          <button
            type="button"
            onClick={() => setDrawerOpen(false)}
            aria-label={closeLabel}
            className={cn(
              'flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground',
              'transition-colors hover:bg-accent hover:text-foreground',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            )}
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-4 flex flex-1 flex-col">{children}</div>
        {footer ? <div className="mt-4">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}
