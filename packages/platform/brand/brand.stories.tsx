import type { Meta, StoryObj } from '@storybook/react-vite';

import { BrandProvider } from './context.js';
import { ProductLogo } from './logo.js';
import { PRODUCT_ORDER, productBrands } from './products.js';
import { ProductSwitcher } from './switcher.js';

const meta = {
  title: 'Foundations/Product Branding',
  component: ProductLogo,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'The approved product lockups. All three products share the M symbol, the `munaxa.` ' +
          'wordmark, the square punctuation mark, the typography and the proportions — the ' +
          'product word and the product colour are the only things that differ. Which product a ' +
          'logo shows comes from `<BrandProvider>`, never from the caller, so no screen can put ' +
          'one product’s mark inside another. Toggle the Scheme control: the dark scheme loads ' +
          'the approved `-on-dark` export rather than filtering the light one.',
      },
    },
  },
} satisfies Meta<typeof ProductLogo>;

export default meta;
type Story = StoryObj<typeof meta>;

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex flex-col gap-2">
    <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
      {label}
    </span>
    <div className="flex flex-wrap items-center gap-8">{children}</div>
  </div>
);

/** The three products side by side — one family, one variable. */
export const Family: Story = {
  render: () => (
    <div className="flex flex-col gap-8">
      {PRODUCT_ORDER.map((id) => (
        <BrandProvider key={id} product={id}>
          <Row label={productBrands[id].name}>
            <ProductLogo variant="horizontal" height={34} />
            <ProductLogo variant="stacked" height={72} />
            <ProductLogo variant="symbol" height={40} decorative />
          </Row>
        </BrandProvider>
      ))}
    </div>
  ),
};

/** Every lockup one product ships, at the sizes each is drawn for. */
export const Variants: Story = {
  render: () => (
    <BrandProvider product="school">
      <div className="flex flex-col gap-8">
        <Row label="Horizontal — headers, rails, drawers">
          <ProductLogo variant="horizontal" height={30} />
        </Row>
        <Row label="Stacked — login, hero, splash">
          <ProductLogo variant="stacked" height={80} />
        </Row>
        <Row label="Wordmark — footers and text-only surfaces">
          <ProductLogo variant="wordmark" height={26} />
        </Row>
        <Row label="Symbol — collapsed rail, favicon, watermark">
          <ProductLogo variant="symbol" height={36} decorative />
        </Row>
        <Row label="Descriptor — a marketing asset, never the default application logo">
          <ProductLogo variant="tagline" height={90} />
        </Row>
      </div>
    </BrandProvider>
  ),
};

/**
 * The narrow case. Below the breakpoint the lockup gives way to the symbol rather than being
 * squeezed — resize the preview to see it swap.
 */
export const Responsive: Story = {
  render: () => (
    <BrandProvider product="work">
      <Row label="Collapses below md">
        <ProductLogo variant="horizontal" height={30} compactBelow="md" />
      </Row>
    </BrandProvider>
  ),
};

/** Moving between the three products, each row carrying its own mark and colour. */
export const Switcher: Story = {
  render: () => (
    <BrandProvider product="docs">
      <ProductSwitcher onSelect={() => undefined} />
    </BrandProvider>
  ),
};
