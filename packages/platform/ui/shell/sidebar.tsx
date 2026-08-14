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
  /**
   * Accessible name for the rail itself, which is a `navigation` landmark — Phase 8.16.
   *
   * Overridable for the same reason `InspectorLayout`'s is: a product in another language, or one
   * with a second rail, has to be able to say so.
   */
  railLabel?: string;
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
  railLabel = 'Workspace',
  children,
  className,
}: SidebarProps) {
  const { collapsed, toggleCollapsed, isMobile } = useAppShell();

  // The drawer owns navigation at this width. Rendering both would duplicate every link in the
  // accessibility tree and in the tab order.
  if (isMobile) return null;

  /*
   * A **named `<nav>`** — Phase 8.16, and the third answer this element has had.
   *
   * Phase 8.12 found two *unnamed* `complementary` landmarks here and in `Split`'s inspector, which
   * a landmark list showed as two indistinguishable entries (`landmark-unique`). It turned this
   * `<aside>` into a `<div>`, which was right about the duplicate and wrong about what it left
   * behind: the rail also holds the brand, and with no landmark around it the brand lockup sat
   * outside the landmark tree entirely. Phase 8.16 measured the result — `region` on **every route
   * of the product, in both themes**, one node each, always the brand image.
   *
   * Neither `<aside>` nor `<div>` is the answer. The rail is not complementary content and it is
   * not structureless: it is the workspace's navigation column, holding the brand, the primary
   * `<nav>` and a footer slot. So it says that, with a name — the pattern `InspectorLayout`
   * already uses. A landmark list now reads "Workspace › Main" rather than either an anonymous
   * `complementary` or nothing at all.
   *
   * Nesting a named `navigation` inside a named `navigation` is valid and is the honest shape:
   * "everything you navigate the workspace with" contains "the primary links". The alternative
   * considered and rejected was moving the brand inside the inner `<nav>`, which `Sidebar` cannot
   * do — the inner nav is the consumer's `children`.
   */
  return (
    <nav
      aria-label={railLabel}
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
    </nav>
  );
}
