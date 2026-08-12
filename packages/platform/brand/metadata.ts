/**
 * Browser and installation metadata, derived from the product brand registry.
 *
 * Favicons, share images, manifest entries and theme colour are branding, so they come from the
 * same place the logo does. Before this existed, every application repeated the same four
 * `<link rel="icon">` paths by hand — which is how three products end up sharing one favicon and
 * nobody notices until a user has all three open in one window.
 *
 * The return values are plain data, not framework types. They are shaped to drop straight into a
 * Next `Metadata` export, and they are equally usable from an Express route, a static
 * `manifest.json` generator or a test.
 */
import {
  corporateBrand,
  productBrands,
  type BrandAssets,
  type CorporateBrand,
  type ProductBrand,
} from './products.js';

/**
 * What these helpers actually need.
 *
 * Structural rather than `ProductBrand`, so the corporate identity — which has icons but no
 * lockup — can use them too. A favicon and a manifest are things the company has as much as a
 * product does; an Open Graph card built from a stacked lockup is not, which is why
 * `brandOpenGraphImage` below still asks for a full product.
 */
type IconBearing = Pick<ProductBrand, 'name' | 'color' | 'descriptor'> & {
  readonly assets: Pick<BrandAssets, 'favicon' | 'faviconSmall' | 'appIcon' | 'appleTouchIcon'>;
};

/** Anything these helpers accept: a product id, a product brand, or the corporate identity. */
export type BrandLike = IconBearing | CorporateBrand | keyof typeof productBrands | 'group';

/** One icon declaration, in the shape `<link rel>` and the manifest both describe. */
export interface IconDescriptor {
  readonly url: string;
  readonly sizes: string;
  readonly type: string;
}

/**
 * Arrays here are mutable, and that is not an oversight.
 *
 * These values exist to be assigned straight to a Next `Metadata` export, whose `icons.icon` is
 * typed `Icon[]`. A `readonly` array is not assignable to it, so the tidier-looking type would
 * force every consumer to spread or cast — which is worse than the immutability it buys, given
 * the object is freshly built on every call and shared with nobody.
 */
export interface BrandIcons {
  readonly icon: IconDescriptor[];
  readonly apple: IconDescriptor[];
}

const brandOf = (product: BrandLike): IconBearing => {
  if (typeof product !== 'string') return { descriptor: null, ...product };
  return product === 'group' ? { descriptor: null, ...corporateBrand } : productBrands[product];
};

/**
 * The favicon set for a product.
 *
 * Two sizes rather than one: the 32px export is drawn for the tab strip, where a downscaled 512
 * turns the M into three grey smudges, and the 512 is what a bookmark or a high-DPI tab uses.
 */
export function brandIcons(product: BrandLike): BrandIcons {
  const { assets } = brandOf(product);
  return {
    icon: [
      { url: assets.faviconSmall.src, sizes: '32x32', type: 'image/png' },
      { url: assets.favicon.src, sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: assets.appleTouchIcon.src, sizes: '180x180', type: 'image/png' }],
  };
}

export interface BrandOpenGraphImage {
  readonly url: string;
  readonly width: number;
  readonly height: number;
  readonly alt: string;
}

/**
 * The share image for a product, for both Open Graph and the Twitter/X card.
 *
 * `alt` is the product's name rather than a description of the picture: a share card's image is
 * the product's mark, and "Munaxa Docs" is what somebody using a screen reader needs from it.
 */
export function brandOpenGraphImage(
  product: ProductBrand | keyof typeof productBrands,
): BrandOpenGraphImage {
  const brand = typeof product === 'string' ? productBrands[product] : product;
  return {
    url: brand.assets.openGraph.src,
    width: brand.assets.openGraph.width,
    height: brand.assets.openGraph.height,
    alt: brand.name,
  };
}

export interface BrandManifest {
  readonly name: string;
  readonly short_name: string;
  readonly description: string;
  readonly theme_color: string;
  readonly background_color: string;
  readonly display: 'standalone';
  readonly icons: { src: string; sizes: string; type: string; purpose: string }[];
}

/**
 * A web app manifest for a product.
 *
 * `theme_color` is the product colour — the one place a raw hex is correct, because the browser
 * paints the window chrome before any stylesheet is parsed and cannot read a custom property.
 * `background_color` is the neutral page background rather than the brand, so the splash screen
 * matches the application that follows it instead of flashing a saturated field first.
 */
export function brandManifest(product: BrandLike, description?: string): BrandManifest {
  const brand = brandOf(product);
  return {
    name: brand.name,
    short_name: brand.name,
    description: description ?? brand.descriptor ?? brand.name,
    theme_color: brand.color,
    background_color: '#FFFFFF',
    display: 'standalone',
    icons: [
      { src: brand.assets.appIcon.src, sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: brand.assets.appleTouchIcon.src, sizes: '180x180', type: 'image/png', purpose: 'any' },
    ],
  };
}
