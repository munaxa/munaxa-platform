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
  /**
   * How the rail sits against the page.
   *
   * `floating` (the default) is the inset card: a rounded, shadowed panel with a margin of page
   * around it. `flush` is a full-height column that meets the top bar and is separated from the page
   * by a single inline-end border — the Docs v2 shell. Both keep the same landmark, collapse
   * behaviour and slots; only the frame differs. A `flush` rail usually pairs with
   * `collapsible={false}` and a `SidebarCollapseToggle` in the top bar, because a control
   * overhanging a border it does not float above reads as a stray button.
   */
  variant?: 'floating' | 'flush';
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
  variant = 'floating',
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
  const flush = variant === 'flush';

  return (
    <nav
      aria-label={railLabel}
      className={cn(
        'sticky top-0 hidden h-screen shrink-0 self-start md:block',
        'transition-[width] duration-300 ease-in-out motion-reduce:transition-none',
        flush
          ? ['border-e border-border bg-card', collapsed ? 'w-16' : 'w-[236px]']
          : ['p-3', collapsed ? 'w-[84px]' : 'w-64'],
        className,
      )}
    >
      <div
        className={cn(
          'relative flex h-full flex-col',
          !flush && 'rounded-2xl border border-border bg-card p-3 shadow-card',
        )}
      >
        {brand ? (
          <div
            className={cn(
              'flex items-center gap-2',
              // Flush, the brand row is the same 56px as the top bar beside it, so the two read as
              // one band across the top of the frame.
              flush ? 'min-h-14 py-3' : 'py-2',
              collapsed ? 'justify-center px-0' : flush ? 'px-4' : 'px-2',
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

        <div
          className={cn(
            'flex flex-1 flex-col overflow-y-auto overflow-x-hidden',
            flush ? 'px-2 pb-4 pt-1' : 'mt-3',
          )}
        >
          {children}
        </div>

        {footer && !collapsed ? <div className={flush ? 'mx-3 mb-4' : 'mt-4'}>{footer}</div> : null}
      </div>
    </nav>
  );
}
