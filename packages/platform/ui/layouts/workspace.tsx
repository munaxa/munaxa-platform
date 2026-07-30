import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '../lib/cn.js';

export interface WorkspaceProps extends HTMLAttributes<HTMLDivElement> {
  /** Sticky bar above the scrolling area — breadcrumb, title, page-level actions. */
  header?: ReactNode;
  /** Pinned below the scrolling area — pagination, a save bar, a selection summary. */
  footer?: ReactNode;
  children: ReactNode;
}

/**
 * The scrolling content region of an application, between the chrome above and below it.
 *
 * The workspace itself is the scroll container, not the document, so the header stays put without
 * `position: fixed` and without the layout shift that comes with it. `min-h-0` on the body is what
 * makes that work inside a flex column — without it the body refuses to shrink and the whole page
 * scrolls instead.
 *
 * The body is the `main` landmark, so "skip to content" and screen-reader landmark navigation
 * arrive at the content rather than at the navigation chrome.
 */
export const Workspace = forwardRef<HTMLDivElement, WorkspaceProps>(function Workspace(
  { header, footer, children, className, ...props },
  ref,
) {
  return (
    <div ref={ref} className={cn('flex h-full min-h-0 flex-col', className)} {...props}>
      {header ? (
        <div className="shrink-0 border-b border-border bg-background">{header}</div>
      ) : null}
      <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      {footer ? (
        <div className="shrink-0 border-t border-border bg-background">{footer}</div>
      ) : null}
    </div>
  );
});
