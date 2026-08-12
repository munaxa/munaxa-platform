'use client';

import type { ReactNode } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/components/overlays/dropdown-menu.js';
import { Check, ChevronsUpDown } from '../icons/index.js';
import { cn } from '../ui/lib/cn.js';
import { useBrand } from './context.js';
import { ProductLogo, type BrandedProductId } from './logo.js';
import { PRODUCT_ORDER, productBrands } from './products.js';

export interface ProductSwitcherProps {
  /**
   * Which products the current user may open. Defaults to all three.
   *
   * A switcher that lists a product somebody has no access to is an invitation to a permission
   * error, so the application passes the entitlements it already knows about.
   */
  products?: readonly BrandedProductId[];
  /** Called with the chosen product. The application owns navigation. */
  onSelect: (product: BrandedProductId) => void;
  label?: string;
  /** Rendered under the list — "All products", "Manage access". */
  footer?: ReactNode;
  className?: string;
}

/**
 * Moves between Munaxa School, Work and Docs.
 *
 * Each row is the product's own symbol, its name and its colour, so the list reads as three
 * members of one family rather than three unrelated links — which is exactly the relationship the
 * brand is asserting. The symbols are decorative: the product's name is written beside every one
 * of them, and a picture captioned with the text next to it is announced twice.
 *
 * The current product is marked with `aria-checked` on a `menuitemradio`, not merely a tick glyph,
 * so which product you are in is announced rather than only shown.
 */
export function ProductSwitcher({
  products = PRODUCT_ORDER,
  onSelect,
  label = 'Switch product',
  footer,
  className,
}: ProductSwitcherProps) {
  const current = useBrand();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={label}
        className={cn(
          'inline-flex h-9 items-center gap-2 rounded-lg px-2 text-sm',
          'hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          className,
        )}
      >
        <ProductLogo variant="symbol" height={20} decorative />
        <span className="max-w-[160px] truncate font-medium">{current.name}</span>
        <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {products.map((id) => (
          <DropdownMenuItem
            key={id}
            role="menuitemradio"
            aria-checked={id === current.id}
            onSelect={() => onSelect(id)}
            className="gap-2"
          >
            <ProductLogo variant="symbol" height={20} product={id} decorative />
            <span className="min-w-0 flex-1 truncate">{productBrands[id].name}</span>
            {id === current.id ? <Check className="size-4 shrink-0" aria-hidden="true" /> : null}
          </DropdownMenuItem>
        ))}
        {footer ? (
          <>
            <DropdownMenuSeparator />
            {footer}
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
