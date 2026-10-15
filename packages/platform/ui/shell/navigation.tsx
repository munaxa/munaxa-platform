'use client';

import { type ReactNode } from 'react';
import { cn } from '../lib/cn.js';
import { Overline } from '../components/primitives/overline.js';
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
  /**
   * How the current page is marked.
   *
   * `filled` (the default) paints the active row in the brand fill. `indicator` keeps it on the
   * faint brand wash (`primary/5`) and draws a 2px brand bar on its inline-start edge — the Docs v2 rail, set
   * a step denser and with sans-serif group headings, where a column of mostly-text rows reads
   * better with one thin mark than with a solid block. The bar is an inset shadow rather than a
   * border so the row does not shift by 2px when it becomes active, and it flips side in RTL.
   */
  variant?: 'filled' | 'indicator';
  /**
   * A rule between groups. For a long settings menu whose groups are the main structure — the
   * headings alone are small, and a hairline makes the break between "Identity" and "Organisation"
   * visible at a glance. Not drawn above the first group, and not drawn in the collapsed rail, which
   * already marks each group with its own rule.
   */
  dividers?: boolean;
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
  variant = 'filled',
  dividers = false,
  className,
}: SidebarNavProps) {
  const shell = useAppShell();
  const collapsed = collapsedProp ?? shell.collapsed;
  const indicator = variant === 'indicator';

  return (
    <nav
      aria-label={label}
      className={cn(
        'flex flex-1 flex-col',
        collapsed ? 'gap-2' : indicator ? 'gap-3.5' : 'gap-5',
        className,
      )}
    >
      {groups.map((group, index) => (
        <div
          key={group.id ?? group.title ?? index}
          className={cn(
            'flex flex-col',
            indicator ? 'gap-0.5' : 'gap-1',
            dividers && !collapsed && index > 0 && 'border-t border-border pt-3',
          )}
        >
          {group.title ? (
            collapsed ? (
              <div className="mx-auto my-1 h-px w-6 bg-border" aria-hidden="true" />
            ) : indicator ? (
              <Overline as="p" className="px-2.5 pb-0.5">
                {group.title}
              </Overline>
            ) : (
              <p
                className={cn(
                  'px-3 pb-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground',
                  // Letter-spacing pulls apart the joins between Arabic letters, and Arabic has no
                  // case for `uppercase` to change — so in a right-to-left document the heading is
                  // set without either.
                  'rtl:tracking-normal',
                )}
              >
                {group.title}
              </p>
            )
          ) : null}

          {group.items.map((item) => {
            const className = cn(
              'group flex items-center rounded-lg transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              indicator ? 'gap-2.5 text-[13px]' : 'gap-3 text-sm',
              collapsed ? 'justify-center px-0 py-2.5' : indicator ? 'px-2.5 py-2' : 'px-3 py-2',
              item.disabled && 'pointer-events-none opacity-50',
              item.active
                ? indicator
                  ? [
                      // `primary/5` for the same reason as `DataGrid`'s active row: a badge in the
                      // row (an approvals count) is only guaranteed AA over that wash.
                      'bg-primary/5 font-semibold text-foreground',
                      'shadow-[inset_2px_0_0_var(--primary)] rtl:shadow-[inset_-2px_0_0_var(--primary)]',
                    ]
                  : 'bg-primary font-medium text-primary-foreground'
                : indicator
                  ? 'text-muted-foreground hover:bg-primary/5 hover:text-foreground'
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
