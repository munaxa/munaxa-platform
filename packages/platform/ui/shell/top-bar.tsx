'use client';

import { type ReactNode } from 'react';
import { cn } from '../lib/cn.js';
import { Menu } from '../../icons/index.js';
import { useAppShell } from './app-shell-context.js';

export interface TopBarProps {
  /** Leading content — usually the drawer trigger plus a search entry point. */
  children?: ReactNode;
  /** Trailing content, aligned to the end: notifications, theme toggle, the user menu. */
  actions?: ReactNode;
  /** Keep the bar visible while the workspace below it scrolls. */
  sticky?: boolean;
  className?: string;
}

/**
 * The application header: one row spanning the content column, above the workspace.
 *
 * It is a `banner` landmark, which is what lets screen-reader users jump straight to the global
 * controls. It renders no controls of its own beyond the drawer trigger — search, notifications,
 * the theme switch and the user menu are all product concerns, passed in as children and actions.
 */
export function TopBar({ children, actions, sticky = false, className }: TopBarProps) {
  return (
    <header
      className={cn(
        'flex items-center gap-3 border-b border-border bg-background px-4 py-3 sm:px-6',
        sticky && 'sticky top-0 z-sticky',
        className,
      )}
    >
      {children}
      {actions ? <div className="ms-auto flex items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export interface SidebarTriggerProps {
  label?: string;
  className?: string;
}

/**
 * The hamburger that opens the navigation drawer.
 *
 * Visible only below the drawer breakpoint, and it advertises what it controls: `aria-expanded`
 * tells assistive technology whether the drawer is open, and `aria-haspopup="dialog"` says what
 * will appear. A bare icon button with neither is a button whose purpose a screen-reader user has
 * to guess at.
 */
export function SidebarTrigger({ label = 'Open navigation', className }: SidebarTriggerProps) {
  const { drawerOpen, setDrawerOpen, isMobile } = useAppShell();

  if (!isMobile) return null;

  return (
    <button
      type="button"
      onClick={() => setDrawerOpen(true)}
      aria-label={label}
      aria-expanded={drawerOpen}
      aria-haspopup="dialog"
      className={cn(
        'flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground',
        'transition-colors hover:bg-accent hover:text-foreground',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
    >
      <Menu className="size-5" aria-hidden="true" />
    </button>
  );
}
