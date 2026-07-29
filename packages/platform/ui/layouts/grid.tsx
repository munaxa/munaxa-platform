import { forwardRef, type ElementType, type HTMLAttributes } from 'react';
import { cn } from '../lib/cn.js';
import {
  GAP,
  GAP_X,
  GAP_Y,
  resolveColumns,
  type Columns,
  type Responsive,
  type Space,
} from './scales.js';

export interface GridProps extends HTMLAttributes<HTMLDivElement> {
  /** Column count, optionally per breakpoint: `cols={{ base: 1, md: 2, xl: 4 }}`. */
  cols?: Responsive<Columns>;
  gap?: Space;
  /** Override the gap on one axis — a dense table of cards often wants tighter rows than columns. */
  gapX?: Space;
  gapY?: Space;
  as?: ElementType;
}

/**
 * Two-dimensional layout with a responsive column count.
 *
 * `cols` is mobile-first: `{ base: 1, md: 2 }` means one column on phones and two from the `md`
 * breakpoint up, which is the same order the emitted CSS applies. Breakpoints come from
 * `tokens/breakpoints` via Tailwind's screens, so a grid and a `useBreakpoint` call in the same
 * component always agree about where the layout changes.
 */
export const Grid = forwardRef<HTMLDivElement, GridProps>(function Grid(
  { cols = 1, gap = 4, gapX, gapY, as: Component = 'div', className, ...props },
  ref,
) {
  return (
    <Component
      ref={ref}
      className={cn(
        'grid',
        ...resolveColumns(cols),
        // An axis override replaces the shared gap on that axis only.
        gapX === undefined && gapY === undefined ? GAP[gap] : null,
        gapX !== undefined ? GAP_X[gapX] : gapY !== undefined ? GAP_X[gap] : null,
        gapY !== undefined ? GAP_Y[gapY] : gapX !== undefined ? GAP_Y[gap] : null,
        className,
      )}
      {...props}
    />
  );
});
