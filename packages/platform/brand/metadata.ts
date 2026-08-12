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
import { productBrands, type ProductBrand } from './products.js';

/** One icon declaration, in the shape `<link rel>` and the manifest both describe. */
export interface IconDescriptor {
  readonly url: string;
  readonly sizes: string;
  readonly type: string;
}

export interface BrandIcons {
  readonly icon: readonly IconDescriptor[];
  readonly apple: readonly IconDescriptor[];
}

const brandOf = (product: ProductBrand | keyof typeof productBrands): ProductBrand =>
  typeof product === 'string' ? productBrands[product] : product;

/**
 * The favicon set for a product.
 *
 * Two sizes rather than one: the 32px export is drawn for the tab strip, where a downscaled 512
 * turns the M into three grey smudges, and the 512 is what a bookmark or a high-DPI tab uses.
 */
export function brandIcons(product: ProductBrand | keyof typeof productBrands): BrandIcons {
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
  const brand = brandOf(product);
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
  readonly icons: readonly { src: string; sizes: string; type: string; purpose: string }[];
}

/**
 * A web app manifest for a product.
 *
 * `theme_color` is the product colour — the one place a raw hex is correct, because the browser
 * paints the window chrome before any stylesheet is parsed and cannot read a custom property.
 * `background_color` is the neutral page background rather than the brand, so the splash screen
 * matches the application that follows it instead of flashing a saturated field first.
 */
export function brandManifest(
  product: ProductBrand | keyof typeof productBrands,
  description?: string,
): BrandManifest {
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
