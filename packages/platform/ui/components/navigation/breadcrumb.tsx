'use client';

import { Fragment, type ReactNode } from 'react';
import { cn } from '../../lib/cn.js';
import { ChevronRight, MoreHorizontal } from '../../../icons/index.js';

export interface BreadcrumbItem {
  label: string;
  /** Omit on the final crumb — the current page is not a link to itself. */
  href?: string;
  icon?: ReactNode;
}

export type RenderBreadcrumbLink = (props: {
  href: string;
  className: string;
  children: ReactNode;
}) => ReactNode;

const defaultRenderLink: RenderBreadcrumbLink = ({ href, ...rest }) => <a href={href} {...rest} />;

export interface BreadcrumbProps {
  items: BreadcrumbItem[];
  /** Accessible name for the landmark. Override for a second trail on the same page. */
  label?: string;
  renderLink?: RenderBreadcrumbLink;
  /**
   * Collapse the middle when the trail is longer than this, keeping the first crumb and the last
   * two. A trail that wraps onto three lines has stopped orienting anyone.
   */
  maxItems?: number;
  className?: string;
}

/**
 * The trail of ancestors above the current page.
 *
 * Two details make it work with a screen reader, and both are easy to get wrong. The list is a real
 * `<ol>` inside a labelled `<nav>`, so the crumbs are announced as an ordered set with a position
 * and a count. And the last crumb is **not a link** — it carries `aria-current="page"` instead,
 * because a link to the page you are already on is a dead end that still gets announced as a link.
 *
 * The separators are `aria-hidden`: they are punctuation, and hearing "chevron right" between every
 * crumb is noise.
 */
export function Breadcrumb({
  items,
  label = 'Breadcrumb',
  renderLink = defaultRenderLink,
  maxItems,
  className,
}: BreadcrumbProps) {
  const collapsed =
    maxItems !== undefined && items.length > maxItems && items.length > 3
      ? [items[0]!, null, ...items.slice(-2)]
      : items;

  return (
    <nav aria-label={label} className={cn('min-w-0', className)}>
      <ol className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
        {collapsed.map((item, index) => {
          const isLast = index === collapsed.length - 1;
          return (
            <Fragment key={item ? `${item.label}-${index}` : `ellipsis-${index}`}>
              <li className="inline-flex min-w-0 items-center gap-1.5">
                {item === null ? (
                  <span
                    className="flex size-5 items-center justify-center"
                    aria-label="Hidden levels"
                  >
                    <MoreHorizontal className="size-4" aria-hidden="true" />
                  </span>
                ) : isLast || !item.href ? (
                  <span
                    {...(isLast ? { 'aria-current': 'page' as const } : {})}
                    className={cn(
                      'inline-flex items-center gap-1.5 truncate',
                      isLast && 'font-medium text-foreground',
                    )}
                  >
                    {item.icon ? (
                      <span aria-hidden="true" className="shrink-0">
                        {item.icon}
                      </span>
                    ) : null}
                    <span className="truncate">{item.label}</span>
                  </span>
                ) : (
                  renderLink({
                    href: item.href,
                    className: cn(
                      'inline-flex items-center gap-1.5 truncate rounded-sm transition-colors hover:text-foreground',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    ),
                    children: (
                      <>
                        {item.icon ? (
                          <span aria-hidden="true" className="shrink-0">
                            {item.icon}
                          </span>
                        ) : null}
                        <span className="truncate">{item.label}</span>
                      </>
                    ),
                  })
                )}
              </li>
              {!isLast ? (
                <li aria-hidden="true" className="flex items-center">
                  {/* Points along the trail, which runs the other way in RTL. */}
                  <ChevronRight className="size-3.5 rtl:-scale-x-100" />
                </li>
              ) : null}
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
