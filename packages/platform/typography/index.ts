/**
 * Typography tokens. Font families, sizes, weights, line-heights and the named type roles.
 *
 * The design specification names three faces:
 *
 *   display / headings   Sora            supplied as `--font-display`
 *   body / UI            Inter           supplied as `--font-body`
 *   numeric / code       JetBrains Mono  supplied as `--font-mono`
 *
 * Families are declared as CSS-variable references rather than literal face names, because
 * loading a webfont is an application concern (Next.js does it through `next/font`, Vite through
 * an `@font-face` sheet) and the platform must not reach for a framework. An application that
 * supplies nothing still renders: every stack ends in a system fallback. Latin display and body
 * faces lack Arabic glyphs, so an Arabic fallback family sits in front of the system fallback
 * for RTL locales.
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

  /**
   * The named type roles — the six steps the specification actually renders. Use these rather
   * than assembling a size/weight pair by hand, so a heading looks the same in every product.
   */
  roles: {
    display: { family: 'display', size: '4xl', weight: 'bold', lineHeight: 'tight' },
    h1: { family: 'display', size: '3xl', weight: 'semibold', lineHeight: 'tight' },
    h2: { family: 'display', size: '2xl', weight: 'semibold', lineHeight: 'tight' },
    body: { family: 'body', size: 'base', weight: 'regular', lineHeight: 'normal' },
    small: { family: 'body', size: 'sm', weight: 'medium', lineHeight: 'normal' },
    mono: { family: 'mono', size: 'sm', weight: 'regular', lineHeight: 'normal' },
  },
} as const;

export type Typography = typeof typography;
/** A named step in the type scale — `display`, `h1`, `h2`, `body`, `small` or `mono`. */
export type TypeRole = keyof typeof typography.roles;
