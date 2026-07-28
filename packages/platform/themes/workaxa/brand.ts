/**
 * Workaxa brand swatches — the fixed hexes that the CSS palette cannot express.
 *
 * See `themes/munaxa/brand.ts` for the rationale: `palette.css` owns every semantic colour;
 * this module owns only the raw brand hexes and the brand gradient stops.
 */
export const brand = {
  /** Primary brand hue, light and deep variants. */
  color: {
    DEFAULT: '#7A3FFF',
    light: '#A47BFF',
    dark: '#4B1FB0',
  },
  /** Gradient stops used by brand surfaces (light → primary → deep). */
  gradientStops: {
    from: '#A47BFF',
    via: '#7A3FFF',
    to: '#4B1FB0',
  },
  /** Static neutral scale, for surfaces that cannot read CSS variables (email, OG images). */
  neutral: {
    0: '#FFFFFF',
    bg: '#F5F4F7',
    surface: '#F2F1F6',
    border: '#E5E3EC',
    input: '#E5E3EC',
    mutedText: '#726C82',
    ink: '#0B0910',
  },
} as const;
