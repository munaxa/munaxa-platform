/**
 * Inkaxa brand swatches — the fixed hexes that the CSS palette cannot express.
 *
 * See `themes/munaxa/brand.ts` for the rationale: `palette.css` owns every semantic colour;
 * this module owns only the raw brand hexes and the brand gradient stops.
 */
export const brand = {
  /** Primary brand hue, light and deep variants. */
  color: {
    DEFAULT: '#4F46E5',
    light: '#818CF8',
    dark: '#312E81',
  },
  /** Gradient stops used by brand surfaces (light → primary → deep). */
  gradientStops: {
    from: '#818CF8',
    via: '#4F46E5',
    to: '#312E81',
  },
  /** Static neutral scale, for surfaces that cannot read CSS variables (email, OG images). */
  neutral: {
    0: '#FFFFFF',
    bg: '#F4F4F7',
    surface: '#F1F1F6',
    border: '#E3E4EC',
    input: '#E3E4EC',
    mutedText: '#6B6E82',
    ink: '#090A10',
  },
} as const;
