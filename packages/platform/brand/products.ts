/**
 * The typed registry of Munaxa product brands — one source of truth for product identity.
 *
 * A *theme* (`themes/`) answers "what colour is this product". A *brand* answers the rest: what
 * the product is called, which lockup represents it, which file to load for a dark ground, and
 * which icon a browser tab should show. Both are configuration, and neither is allowed to be
 * restated in a component: `ProductLogo` reads this registry, so no application ever writes an
 * asset filename as a string literal and no application can show one product's mark inside
 * another.
 *
 * The three products are one family. They share the M symbol, the `munaxa.` wordmark, the square
 * punctuation mark, the typography and the proportions of every lockup; the product word and the
 * product colour are the only things that differ. That is a property of the artwork itself — see
 * `assets/README.md` — and this file simply names the files that carry it.
 */
import { themes, type ThemeId } from '../themes/index.js';

/** A product with its own brand identity. Matches the theme ids in `themes/index.ts`. */
export type ProductId = ThemeId;

/** Which lockup to render. */
export type LogoVariant = 'horizontal' | 'stacked' | 'wordmark' | 'symbol' | 'tagline';

/** One image, with the intrinsic size that keeps its approved aspect ratio intact. */
export interface BrandImage {
  readonly src: string;
  readonly width: number;
  readonly height: number;
}

/**
 * A lockup in both colour schemes.
 *
 * `onDark` is a separate approved file rather than a CSS filter: the `munaxa.` wordmark is set in
 * neutral ink and has to become white on a dark ground, while the symbol, the product word and the
 * square mark keep their approved colours. No filter does that, and inverting the whole lockup
 * would recolour the brand.
 */
export interface BrandLockup {
  readonly onLight: BrandImage;
  readonly onDark: BrandImage;
}

export interface BrandAssets {
  readonly horizontal: BrandLockup;
  readonly stacked: BrandLockup;
  readonly wordmark: BrandLockup;
  /** A single flat product-colour mark. It reads on both schemes, so there is one file. */
  readonly symbol: BrandImage;
  /**
   * The descriptor lockup — "School Management System" and its siblings.
   *
   * A marketing asset, never the default application logo. The descriptor is not part of the
   * product's core identity and putting it in a sidebar or a login card would make it one.
   */
  readonly tagline: BrandImage;
  readonly favicon: BrandImage;
  readonly faviconSmall: BrandImage;
  readonly appIcon: BrandImage;
  readonly appleTouchIcon: BrandImage;
  readonly openGraph: BrandImage;
}

export interface ProductBrand {
  readonly id: ProductId;
  /** The product's full name — "Munaxa School". The accessible name of its logo. */
  readonly name: string;
  /** The shared wordmark, including its square punctuation mark. Never product-specific. */
  readonly wordmark: string;
  /** The product word set beside the wordmark — `school`, `work`, `docs`. */
  readonly productWord: string;
  /** The marketing descriptor. Optional by design; see `assets.tagline`. */
  readonly descriptor: string | null;
  /** The theme this product activates, and the CSS entry point that carries it. */
  readonly themeId: ThemeId;
  /**
   * The product colour, for surfaces that cannot read CSS custom properties at all — HTML email,
   * an OG image renderer, a web app manifest's `theme_color`. Everything rendered in a browser
   * reads `bg-primary` / `text-primary-strong` instead, which follow the active colour scheme.
   */
  readonly color: string;
  readonly assets: BrandAssets;
}

/** Where a product serves its copy of the platform's artwork from. */
export const DEFAULT_ASSET_BASE = '/branding';

/**
 * Intrinsic pixel sizes of the shipped artwork.
 *
 * Carried per product rather than as one shared ratio because the three exports are trimmed to
 * their own ink: the Docs lockup's descender makes it a few pixels taller than School's. Passing
 * the real numbers to `width`/`height` is what stops the browser reserving the wrong box and
 * reflowing the header, and it is also what guarantees nothing is ever squeezed — a single wrong
 * ratio here would distort a logo everywhere it appears.
 */
const SIZES = {
  school: {
    horizontal: [1600, 327],
    stacked: [1000, 858],
    wordmark: [1200, 377],
    tagline: [1000, 991],
  },
  work: {
    horizontal: [1600, 326],
    stacked: [1000, 828],
    wordmark: [1200, 327],
    tagline: [1000, 1005],
  },
  docs: {
    horizontal: [1600, 341],
    stacked: [1000, 829],
    wordmark: [1200, 339],
    tagline: [1000, 988],
  },
} as const satisfies Record<string, Record<string, readonly [number, number]>>;

type SizedProduct = keyof typeof SIZES;

function assetsFor(product: SizedProduct, base: string): BrandAssets {
  const root = `${base}/${product}`;
  const size = SIZES[product];
  const lockup = (role: 'horizontal' | 'stacked' | 'wordmark'): BrandLockup => {
    const [width, height] = size[role];
    const file = role === 'wordmark' ? 'wordmark' : `${role}-lockup`;
    return {
      onLight: { src: `${root}/logos/${file}.png`, width, height },
      onDark: { src: `${root}/logos/${file}-on-dark.png`, width, height },
    };
  };

  return {
    horizontal: lockup('horizontal'),
    stacked: lockup('stacked'),
    wordmark: lockup('wordmark'),
    symbol: { src: `${root}/logos/symbol.png`, width: 512, height: 512 },
    tagline: {
      src: `${root}/logos/tagline-lockup.png`,
      width: size.tagline[0],
      height: size.tagline[1],
    },
    favicon: { src: `${root}/favicon/favicon.png`, width: 512, height: 512 },
    faviconSmall: { src: `${root}/favicon/favicon-32.png`, width: 32, height: 32 },
    appIcon: { src: `${root}/favicon/app-icon.png`, width: 512, height: 512 },
    appleTouchIcon: { src: `${root}/favicon/apple-touch-icon.png`, width: 180, height: 180 },
    openGraph: { src: `${root}/social/og-default.png`, width: 1200, height: 630 },
  };
}

function product(
  id: SizedProduct,
  productWord: string,
  descriptor: string,
  base: string,
): ProductBrand {
  return {
    id,
    name: `Munaxa ${themes[id].name}`,
    wordmark: 'munaxa.',
    productWord,
    descriptor,
    themeId: id,
    color: themes[id].brand.color.DEFAULT,
    assets: assetsFor(id, base),
  };
}

/**
 * Build the registry against a different public path.
 *
 * Applications that serve the artwork from somewhere other than `/branding` — a CDN prefix, a
 * `basePath`-mounted Next application — call this once and pass the result to `BrandProvider`.
 */
export function productBrandsWithAssetBase(base: string): Record<SizedProduct, ProductBrand> {
  return {
    school: product('school', 'school', 'School Management System', base),
    work: product('work', 'work', 'Human Capital Management', base),
    docs: product('docs', 'docs', 'Intelligent Document Management', base),
  };
}

/**
 * Every product brand, keyed by id.
 *
 * `group` is deliberately absent, and has its own export below. It is the corporate identity —
 * the company rather than a product — and it has no lockup, so it does not satisfy the shape a
 * product does. Keeping it out is what lets `ProductLogo` promise that a lockup exists.
 */
export const productBrands = productBrandsWithAssetBase(DEFAULT_ASSET_BASE);

/** What the corporate identity has: the mark and the icons, and no lockup. */
export interface CorporateBrand {
  readonly id: 'group';
  readonly name: string;
  readonly wordmark: string;
  readonly themeId: 'group';
  readonly color: string;
  readonly assets: Pick<
    BrandAssets,
    'symbol' | 'favicon' | 'faviconSmall' | 'appIcon' | 'appleTouchIcon'
  >;
}

/**
 * The corporate identity — Munaxa the company, not one of its products.
 *
 * It carries the same M in the corporate navy, and no lockup. That is a limit of the approved
 * artwork rather than a decision: every lockup in it sets a product word beneath `munaxa.`, so a
 * corporate lockup would have to be composed, and composing one is redrawing the logo. Corporate
 * surfaces keep rendering the wordmark as text, which is what they already did; what this adds is
 * a real favicon and app icon, which they did not have.
 */
export function corporateBrandWithAssetBase(base: string): CorporateBrand {
  const root = `${base}/group`;
  return {
    id: 'group',
    name: 'Munaxa',
    wordmark: 'munaxa.',
    themeId: 'group',
    color: themes.group.brand.color.DEFAULT,
    assets: {
      symbol: { src: `${root}/logos/symbol.png`, width: 512, height: 512 },
      favicon: { src: `${root}/favicon/favicon.png`, width: 512, height: 512 },
      faviconSmall: { src: `${root}/favicon/favicon-32.png`, width: 32, height: 32 },
      appIcon: { src: `${root}/favicon/app-icon.png`, width: 512, height: 512 },
      appleTouchIcon: { src: `${root}/favicon/apple-touch-icon.png`, width: 180, height: 180 },
    },
  };
}

export const corporateBrand = corporateBrandWithAssetBase(DEFAULT_ASSET_BASE);

/** The products a switcher offers, in the order they are presented. */
export const PRODUCT_ORDER = ['school', 'work', 'docs'] as const satisfies readonly SizedProduct[];

/** Narrow an arbitrary string to a product that has brand artwork. */
export function isBrandedProduct(value: string): value is SizedProduct {
  return value in productBrands;
}
