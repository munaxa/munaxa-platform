'use client';

import { type ReactNode } from 'react';
import { cn } from '../lib/cn.js';
import { useAppShell } from './app-shell-context.js';

/**
 * One navigation destination, already resolved by the application.
 *
 * "Resolved" is the contract: whether an item is visible, whether it is active, and what its label
 * says in the current locale are all product decisions — they depend on permissions, feature flags,
 * the route and the translation catalogue, none of which belong in a shared package. The platform
 * receives the answers and renders them.
 */
export interface NavigationItem {
  /** Stable key. Falls back to `href` when omitted. */
  id?: string;
  href: string;
  label: string;
  /** Rendered at the start of the row, and alone when the rail is collapsed. */
  icon?: ReactNode;
  /** Marks the current destination — sets `aria-current="page"`. */
  active?: boolean;
  /** Trailing content: a count, a status dot, a "new" pill. */
  badge?: ReactNode;
  disabled?: boolean;
}

/** A titled run of items. A group with no visible items should not be passed in at all. */
export interface NavigationGroup {
  id?: string;
  /** Section heading. Omit for a group that needs no title, such as a lone dashboard link. */
  title?: string;
  items: NavigationItem[];
}

/**
 * How a destination becomes a link.
 *
 * The platform must not import a router — `next/link`, `react-router`, `wouter` and a plain `<a>`
 * are all legitimate, and choosing one would make the package unusable in the others. The
 * application supplies the element and the platform supplies the props and the styling.
 */
export type RenderNavigationLink = (props: {
  href: string;
  className: string;
  children: ReactNode;
  'aria-current': 'page' | undefined;
  title: string | undefined;
}) => ReactNode;

const defaultRenderLink: RenderNavigationLink = ({ href, ...rest }) => <a href={href} {...rest} />;

export interface SidebarNavProps {
  groups: NavigationGroup[];
  /** Accessible name for the navigation landmark — "Main", "Settings", "Reports". */
  label: string;
  renderLink?: RenderNavigationLink;
  /** Force the icon-only rail. Defaults to the shell's collapsed state. */
  collapsed?: boolean;
  className?: string;
}

/**
 * The sidebar's navigation list.
 *
 * Collapsed, each row shows only its icon and carries the label as a `title`, so the accessible
 * name survives — an icon rail whose links are unnamed is unusable with a screen reader. Group
 * headings become a plain rule in that state, because a truncated heading is worse than none.
 */
export function SidebarNav({
  groups,
  label,
  renderLink = defaultRenderLink,
  collapsed: collapsedProp,
  className,
}: SidebarNavProps) {
  const shell = useAppShell();
  const collapsed = collapsedProp ?? shell.collapsed;

  return (
    <nav
      aria-label={label}
      className={cn('flex flex-1 flex-col', collapsed ? 'gap-2' : 'gap-5', className)}
    >
      {groups.map((group, index) => (
        <div key={group.id ?? group.title ?? index} className="flex flex-col gap-1">
          {group.title ? (
            collapsed ? (
              <div className="mx-auto my-1 h-px w-6 bg-border" aria-hidden="true" />
            ) : (
              <p className="px-3 pb-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground/70">
                {group.title}
              </p>
            )
          ) : null}

          {group.items.map((item) => {
            const className = cn(
              'group flex items-center gap-3 rounded-lg text-sm transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              collapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2',
              item.disabled && 'pointer-events-none opacity-50',
              item.active
                ? 'bg-primary font-medium text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            );
            return (
              <div key={item.id ?? item.href}>
                {renderLink({
                  href: item.href,
                  className,
                  'aria-current': item.active ? 'page' : undefined,
                  // Collapsed, the title is the only thing naming the link.
                  title: collapsed ? item.label : undefined,
                  children: (
                    <>
                      {item.icon ? (
                        <span className="shrink-0" aria-hidden="true">
                          {item.icon}
                        </span>
                      ) : null}
                      {collapsed ? (
                        <span className="sr-only">{item.label}</span>
                      ) : (
                        <span className="truncate">{item.label}</span>
                      )}
                      {!collapsed && item.badge ? (
                        <span className="ms-auto shrink-0">{item.badge}</span>
                      ) : null}
                    </>
                  ),
                })}
              </div>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
