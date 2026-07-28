/**
 * Typography tokens. Font families, sizes, weights and line-heights.
 *
 * Families are declared as CSS-variable references so each application supplies the actual
 * faces (e.g. via next/font). Latin display/body faces lack Arabic glyphs, so an Arabic
 * fallback family is always provided for RTL locales.
 */
export const typography = {
  fontFamily: {
    display: ['var(--font-display)', 'var(--font-arabic)', 'system-ui', 'sans-serif'],
    body: ['var(--font-body)', 'var(--font-arabic)', 'system-ui', 'sans-serif'],
    arabic: ['var(--font-arabic)', 'sans-serif'],
    mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
  },
  fontSize: {
    xs: '0.75rem',
    sm: '0.875rem',
    base: '1rem',
    lg: '1.125rem',
    xl: '1.25rem',
    '2xl': '1.5rem',
    '3xl': '1.875rem',
    '4xl': '2.25rem',
  },
  fontWeight: {
    regular: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
    extrabold: 800,
  },
  lineHeight: { tight: 1.25, normal: 1.5, relaxed: 1.625 },
} as const;

export type Typography = typeof typography;
