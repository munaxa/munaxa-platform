'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import {
  productBrands,
  productBrandsWithAssetBase,
  type ProductBrand,
  type ProductId,
} from './products.js';

const BrandContext = createContext<ProductBrand | null>(null);

export interface BrandProviderProps {
  /** Which product this part of the tree belongs to. */
  product: Exclude<ProductId, 'group'>;
  /**
   * Where the product serves its copy of the platform artwork, when it is not `/branding`.
   * A CDN prefix or a Next `basePath` are the usual reasons.
   */
  assetBase?: string;
  children: ReactNode;
}

/**
 * Declares which product the surfaces below belong to.
 *
 * A Munaxa application is one product, so this belongs once in the root layout, beside the theme
 * import — and that is the point. Every logo below reads the product from here rather than being
 * told which file to load, so "never display the wrong product logo" stops being a rule anybody
 * has to remember and becomes a thing the component cannot do.
 */
export function BrandProvider({ product, assetBase, children }: BrandProviderProps) {
  const value = useMemo(
    () => (assetBase ? productBrandsWithAssetBase(assetBase)[product] : productBrands[product]),
    [product, assetBase],
  );

  return <BrandContext.Provider value={value}>{children}</BrandContext.Provider>;
}

/**
 * The product brand in scope.
 *
 * Throws when there is no provider rather than falling back to a default. A silent default is how
 * a School logo ends up on a Work screen: it renders, it looks plausible, and nothing fails.
 */
export function useBrand(): ProductBrand {
  const brand = useContext(BrandContext);
  if (brand === null) {
    throw new Error('useBrand must be used within a <BrandProvider>. Add one to the root layout.');
  }
  return brand;
}

/** The product brand in scope, or `null` outside a provider — for optional branding. */
export function useOptionalBrand(): ProductBrand | null {
  return useContext(BrandContext);
}
