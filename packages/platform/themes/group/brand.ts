/**
 * Group brand swatches — the fixed hexes that the CSS palette cannot express.
 *
 * The runtime palette (`palette.css`) is the single source of truth for every *semantic*
 * colour. This module carries only what a semantic palette has no slot for: the raw brand
 * hexes and gradient stops, for surfaces that cannot read CSS custom properties at all —
 * HTML email, OG images, favicons, PDF output.
 */
export const brand = {
  /** Primary brand hue, light and deep variants. */
  color: {
    DEFAULT: '#2B3A67',
    light: '#7E93C9',
    dark: '#141D35',
  },
  /** Gradient stops used by brand surfaces (light → primary → deep). */
  gradientStops: {
    from: '#5768AB',
    via: '#2B3A67',
    to: '#141D35',
  },
  /** Static neutral scale, for surfaces that cannot read CSS variables (email, OG images). */
  neutral: {
    0: '#FFFFFF',
    bg: '#FAFBFC',
    surface: '#F2F4F7',
    border: '#E4E7EC',
    input: '#E4E7EC',
    mutedText: '#667085',
    ink: '#101828',
  },
} as const;
