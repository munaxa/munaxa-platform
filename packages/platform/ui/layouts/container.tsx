import { forwardRef, type ElementType, type HTMLAttributes } from 'react';
import { cn } from '../lib/cn.js';

/**
 * Measure presets. `content` is a comfortable reading measure; `page` is the standard application
 * width; `wide` suits dense tables and dashboards; `full` removes the cap without giving up the
 * gutter, which is what a data grid usually wants.
 */
export type ContainerWidth = 'prose' | 'content' | 'page' | 'wide' | 'full';

const WIDTH: Record<ContainerWidth, string> = {
  prose: 'max-w-2xl',
  content: 'max-w-4xl',
  page: 'max-w-6xl',
  wide: 'max-w-7xl',
  full: 'max-w-none',
};

export interface ContainerProps extends HTMLAttributes<HTMLDivElement> {
  width?: ContainerWidth;
  /** Drop the horizontal gutter — for a container nested inside one that already has it. */
  flush?: boolean;
  as?: ElementType;
}

/**
 * Centred, width-capped page measure with a responsive gutter.
 *
 * Named widths rather than a raw `max-w-*` are the point: an application that writes `max-w-5xl`
 * on one page and `max-w-6xl` on the next has two page widths and no way to change either. The
 * gutter grows with the viewport and uses logical padding, so it mirrors correctly in RTL.
 */
export const Container = forwardRef<HTMLDivElement, ContainerProps>(function Container(
  { width = 'page', flush = false, as: Component = 'div', className, ...props },
  ref,
) {
  return (
    <Component
      ref={ref}
      className={cn('mx-auto w-full', WIDTH[width], !flush && 'px-4 sm:px-6 lg:px-8', className)}
      {...props}
    />
  );
});
