/**
 * The typed registry of product themes shipped by the design system.
 *
 * A *theme* is a complete set of values for the contract declared in `themes/base.css`,
 * authored as CSS custom properties in `themes/<id>/palette.css`. This registry is the
 * TypeScript-side mirror: it lets tooling (theme switchers, docs pages, screenshot harnesses,
 * email/OG-image generators) enumerate the available themes, their CSS entry points and their
 * raw brand hexes without hardcoding strings.
 *
 * Adding a product theme means adding a folder under `themes/` and one entry here — no change
 * to any component. Components read semantic variables only, so they inherit every theme.
 */
import { brand as munaxaBrand } from './munaxa/brand.js';
import { brand as workaxaBrand } from './workaxa/brand.js';
import { brand as inkaxaBrand } from './inkaxa/brand.js';

/** Raw brand values a semantic palette has no slot for: the brand hexes and gradient stops. */
export interface Brand {
  /** Primary brand hue, light and deep variants. */
  readonly color: { readonly DEFAULT: string; readonly light: string; readonly dark: string };
  /** Gradient stops used by brand surfaces (light → primary → deep). */
  readonly gradientStops: { readonly from: string; readonly via: string; readonly to: string };
  /**
   * Static neutral scale. The semantic palette is the source of truth for anything rendered in
   * a browser; this exists for surfaces that cannot read CSS custom properties at all — HTML
   * email, OG images, PDF output.
   */
  readonly neutral: {
    readonly 0: string;
    readonly bg: string;
    readonly surface: string;
    readonly border: string;
    readonly input: string;
    readonly mutedText: string;
    readonly ink: string;
  };
}

/** A product theme shipped by the design system. */
export interface Theme {
  /** Stable identifier, matching the folder name under `themes/`. */
  id: string;
  /** Human-readable product name. */
  name: string;
  /** Package subpath an application imports to activate the theme. */
  cssEntry: string;
  /** One-line description of the brand direction the palette expresses. */
  description: string;
  /** Raw brand hexes and gradient stops (everything the semantic palette has no slot for). */
  brand: Brand;
}

const munaxa = {
  id: 'munaxa',
  name: 'Munaxa',
  cssEntry: '@axa/platform/css/themes/munaxa',
  description: 'Teal brand with cool, low-chroma neutrals.',
  brand: munaxaBrand,
} as const satisfies Theme;

const workaxa = {
  id: 'workaxa',
  name: 'Workaxa',
  cssEntry: '@axa/platform/css/themes/workaxa',
  description: 'Violet brand with violet-tinted neutrals.',
  brand: workaxaBrand,
} as const satisfies Theme;

const inkaxa = {
  id: 'inkaxa',
  name: 'Inkaxa',
  cssEntry: '@axa/platform/css/themes/inkaxa',
  description: 'Indigo-ink brand with indigo-tinted neutrals.',
  brand: inkaxaBrand,
} as const satisfies Theme;

/** Every product theme, keyed by id. */
export const themes = { munaxa, workaxa, inkaxa } as const;

/** Union of the available theme ids. */
export type ThemeId = keyof typeof themes;
