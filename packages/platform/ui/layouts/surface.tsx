import { forwardRef, type ElementType, type HTMLAttributes } from 'react';
import { cn } from '../lib/cn.js';
import { PADDING, type Space } from './scales.js';

/** How a surface separates itself from what is behind it. */
export type SurfaceTone = 'card' | 'muted' | 'transparent';
export type SurfaceElevation = 'none' | 'sm' | 'md' | 'card';

const TONE: Record<SurfaceTone, string> = {
  card: 'bg-card text-card-foreground',
  muted: 'bg-muted text-foreground',
  transparent: 'bg-transparent',
};

const ELEVATION: Record<SurfaceElevation, string> = {
  none: '',
  sm: 'shadow-xs',
  md: 'shadow-md',
  card: 'shadow-card',
};

export interface SurfaceProps extends HTMLAttributes<HTMLDivElement> {
  tone?: SurfaceTone;
  elevation?: SurfaceElevation;
  bordered?: boolean;
  padding?: Space;
  /** Corner rounding, from the theme's derived radius scale. */
  radius?: 'none' | 'md' | 'lg' | 'xl';
  as?: ElementType;
}

const RADIUS = {
  none: 'rounded-none',
  md: 'rounded-md',
  lg: 'rounded-lg',
  xl: 'rounded-xl',
} as const;

/**
 * A themed background with optional border, elevation and padding — the raw material every panel,
 * card and popover is made of.
 *
 * `Card` remains the component to reach for when rendering a card; `Surface` is the layer beneath
 * it, for regions that need a background and a border without a card's semantics or its fixed
 * padding. Every value comes from the theme, so a surface is correct in all four themes and in
 * both colour schemes without a single conditional.
 */
export const Surface = forwardRef<HTMLDivElement, SurfaceProps>(function Surface(
  {
    tone = 'card',
    elevation = 'none',
    bordered = true,
    padding,
    radius = 'lg',
    as: Component = 'div',
    className,
    ...props
  },
  ref,
) {
  return (
    <Component
      ref={ref}
      className={cn(
        TONE[tone],
        RADIUS[radius],
        bordered && 'border border-border',
        ELEVATION[elevation],
        padding !== undefined && PADDING[padding],
        className,
      )}
      {...props}
    />
  );
});
