/**
 * Spacing scale — 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 80 · 96 px.
 *
 * A 4px base grid, thinned to the ten steps the design specification actually uses. Keys follow
 * the Tailwind convention (key × 4px), so `spacing[6]` and the `p-6` utility are the same value.
 * Expressed in rem so the whole scale responds to the root font-size.
 */
export const spacing = {
  0: '0',
  1: '0.25rem',
  2: '0.5rem',
  3: '0.75rem',
  4: '1rem',
  6: '1.5rem',
  8: '2rem',
  12: '3rem',
  16: '4rem',
  20: '5rem',
  24: '6rem',
} as const;

export type Spacing = typeof spacing;
export type SpacingToken = keyof typeof spacing;
