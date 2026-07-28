/**
 * Border tokens — widths and the default style. Border *color* is theme-aware and exposed via
 * the `--border` CSS variable (see ../themes/base.css); these are the structural primitives
 * shared across every product.
 */
export const border = {
  width: {
    0: '0px',
    DEFAULT: '1px',
    2: '2px',
    4: '4px',
  },
  style: {
    solid: 'solid',
    dashed: 'dashed',
    dotted: 'dotted',
  },
  /** Default theme-aware border color token (resolved from CSS variable). */
  color: 'hsl(var(--border))',
} as const;

export type Border = typeof border;
