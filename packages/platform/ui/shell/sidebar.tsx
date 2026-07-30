'use client';

import { type ReactNode } from 'react';
import { cn } from '../lib/cn.js';
import { ChevronLeft } from '../../icons/index.js';
import { useAppShell } from './app-shell-context.js';

export interface SidebarProps {
  /** Brand lockup. Receives `collapsed` so it can swap a wordmark for a symbol. */
  brand?: ReactNode | ((collapsed: boolean) => ReactNode);
  /** Pinned below the navigation — session summary, tenant, version. Hidden when collapsed. */
  footer?: ReactNode;
  /** Accessible name for the collapse control, e.g. "Collapse navigation". */
  collapseLabel?: string;
  expandLabel?: string;
  /** Hide the collapse control for a shell whose rail is fixed. */
  collapsible?: boolean;
  children: ReactNode;
  className?: string;
}

/**
 * The desktop navigation rail: a sticky, full-height column that toggles between an icon rail and
 * a labelled panel.
 *
 * It renders nothing below the drawer breakpoint — at phone widths there is no width at which a
 * rail and readable content both fit, and the same navigation appears in `NavigationDrawer`
 * instead. Because both read the shell context, they can never both be showing.
 *
 * The width transition is a `motion-reduce:transition-none` away from being ignored when the user
 * has asked for reduced motion; the end state is identical either way.
 */
export function Sidebar({
  brand,
  footer,
  collapseLabel = 'Collapse navigation',
  expandLabel = 'Expand navigation',
  collapsible = true,
  children,
  className,
}: SidebarProps) {
  const { collapsed, toggleCollapsed, isMobile } = useAppShell();

  // The drawer owns navigation at this width. Rendering both would duplicate every link in the
  // accessibility tree and in the tab order.
  if (isMobile) return null;

  return (
    <aside
      className={cn(
        'sticky top-0 hidden h-screen shrink-0 self-start p-3 md:block',
        'transition-[width] duration-300 ease-in-out motion-reduce:transition-none',
        collapsed ? 'w-[84px]' : 'w-64',
        className,
      )}
    >
      <div className="relative flex h-full flex-col rounded-2xl border border-border bg-card p-3 shadow-card">
        {brand ? (
          <div
            className={cn(
              'flex items-center gap-2 py-2',
              collapsed ? 'justify-center px-0' : 'px-2',
            )}
          >
            {typeof brand === 'function' ? brand(collapsed) : brand}
          </div>
        ) : null}

        {collapsible ? (
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? expandLabel : collapseLabel}
            aria-expanded={!collapsed}
            title={collapsed ? expandLabel : collapseLabel}
            className={cn(
              'absolute -end-2.5 top-16 z-10 flex h-6 w-6 items-center justify-center rounded-full',
              'border border-border bg-card text-muted-foreground shadow-card transition-colors',
              'hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            )}
          >
            {/* One glyph, pointed by transform: it faces the way the panel will move, flips when
                collapsed, and mirrors again in RTL. Two icons swapped by a `rtl:` class would need
                four states kept in sync by hand. */}
            <ChevronLeft
              aria-hidden="true"
              className={cn(
                'size-3.5 transition-transform motion-reduce:transition-none rtl:-scale-x-100',
                collapsed && 'rotate-180',
              )}
            />
          </button>
        ) : null}

        <div className="mt-3 flex flex-1 flex-col overflow-y-auto overflow-x-hidden">
          {children}
        </div>

        {footer && !collapsed ? <div className="mt-4">{footer}</div> : null}
      </div>
    </aside>
  );
}
