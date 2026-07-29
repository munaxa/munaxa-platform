/**
 * The typed registry of product themes shipped by the platform.
 *
 * A *theme* is a complete set of values for the contract declared in `themes/base/base.css`,
 * authored as CSS custom properties in `themes/<id>/palette.css`. This registry is the
 * TypeScript-side mirror: it lets tooling (theme switchers, docs pages, screenshot harnesses,
 * email/OG-image generators) enumerate the available themes, their CSS entry points and their
 * raw brand hexes without hardcoding strings.
 *
 * A theme overrides **branding only**. Spacing, radius, elevation, motion, typography and the
 * neutral ramp are shared by every product and live in `tokens/` and `themes/base/`. Adding a
 * product theme means adding a folder under `themes/` and one entry here — no change to any
 * component, because components read semantic roles and inherit every theme.
 */
import { brand as groupBrand } from './group/brand.js';
import { brand as schoolBrand } from './school/brand.js';
import { brand as workBrand } from './work/brand.js';
import { brand as docsBrand } from './docs/brand.js';

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

/** A product theme shipped by the platform. */
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

const group = {
  id: 'group',
  name: 'Group',
  cssEntry: '@axa/platform/css/themes/group',
  description: 'Deep slate-blue corporate brand — the group-level identity.',
  brand: groupBrand,
} as const satisfies Theme;

const school = {
  id: 'school',
  name: 'School',
  cssEntry: '@axa/platform/css/themes/school',
  description: 'Bright teal brand for the education platform.',
  brand: schoolBrand,
} as const satisfies Theme;

const work = {
  id: 'work',
  name: 'Work',
  cssEntry: '@axa/platform/css/themes/work',
  description: 'Raspberry brand for the human-capital platform.',
  brand: workBrand,
} as const satisfies Theme;

const docs = {
  id: 'docs',
  name: 'Docs',
  cssEntry: '@axa/platform/css/themes/docs',
  description: 'Olive-green brand for the document and knowledge platform.',
  brand: docsBrand,
} as const satisfies Theme;

/** Every product theme, keyed by id. */
export const themes = { group, school, work, docs } as const;

/** Union of the available theme ids. */
export type ThemeId = keyof typeof themes;
