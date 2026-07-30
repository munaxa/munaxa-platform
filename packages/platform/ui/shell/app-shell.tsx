'use client';

import { type ReactNode } from 'react';
import { cn } from '../lib/cn.js';
import { useAppShell } from './app-shell-context.js';

export interface SkipLinkProps {
  label: string;
  className?: string;
}

/**
 * The first focusable element on the page: a link past the navigation, straight to the content.
 *
 * Without it, a keyboard user tabs through every navigation link on every page before reaching
 * anything on it. It is visually hidden until focused, which is the whole trick — invisible to
 * everyone who does not need it, unmissable to everyone who does.
 *
 * The target id comes from the shell context, so the link and the main region cannot disagree.
 */
export function SkipLink({ label, className }: SkipLinkProps) {
  const { mainId } = useAppShell();
  return (
    <a
      href={`#${mainId}`}
      className={cn(
        'sr-only focus:not-sr-only focus:absolute focus:start-4 focus:top-4 focus:z-max',
        'focus:rounded-lg focus:border focus:border-border focus:bg-card focus:px-4 focus:py-2',
        'focus:text-sm focus:shadow-card',
        className,
      )}
    >
      {label}
    </a>
  );
}

export interface AppShellProps {
  /** The desktop rail. Rendered before the content column, so it comes first in the tab order. */
  sidebar?: ReactNode;
  /** The narrow-viewport drawer. Portals itself; position in the tree does not matter. */
  drawer?: ReactNode;
  /** The header row above the workspace. */
  topBar?: ReactNode;
  /** Pinned below the workspace — a save bar, a selection summary. */
  footer?: ReactNode;
  /** Text for the skip link. Omit to render no skip link (rare; prefer supplying it). */
  skipLinkLabel?: string;
  /** Decorative backdrop rendered behind everything, e.g. a brand gradient. */
  backdrop?: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * The application frame: navigation beside a scrolling content column.
 *
 * The shell owns *structure* and nothing else. It renders no logo, no search, no user menu and no
 * navigation data, because every one of those differs per product — School shows a tenant, Work
 * will show an organisation switcher, and a shell that knew about either would need editing before
 * the second product could use it. Each is a slot.
 *
 * The content column scrolls rather than the document, so the top bar stays put without
 * `position: fixed` and the layout shift that comes with it. `min-w-0` on that column is what lets
 * a wide table inside it scroll instead of pushing the sidebar off screen.
 */
export function AppShell({
  sidebar,
  drawer,
  topBar,
  footer,
  skipLinkLabel,
  backdrop,
  children,
  className,
}: AppShellProps) {
  const { mainId } = useAppShell();

  return (
    <div className={cn('flex min-h-screen', className)}>
      {backdrop}
      {skipLinkLabel ? <SkipLink label={skipLinkLabel} /> : null}
      {sidebar}
      {drawer}

      <div className="flex min-w-0 flex-1 flex-col">
        {topBar}
        <main id={mainId} tabIndex={-1} className="min-h-0 flex-1 outline-none">
          {children}
        </main>
        {footer ? <div className="shrink-0 border-t border-border">{footer}</div> : null}
      </div>
    </div>
  );
}
