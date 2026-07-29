import { forwardRef, useId, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '../lib/cn.js';
import { Surface, type SurfaceProps } from './surface.js';

export interface PanelProps extends Omit<SurfaceProps, 'title'> {
  /** Panel heading. When present the panel is exposed as a labelled region. */
  title?: ReactNode;
  /** Controls aligned to the end of the header row. */
  actions?: ReactNode;
  /** Pinned to the bottom, below the scrollable body. */
  footer?: ReactNode;
  /** Constrain the body's height and let it scroll — for inspectors and long lists. */
  scrollBody?: boolean;
}

/**
 * A bordered region with an optional header and footer: the building block of inspectors,
 * filter panels, side rails and property lists.
 *
 * The header and footer stay fixed while only the body scrolls, which is what makes a panel usable
 * as a full-height inspector — the title and the actions remain reachable no matter how long the
 * content is.
 */
export const Panel = forwardRef<HTMLDivElement, PanelProps>(function Panel(
  { title, actions, footer, scrollBody = false, className, children, ...props },
  ref,
) {
  const headingId = useId();
  return (
    <Surface
      ref={ref}
      {...(title ? { 'aria-labelledby': headingId, role: 'region' } : {})}
      className={cn('flex flex-col overflow-hidden', className)}
      {...props}
    >
      {title || actions ? (
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-3">
          {title ? (
            <h2 id={headingId} className="font-display text-sm font-semibold">
              {title}
            </h2>
          ) : (
            <span />
          )}
          {actions ? <div className="flex items-center gap-1">{actions}</div> : null}
        </div>
      ) : null}
      <div className={cn('min-h-0 flex-1 p-4', scrollBody && 'overflow-y-auto')}>{children}</div>
      {footer ? <div className="shrink-0 border-t border-border px-4 py-3">{footer}</div> : null}
    </Surface>
  );
});

export interface ToolbarProps extends HTMLAttributes<HTMLDivElement> {
  /** Leading controls — search, filters, view switches. */
  children: ReactNode;
  /** Trailing controls, aligned to the end of the row. */
  actions?: ReactNode;
  /** Accessible name. A toolbar landmark without one is unidentifiable in a landmark list. */
  label: string;
  /** Keep the toolbar visible while the content below it scrolls. */
  sticky?: boolean;
}

/**
 * A row of controls acting on the content below it.
 *
 * `role="toolbar"` is deliberately *not* set. That role makes the whole group a single tab stop
 * with arrow-key navigation between its controls, which is right for a formatting palette and
 * wrong for the mixed bag of search boxes, selects and buttons an application toolbar actually
 * contains — arrow keys inside a text field must move the caret. This renders a labelled group and
 * leaves every control individually tabbable, which is the behaviour users expect here.
 */
export const Toolbar = forwardRef<HTMLDivElement, ToolbarProps>(function Toolbar(
  { children, actions, label, sticky = false, className, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      role="group"
      aria-label={label}
      className={cn(
        'flex flex-wrap items-center justify-between gap-3',
        sticky && 'sticky top-0 z-sticky bg-background/95 py-2 backdrop-blur-sm',
        className,
      )}
      {...props}
    >
      <div className="flex flex-1 flex-wrap items-center gap-2">{children}</div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
});
