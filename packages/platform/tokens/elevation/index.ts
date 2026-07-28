/**
 * Elevation (box-shadow) tokens — the shared shadow *geometry*. The colour of a shadow is a
 * brand value: it is read from the active theme's `--shadow-tint` / `--glow-tint` custom
 * properties, so the same elevation ramp carries each product's own tint.
 */
export const elevation = {
  none: 'none',
  sm: '0 1px 2px rgb(var(--shadow-tint) / 0.06)',
  md: '0 4px 12px rgb(var(--shadow-tint) / 0.10)',
  lg: '0 12px 28px rgb(var(--shadow-tint) / 0.14)',
  card: '0 24px 50px -30px rgb(var(--shadow-tint) / 0.25), 0 0 0 1px hsl(var(--border)) inset',
  glow: '0 14px 40px -16px hsl(var(--primary) / 0.45)',
  /** Focus-visible ring — the active theme's brand tint at 28%. */
  focus: '0 0 0 3px rgb(var(--glow-tint) / 0.28)',
} as const;

export type Elevation = typeof elevation;
