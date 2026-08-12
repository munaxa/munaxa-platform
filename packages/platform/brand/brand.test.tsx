import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { BrandProvider } from './context.js';
import { ProductLogo } from './logo.js';
import { brandIcons, brandManifest, brandOpenGraphImage } from './metadata.js';
import {
  PRODUCT_ORDER,
  corporateBrand,
  productBrands,
  productBrandsWithAssetBase,
  type BrandImage,
  type BrandLockup,
} from './products.js';
import { ProductSwitcher } from './switcher.js';
import { themes } from '../themes/index.js';

const inSchool = (ui: React.ReactNode) =>
  render(<BrandProvider product="school">{ui}</BrandProvider>);

/** Every `<img>` the component rendered, light and dark alike. */
const images = (container: HTMLElement): HTMLImageElement[] =>
  Array.from(container.querySelectorAll('img'));

describe('the product brand registry', () => {
  it('gives every product the same wordmark and its own product word', () => {
    // The brand rule the artwork expresses: one family, one variable. If this ever diverges the
    // three products have stopped being three views of one company.
    for (const id of PRODUCT_ORDER) {
      expect(productBrands[id].wordmark).toBe('munaxa.');
    }
    expect(PRODUCT_ORDER.map((id) => productBrands[id].productWord)).toEqual([
      'school',
      'work',
      'docs',
    ]);
  });

  it('takes each product colour from that product’s theme, never a second copy', () => {
    // The platform is the colour authority. If this ever reads from anywhere else — a constant, a
    // value someone measured off a PNG — the mark in the sidebar and the button beside it stop
    // being the same colour, which is the whole defect the registry exists to make impossible.
    for (const id of PRODUCT_ORDER) {
      expect(productBrands[id].color).toBe(themes[id].brand.color.DEFAULT);
    }
    expect(corporateBrand.color).toBe(themes.group.brand.color.DEFAULT);
  });

  it('gives every product a distinct colour', () => {
    const colours = PRODUCT_ORDER.map((id) => productBrands[id].color);
    expect(new Set(colours).size).toBe(colours.length);
  });

  it('points every product at its own folder and no other', () => {
    for (const id of PRODUCT_ORDER) {
      const assets: readonly (BrandImage | BrandLockup)[] = Object.values(productBrands[id].assets);
      const paths = assets.flatMap((asset) =>
        'src' in asset ? [asset.src] : [asset.onLight.src, asset.onDark.src],
      );
      expect(paths.length).toBeGreaterThan(0);
      for (const path of paths) {
        expect(path).toContain(`/branding/${id}/`);
        for (const other of PRODUCT_ORDER.filter((candidate) => candidate !== id)) {
          expect(path).not.toContain(`/${other}/`);
        }
      }
    }
  });

  it('keeps a light and a dark file for every lockup, and one file for the symbol', () => {
    const { assets } = productBrands.docs;
    for (const lockup of [assets.horizontal, assets.stacked, assets.wordmark]) {
      expect(lockup.onDark.src).not.toBe(lockup.onLight.src);
      // The dark variant is the same artwork, so it keeps the same intrinsic ratio.
      expect(lockup.onDark.width / lockup.onDark.height).toBeCloseTo(
        lockup.onLight.width / lockup.onLight.height,
        5,
      );
    }
    expect(assets.symbol.width).toBe(assets.symbol.height);
  });

  it('re-bases every asset path when an application serves them from elsewhere', () => {
    const cdn = productBrandsWithAssetBase('https://cdn.example/brand');
    expect(cdn.work.assets.symbol.src).toBe('https://cdn.example/brand/work/logos/symbol.png');
  });
});

describe('ProductLogo', () => {
  it('names itself after the product it is showing', () => {
    inSchool(<ProductLogo />);
    expect(screen.getAllByAltText('Munaxa School').length).toBeGreaterThan(0);
  });

  it('renders the product in scope, not one it was never given', () => {
    const { container } = inSchool(<ProductLogo />);
    for (const image of images(container)) {
      expect(image.getAttribute('src')).toContain('/branding/school/');
      expect(image.getAttribute('src')).not.toContain('/work/');
      expect(image.getAttribute('src')).not.toContain('/docs/');
    }
  });

  it('ships a real file for each colour scheme rather than filtering one', () => {
    const { container } = inSchool(<ProductLogo />);
    const [light, dark] = images(container);
    expect(light).toHaveClass('dark:hidden');
    expect(dark).toHaveClass('dark:block');
    expect(dark!.getAttribute('src')).toContain('-on-dark');
    // Nothing may reach the dark variant by inverting the approved artwork.
    expect(container.innerHTML).not.toContain('invert');
  });

  it('scales to the requested height without distorting the artwork', () => {
    const { container } = inSchool(<ProductLogo variant="horizontal" height={40} />);
    const approved = productBrands.school.assets.horizontal.onLight;
    for (const image of images(container)) {
      expect(image.getAttribute('height')).toBe('40');
      // The declared box is the approved ratio, to the nearest whole pixel — the browser reserves
      // exactly what the image fills, so nothing is squeezed and nothing reflows around it.
      expect(Number(image.getAttribute('width'))).toBe(
        Math.round((approved.width / approved.height) * 40),
      );
    }
  });

  it('is silent when the product name is already written beside it', () => {
    const { container } = inSchool(
      <span>
        <ProductLogo variant="symbol" decorative />
        Munaxa School
      </span>,
    );
    for (const image of images(container)) {
      expect(image).toHaveAttribute('aria-hidden', 'true');
      expect(image).toHaveAttribute('alt', '');
    }
    expect(screen.queryByAltText('Munaxa School')).not.toBeInTheDocument();
  });

  it('offers the symbol instead of squeezing the wordmark at narrow widths', () => {
    const { container } = inSchool(<ProductLogo compactBelow="md" />);
    const symbol = images(container).find((image) =>
      image.getAttribute('src')?.endsWith('symbol.png'),
    );
    expect(symbol).toBeDefined();
    // Width and colour scheme are decided by separate elements, so neither rule can lose to the
    // other and leave a black wordmark on a dark ground.
    expect(symbol!.parentElement).toHaveClass('md:hidden');
    expect(symbol!.className).not.toContain('dark:');
  });

  it('can show a sibling product only when explicitly asked', () => {
    const { container } = inSchool(<ProductLogo product="work" variant="symbol" />);
    expect(images(container)[0]!.getAttribute('src')).toContain('/branding/work/');
    expect(screen.getAllByAltText('Munaxa Work').length).toBeGreaterThan(0);
  });

  it('refuses to guess a product when no provider declared one', () => {
    // A silent default is how a School logo ends up on a Work screen: it renders, it looks
    // plausible, and nothing fails.
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<ProductLogo />)).toThrow(/BrandProvider/);
    quiet.mockRestore();
  });
});

describe('ProductSwitcher', () => {
  it('offers every product with its own mark, and says which one you are in', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    inSchool(<ProductSwitcher onSelect={onSelect} />);

    await user.click(screen.getByRole('button', { name: 'Switch product' }));

    const options = await screen.findAllByRole('menuitemradio');
    expect(options.map((option) => option.textContent)).toEqual([
      'Munaxa School',
      'Munaxa Work',
      'Munaxa Docs',
    ]);
    expect(options[0]).toHaveAttribute('aria-checked', 'true');
    expect(options[1]).toHaveAttribute('aria-checked', 'false');

    await user.click(options[2]!);
    expect(onSelect).toHaveBeenCalledWith('docs');
  });
});

describe('the corporate identity', () => {
  it('is the company, kept out of the product registry', () => {
    expect(corporateBrand.name).toBe('Munaxa');
    expect(Object.keys(productBrands)).not.toContain('group');
  });

  it('has the mark and the icons, and deliberately no lockup', () => {
    // Every lockup in the approved artwork carries a product word, so a corporate one would have
    // to be composed — and composing a lockup is redrawing the logo.
    expect(corporateBrand.assets.symbol.src).toContain('/branding/group/');
    expect(corporateBrand.assets).not.toHaveProperty('horizontal');
    expect(corporateBrand.assets).not.toHaveProperty('wordmark');
  });

  it('can still ask for a favicon and a manifest, because those it does have', () => {
    expect(brandIcons(corporateBrand).icon[0]!.url).toContain('/branding/group/');
    expect(brandManifest('group').theme_color).toBe(themes.group.brand.color.DEFAULT);
  });
});

describe('browser metadata', () => {
  it('gives each product its own icons rather than one shared favicon', () => {
    const perProduct = PRODUCT_ORDER.map((id) => brandIcons(id).icon[0]!.url);
    expect(new Set(perProduct).size).toBe(perProduct.length);
    expect(brandIcons('docs').apple[0]!.sizes).toBe('180x180');
  });

  it('describes a share image with the size it actually is', () => {
    const image = brandOpenGraphImage('work');
    expect(image).toMatchObject({ width: 1200, height: 630, alt: 'Munaxa Work' });
  });

  it('paints the window chrome in the product colour', () => {
    // The one place a raw hex belongs: the browser paints this before any stylesheet is parsed.
    expect(brandManifest('school').theme_color).toBe(themes.school.brand.color.DEFAULT);
    expect(brandManifest('docs').name).toBe('Munaxa Docs');
  });
});
