import { forwardRef, type ElementType, type HTMLAttributes } from 'react';
import { cn } from '../lib/cn.js';
import { GAP, type Space } from './scales.js';

export interface CenterProps extends HTMLAttributes<HTMLDivElement> {
  /** Centre on the block axis as well, not only horizontally. */
  axis?: 'horizontal' | 'both';
  /** Also centre the text inside. */
  text?: boolean;
  as?: ElementType;
}

/**
 * Horizontal (and optionally vertical) centring, without the `flex items-center justify-center`
 * incantation appearing on every empty state in the codebase.
 */
export const Center = forwardRef<HTMLDivElement, CenterProps>(function Center(
  { axis = 'horizontal', text = false, as: Component = 'div', className, ...props },
  ref,
) {
  return (
    <Component
      ref={ref}
      className={cn(
        'flex flex-col items-center',
        axis === 'both' && 'justify-center',
        text && 'text-center',
        className,
      )}
      {...props}
    />
  );
});

export interface CoverProps extends HTMLAttributes<HTMLDivElement> {
  /** Minimum height. `screen` fills the viewport; `full` fills whatever the parent gives it. */
  minHeight?: 'screen' | 'full' | 'none';
  gap?: Space;
  as?: ElementType;
}

/**
 * A region that fills its space and centres its content on the block axis.
 *
 * The layout behind loading screens, empty states, sign-in pages and 404s — anywhere the content
 * is short and should sit in the middle of the space rather than at the top of it.
 */
export const Cover = forwardRef<HTMLDivElement, CoverProps>(function Cover(
  { minHeight = 'full', gap = 4, as: Component = 'div', className, ...props },
  ref,
) {
  return (
    <Component
      ref={ref}
      className={cn(
        'flex flex-col items-center justify-center',
        GAP[gap],
        minHeight === 'screen' && 'min-h-screen',
        minHeight === 'full' && 'min-h-full',
        className,
      )}
      {...props}
    />
  );
});
