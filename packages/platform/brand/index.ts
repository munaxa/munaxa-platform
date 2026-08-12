/**
 * Munaxa product branding — the one place product identity is defined.
 *
 *   import { BrandProvider, ProductLogo } from '@munaxa/platform';
 *
 * A product declares itself once, in its root layout:
 *
 *   <BrandProvider product="docs">…</BrandProvider>
 *
 * and every logo below reads that rather than being handed a file path. Colour comes from the
 * matching theme (`@munaxa/platform/css/themes/docs`), artwork from `assets/`, and the two are
 * kept in step by sharing an id.
 */
export {
  DEFAULT_ASSET_BASE,
  PRODUCT_ORDER,
  isBrandedProduct,
  productBrands,
  productBrandsWithAssetBase,
  type BrandAssets,
  type BrandImage,
  type BrandLockup,
  type LogoVariant,
  type ProductBrand,
  type ProductId,
} from './products.js';

export { BrandProvider, useBrand, useOptionalBrand, type BrandProviderProps } from './context.js';

export {
  ProductLogo,
  type BrandedProductId,
  type CompactBreakpoint,
  type ProductLogoProps,
} from './logo.js';

export { ProductSwitcher, type ProductSwitcherProps } from './switcher.js';

export {
  brandIcons,
  brandManifest,
  brandOpenGraphImage,
  type BrandIcons,
  type BrandManifest,
  type BrandOpenGraphImage,
  type IconDescriptor,
} from './metadata.js';
