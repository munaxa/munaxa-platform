import { forwardRef, type ElementType, type HTMLAttributes } from 'react';
import { cn } from '../lib/cn.js';
import { ALIGN, GAP, JUSTIFY, type Align, type Justify, type Space } from './scales.js';

export interface StackProps extends HTMLAttributes<HTMLDivElement> {
  /** Flow direction. Horizontal stacks follow the writing direction, so RTL reverses them. */
  direction?: 'vertical' | 'horizontal';
  /** Space between children, from the shared spacing scale. */
  gap?: Space;
  align?: Align;
  justify?: Justify;
  /** Allow children to wrap onto further lines. */
  wrap?: boolean;
  /** Render as a different element — `as="ul"`, `as="nav"` — when the semantics call for it. */
  as?: ElementType;
}

/**
 * One-dimensional flow: children in a row or a column, separated by a step on the spacing scale.
 *
 * This is the layout primitive most pages are built from, and it deliberately owns only spacing
 * and alignment. It sets no colour, no border and no size, so it composes with anything and can
 * never impose one product's visual opinion on another.
 *
 * Horizontal stacks use flex row, which follows `dir`, so a stack authored in English lays itself
 * out right-to-left in Arabic with no change at the call site.
 */
export const Stack = forwardRef<HTMLDivElement, StackProps>(function Stack(
  {
    direction = 'vertical',
    gap = 4,
    align,
    justify,
    wrap = false,
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
        'flex',
        direction === 'vertical' ? 'flex-col' : 'flex-row',
        GAP[gap],
        wrap && 'flex-wrap',
        align && ALIGN[align],
        justify && JUSTIFY[justify],
        className,
      )}
      {...props}
    />
  );
});

export type InlineProps = Omit<StackProps, 'direction'>;

/**
 * Horizontal flow that wraps — a row of buttons, filter chips, tags, metadata.
 *
 * A preset of `Stack`, not a second implementation: same spacing scale, same alignment props,
 * same RTL behaviour. It exists because "a row of things that wraps" is the single most common
 * arrangement in an application, and naming it reads better than repeating the three props.
 */
export const Inline = forwardRef<HTMLDivElement, InlineProps>(function Inline(
  { gap = 2, align = 'center', ...props },
  ref,
) {
  return <Stack ref={ref} direction="horizontal" wrap gap={gap} align={align} {...props} />;
});

export type ClusterProps = InlineProps;

/**
 * A group of related controls pushed together, with the group as a whole positioned by `justify`.
 *
 * Same implementation as `Inline`; the distinction is intent. Use `Cluster` for a set that acts
 * as one unit — the actions in a toolbar, the buttons in a dialog footer.
 */
export const Cluster = forwardRef<HTMLDivElement, ClusterProps>(function Cluster(
  { gap = 2, align = 'center', ...props },
  ref,
) {
  return <Inline ref={ref} gap={gap} align={align} {...props} />;
});
