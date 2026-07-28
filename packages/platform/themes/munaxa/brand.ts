/**
 * Munaxa brand swatches — the fixed hexes that the CSS palette cannot express.
 *
 * The runtime palette (`palette.css`) is the single source of truth for every *semantic*
 * colour. This module carries only the two things a semantic palette has no slot for:
 * the raw brand hexes (for design tooling, favicons, email templates, OG images) and the
 * gradient stops used by brand surfaces.
 */
export const brand = {
  /** Primary brand hue, light and deep variants. */
  color: {
    DEFAULT: '#007595',
    light: '#00B8DB',
    dark: '#005066',
  },
  /** Gradient stops used by brand surfaces (light → primary → deep). */
  gradientStops: {
    from: '#00B8DB',
    via: '#007595',
    to: '#005066',
  },
  /** Static neutral scale, for surfaces that cannot read CSS variables (email, OG images). */
  neutral: {
    0: '#FFFFFF',
    bg: '#F4F4F5',
    surface: '#F1F3F3',
    border: '#E3E7E8',
    input: '#E3E7E8',
    mutedText: '#67787C',
    ink: '#090B0C',
  },
} as const;
