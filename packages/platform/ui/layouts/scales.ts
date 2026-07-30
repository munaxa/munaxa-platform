import type { SpacingToken } from '../../tokens/spacing/index.js';

/**
 * Class lookups for the token scales the layout primitives expose as props.
 *
 * These are written out rather than composed (`` `gap-${space}` ``) because Tailwind v4 finds
 * classes by scanning source text: a class assembled at runtime is never emitted, and the layout
 * silently collapses to no gap. Every entry here is a literal Tailwind can see.
 *
 * The keys are the spacing scale from `tokens/spacing`, so a layout prop can only ever name a step
 * that exists — `gap={5}` does not typecheck, because 20px is not on the scale.
 */

/** A step on the shared spacing scale. */
export type Space = SpacingToken;

export const GAP: Record<Space, string> = {
  0: 'gap-0',
  1: 'gap-1',
  2: 'gap-2',
  3: 'gap-3',
  4: 'gap-4',
  6: 'gap-6',
  8: 'gap-8',
  12: 'gap-12',
  16: 'gap-16',
  20: 'gap-20',
  24: 'gap-24',
};

export const GAP_X: Record<Space, string> = {
  0: 'gap-x-0',
  1: 'gap-x-1',
  2: 'gap-x-2',
  3: 'gap-x-3',
  4: 'gap-x-4',
  6: 'gap-x-6',
  8: 'gap-x-8',
  12: 'gap-x-12',
  16: 'gap-x-16',
  20: 'gap-x-20',
  24: 'gap-x-24',
};

export const GAP_Y: Record<Space, string> = {
  0: 'gap-y-0',
  1: 'gap-y-1',
  2: 'gap-y-2',
  3: 'gap-y-3',
  4: 'gap-y-4',
  6: 'gap-y-6',
  8: 'gap-y-8',
  12: 'gap-y-12',
  16: 'gap-y-16',
  20: 'gap-y-20',
  24: 'gap-y-24',
};

export const PADDING: Record<Space, string> = {
  0: 'p-0',
  1: 'p-1',
  2: 'p-2',
  3: 'p-3',
  4: 'p-4',
  6: 'p-6',
  8: 'p-8',
  12: 'p-12',
  16: 'p-16',
  20: 'p-20',
  24: 'p-24',
};

/** Flex alignment on the cross axis. */
export type Align = 'start' | 'center' | 'end' | 'stretch' | 'baseline';
export const ALIGN: Record<Align, string> = {
  start: 'items-start',
  center: 'items-center',
  end: 'items-end',
  stretch: 'items-stretch',
  baseline: 'items-baseline',
};

/** Flex distribution on the main axis. */
export type Justify = 'start' | 'center' | 'end' | 'between' | 'around' | 'evenly';
export const JUSTIFY: Record<Justify, string> = {
  start: 'justify-start',
  center: 'justify-center',
  end: 'justify-end',
  between: 'justify-between',
  around: 'justify-around',
  evenly: 'justify-evenly',
};

/**
 * Grid column counts, per breakpoint.
 *
 * A responsive prop is written `cols={{ base: 1, md: 2, xl: 4 }}` and resolves through these maps.
 * Twelve is the ceiling: past that a page wants a different layout, not more columns.
 */
export type Columns = 1 | 2 | 3 | 4 | 5 | 6 | 12;

export const COLS: Record<Columns, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
  5: 'grid-cols-5',
  6: 'grid-cols-6',
  12: 'grid-cols-12',
};

export const COLS_SM: Record<Columns, string> = {
  1: 'sm:grid-cols-1',
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-3',
  4: 'sm:grid-cols-4',
  5: 'sm:grid-cols-5',
  6: 'sm:grid-cols-6',
  12: 'sm:grid-cols-12',
};

export const COLS_MD: Record<Columns, string> = {
  1: 'md:grid-cols-1',
  2: 'md:grid-cols-2',
  3: 'md:grid-cols-3',
  4: 'md:grid-cols-4',
  5: 'md:grid-cols-5',
  6: 'md:grid-cols-6',
  12: 'md:grid-cols-12',
};

export const COLS_LG: Record<Columns, string> = {
  1: 'lg:grid-cols-1',
  2: 'lg:grid-cols-2',
  3: 'lg:grid-cols-3',
  4: 'lg:grid-cols-4',
  5: 'lg:grid-cols-5',
  6: 'lg:grid-cols-6',
  12: 'lg:grid-cols-12',
};

export const COLS_XL: Record<Columns, string> = {
  1: 'xl:grid-cols-1',
  2: 'xl:grid-cols-2',
  3: 'xl:grid-cols-3',
  4: 'xl:grid-cols-4',
  5: 'xl:grid-cols-5',
  6: 'xl:grid-cols-6',
  12: 'xl:grid-cols-12',
};

/**
 * A value that may change per breakpoint. `base` applies from the narrowest viewport up; each
 * further key overrides from that breakpoint. Mobile-first, exactly like the CSS it compiles to.
 *
 * `2xl` is deliberately absent. Tailwind's scanner does not extract a candidate whose variant
 * begins with a digit, so `2xl:grid-cols-6` is never emitted — not from this map, not from a
 * literal in a component, and not from `@source inline(...)`. Offering the key would typecheck
 * and then silently do nothing, which is worse than not offering it. A layout that needs to
 * change again past 1280px can pass the class through `className`.
 */
export type Responsive<T> = T | { base?: T; sm?: T; md?: T; lg?: T; xl?: T };

const COL_MAPS = {
  base: COLS,
  sm: COLS_SM,
  md: COLS_MD,
  lg: COLS_LG,
  xl: COLS_XL,
} as const;

/** Resolve a responsive column prop into the set of Tailwind classes it implies. */
export function resolveColumns(cols: Responsive<Columns>): string[] {
  if (typeof cols === 'number') return [COLS[cols]];
  return (Object.keys(COL_MAPS) as (keyof typeof COL_MAPS)[])
    .map((bp) => {
      const value = cols[bp];
      return value === undefined ? null : COL_MAPS[bp][value];
    })
    .filter((c): c is string => c !== null);
}
