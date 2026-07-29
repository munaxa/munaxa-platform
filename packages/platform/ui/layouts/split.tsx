import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '../lib/cn.js';
import { GAP, type Space } from './scales.js';

/** How the available width is divided between the two panes, at `md` and above. */
export type SplitRatio = '1/2' | '1/3' | '2/3' | '1/4' | '3/4';

const START_BASIS: Record<SplitRatio, string> = {
  '1/2': 'md:w-1/2',
  '1/3': 'md:w-1/3',
  '2/3': 'md:w-2/3',
  '1/4': 'md:w-1/4',
  '3/4': 'md:w-3/4',
};

export interface SplitProps extends HTMLAttributes<HTMLDivElement> {
  /** The leading pane — left in LTR, right in RTL. */
  start: ReactNode;
  /** The trailing pane, which takes the remaining width. */
  end: ReactNode;
  ratio?: SplitRatio;
  gap?: Space;
  /** Stack the panes instead of splitting them below this breakpoint. */
  stackBelow?: 'sm' | 'md' | 'lg';
}

const STACK_BELOW: Record<NonNullable<SplitProps['stackBelow']>, string> = {
  sm: 'sm:flex-row',
  md: 'md:flex-row',
  lg: 'lg:flex-row',
};

/**
 * Two panes side by side, stacking on narrow viewports.
 *
 * `start` and `end` rather than `left` and `right`: flex row follows the writing direction, so the
 * leading pane is on the left in English and on the right in Arabic. Naming them by side would be
 * wrong in half the products this platform serves.
 *
 * The panes stack in source order below the breakpoint, which is also the order a screen reader
 * and the tab sequence follow — so the reading order is the same at every width.
 */
export const Split = forwardRef<HTMLDivElement, SplitProps>(function Split(
  { start, end, ratio = '1/2', gap = 6, stackBelow = 'md', className, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn('flex flex-col', STACK_BELOW[stackBelow], GAP[gap], className)}
      {...props}
    >
      <div className={cn('w-full shrink-0', START_BASIS[ratio])}>{start}</div>
      <div className="w-full min-w-0 flex-1">{end}</div>
    </div>
  );
});

export interface SidebarLayoutProps extends HTMLAttributes<HTMLDivElement> {
  /** Navigation rail or panel. Give it a `<nav>` with an accessible name. */
  sidebar: ReactNode;
  children: ReactNode;
  /** Sidebar width when expanded. `rail` is the icon-only collapsed width. */
  width?: 'rail' | 'sm' | 'md' | 'lg';
  /** Below this breakpoint the sidebar is not rendered inline — the app shows it in a drawer. */
  collapseBelow?: 'md' | 'lg';
  gap?: Space;
}

const SIDEBAR_WIDTH: Record<NonNullable<SidebarLayoutProps['width']>, string> = {
  rail: 'w-[84px]',
  sm: 'w-56',
  md: 'w-64',
  lg: 'w-72',
};

const SIDEBAR_SHOW: Record<NonNullable<SidebarLayoutProps['collapseBelow']>, string> = {
  md: 'hidden md:block',
  lg: 'hidden lg:block',
};

/**
 * A fixed-width sidebar beside a fluid content column.
 *
 * Below `collapseBelow` the sidebar is removed from the flow rather than squeezed: at phone widths
 * there is no width at which a rail and readable content both fit, and the application shows the
 * same navigation in a drawer instead. This component does not own that drawer — it takes no
 * `open` state and renders no overlay, because the trigger, the animation and the close behaviour
 * belong to the shell.
 *
 * The content column carries `min-w-0` so a wide table inside it scrolls rather than pushing the
 * sidebar off screen, which is the single most common failure of a hand-rolled sidebar layout.
 */
export const SidebarLayout = forwardRef<HTMLDivElement, SidebarLayoutProps>(function SidebarLayout(
  { sidebar, children, width = 'md', collapseBelow = 'md', gap = 0, className, ...props },
  ref,
) {
  return (
    <div ref={ref} className={cn('flex w-full', GAP[gap], className)} {...props}>
      <div className={cn('shrink-0', SIDEBAR_WIDTH[width], SIDEBAR_SHOW[collapseBelow])}>
        {sidebar}
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
});

export interface InspectorLayoutProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  /** The contextual detail panel. Omit or pass null to give the content the full width. */
  inspector?: ReactNode;
  width?: 'sm' | 'md' | 'lg';
  /** Below this breakpoint the inspector moves under the content instead of beside it. */
  stackBelow?: 'lg' | 'xl';
  gap?: Space;
}

const INSPECTOR_WIDTH: Record<NonNullable<InspectorLayoutProps['width']>, string> = {
  sm: 'lg:w-72',
  md: 'lg:w-80',
  lg: 'lg:w-96',
};

const INSPECTOR_ROW: Record<NonNullable<InspectorLayoutProps['stackBelow']>, string> = {
  lg: 'lg:flex-row',
  xl: 'xl:flex-row',
};

/**
 * Primary content with a contextual panel alongside it — record details, an activity timeline,
 * a properties list.
 *
 * The inspector comes *after* the content in source order, so it comes after it for a screen
 * reader and in the tab sequence too, and it stacks underneath on narrower viewports rather than
 * competing with the content for width. Passing no inspector renders the content full width, so a
 * screen can drop the panel without switching layout component.
 */
export const InspectorLayout = forwardRef<HTMLDivElement, InspectorLayoutProps>(
  function InspectorLayout(
    { children, inspector, width = 'md', stackBelow = 'lg', gap = 6, className, ...props },
    ref,
  ) {
    return (
      <div
        ref={ref}
        className={cn('flex flex-col', INSPECTOR_ROW[stackBelow], GAP[gap], className)}
        {...props}
      >
        <div className="min-w-0 flex-1">{children}</div>
        {inspector ? (
          <aside className={cn('w-full shrink-0', INSPECTOR_WIDTH[width])}>{inspector}</aside>
        ) : null}
      </div>
    );
  },
);
