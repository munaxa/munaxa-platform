/** Munaxa border-radius scale: 8 / 12 / 14 / 22 / 32px. */
export const radius = {
  none: '0',
  sm: '0.5rem',
  md: '0.75rem',
  lg: '0.875rem',
  xl: '1.375rem',
  '2xl': '2rem',
  full: '9999px',
} as const;

export type Radius = typeof radius;
