'use client';

import { cn } from '../ui/lib/cn.js';
import { useBrand } from './context.js';
import {
  DEFAULT_ASSET_BASE,
  productBrands,
  productBrandsWithAssetBase,
  type BrandImage,
  type LogoVariant,
  type ProductBrand,
  type ProductId,
} from './products.js';

/** A product that has brand artwork. `group` is the corporate identity and has none. */
export type BrandedProductId = Exclude<ProductId, 'group'>;

/** Breakpoints a lockup may collapse to its symbol below. Mirrors the Tailwind scale. */
export type CompactBreakpoint = 'sm' | 'md' | 'lg';

/** `hidden below / shown at` class pairs, written out because Tailwind cannot scan a template. */
const COMPACT: Record<CompactBreakpoint, { full: string; compact: string }> = {
  sm: { full: 'hidden sm:block', compact: 'block sm:hidden' },
  md: { full: 'hidden md:block', compact: 'block md:hidden' },
  lg: { full: 'hidden lg:block', compact: 'block lg:hidden' },
};

export interface ProductLogoProps {
  /** Which lockup. `horizontal` suits headers and rails; `stacked` suits login and hero space. */
  variant?: LogoVariant;
  /** Rendered height in CSS pixels. Width follows the artwork's approved ratio. */
  height?: number;
  /**
   * Override the product from context.
   *
   * For the rare surface that shows a product it is not inside — a product switcher, a corporate
   * page listing all three. Application chrome leaves this alone and inherits, which is what keeps
   * one product's mark out of another's screens.
   */
  product?: BrandedProductId;
  /**
   * Collapse to the symbol below this breakpoint.
   *
   * A wordmark that will not fit is squeezed, truncated or overflows; the symbol is the approved
   * answer to not having the width. Done in CSS rather than with a viewport hook, so it is already
   * correct in the server-rendered HTML and never flashes the wrong mark.
   */
  compactBelow?: CompactBreakpoint;
  /**
   * Mark the logo decorative.
   *
   * Use it whenever the product's name is already written beside the logo — a picture captioned
   * with the text next to it is read out twice.
   */
  decorative?: boolean;
  /** Overrides the accessible name. Defaults to the product's name, e.g. "Munaxa School". */
  alt?: string;
  /** Load eagerly and at high priority — for a logo in the initial viewport. */
  priority?: boolean;
  className?: string;
}

/** Registries keyed by asset base. They are immutable, so building each one once is enough. */
const REGISTRIES = new Map<string, Record<BrandedProductId, ProductBrand>>([
  [DEFAULT_ASSET_BASE, productBrands],
]);

function registryFor(brand: ProductBrand): Record<BrandedProductId, ProductBrand> {
  // The base is whatever prefix the brand in scope was built with; recovering it from a known
  // filename keeps a CDN-prefixed application prefixed when it renders a sibling product's mark.
  const base = brand.assets.symbol.src.slice(0, -`/${brand.id}/logos/symbol.png`.length);
  const cached = REGISTRIES.get(base);
  if (cached) return cached;
  const built = productBrandsWithAssetBase(base);
  REGISTRIES.set(base, built);
  return built;
}

function imagesFor(
  brand: ProductBrand,
  variant: LogoVariant,
): { readonly light: BrandImage; readonly dark: BrandImage } {
  const { assets } = brand;
  switch (variant) {
    case 'stacked':
      return { light: assets.stacked.onLight, dark: assets.stacked.onDark };
    case 'wordmark':
      return { light: assets.wordmark.onLight, dark: assets.wordmark.onDark };
    // The symbol and the descriptor lockup ship as one file each: the symbol is a flat
    // product-colour mark that reads on both grounds, and the descriptor lockup is a marketing
    // asset used on surfaces that choose their own ground.
    case 'symbol':
      return { light: assets.symbol, dark: assets.symbol };
    case 'tagline':
      return { light: assets.tagline, dark: assets.tagline };
    case 'horizontal':
      return { light: assets.horizontal.onLight, dark: assets.horizontal.onDark };
  }
}

/** Scale an image to a target height, keeping its ratio exactly. */
const widthAt = (image: BrandImage, height: number): number =>
  Math.round((image.width / image.height) * height);

/**
 * The approved Munaxa product logo.
 *
 * Which product it shows comes from `BrandProvider`, and which file it loads comes from the
 * registry in `products.ts`. Neither is a decision a screen gets to make, which is the point:
 * there is no argument to this component that can put the Work lockup on a School page by
 * accident, and no filename here for a rename to break.
 *
 * **Both colour schemes are real files.** The lockups are drawn with a neutral-ink `munaxa.`
 * wordmark, which has to be white on a dark ground while the symbol and the product word keep
 * their approved colours — so the dark scheme loads the approved `-on-dark` export rather than a
 * CSS filter. Both are in the DOM and the scheme hides one with `display: none`, which also takes
 * it out of the accessibility tree, so the name is announced exactly once.
 *
 * **Nothing is ever distorted.** `width` and `height` are the artwork's own ratio scaled to the
 * requested height, so the box the browser reserves is the box the image fills.
 */
export function ProductLogo({
  variant = 'horizontal',
  height = 28,
  product,
  compactBelow,
  decorative = false,
  alt,
  priority = false,
  className,
}: ProductLogoProps) {
  const inScope = useBrand();
  const brand = product && product !== inScope.id ? registryFor(inScope)[product] : inScope;
  const { light, dark } = imagesFor(brand, variant);

  const naming = decorative
    ? { alt: '', 'aria-hidden': true as const }
    : { alt: alt ?? brand.name };

  const image = (source: BrandImage, scheme: string, responsive?: string) => (
    <img
      src={source.src}
      width={widthAt(source, height)}
      height={height}
      loading={priority ? 'eager' : 'lazy'}
      fetchPriority={priority ? 'high' : 'auto'}
      decoding="async"
      {...naming}
      className={cn('w-auto object-contain', scheme, responsive, className)}
      style={{ height }}
    />
  );

  if (!compactBelow) {
    return (
      <>
        {image(light, 'dark:hidden')}
        {image(dark, 'hidden dark:block')}
      </>
    );
  }

  const { full, compact } = COMPACT[compactBelow];
  return (
    <>
      {/* The width and the colour scheme are decided by two separate elements on purpose. Put
          `sm:block` and `dark:hidden` on the same image and the two utilities contend for
          `display` — which one wins is a stylesheet-ordering accident, and the losing case shows
          a black wordmark on a dark ground. A wrapper per width keeps each rule unambiguous. */}
      <span className={full}>
        {image(light, 'dark:hidden')}
        {image(dark, 'hidden dark:block')}
      </span>
      {/* One file for both schemes, so the narrow case needs no scheme class of its own. */}
      <span className={compact}>{image(brand.assets.symbol, '')}</span>
    </>
  );
}
