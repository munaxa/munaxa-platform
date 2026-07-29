/**
 * Border-radius scale — 4 · 6 · 8 · 12 · 16 · 20 · 24 · 32 px, plus a full pill.
 *
 * This is the *structural* ramp. The three radii bound to Tailwind's `rounded-sm/md/lg`
 * utilities are derived per application from its own `--radius` base — see
 * `themes/base/base.css` — so a product can tighten or loosen its corners without forking
 * this scale.
 */
export const radius = {
  none: '0',
  xs: '0.25rem',
  sm: '0.375rem',
  md: '0.5rem',
  lg: '0.75rem',
  xl: '1rem',
  '2xl': '1.25rem',
  '3xl': '1.5rem',
  '4xl': '2rem',
  full: '9999px',
} as const;

export type Radius = typeof radius;
