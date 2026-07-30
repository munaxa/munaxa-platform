'use client';

import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ThemeId } from '../themes/index.js';
import { themes } from '../themes/index.js';
import { BRAND_BY_ID, type BrandBookEntry } from './brand-book.js';
import { Page, Section, StaticSwatch, TokenTable, type TokenRow } from './doc-kit.js';
import { ThemeShowcase } from './theme-showcase.js';

/**
 * One page per product brand.
 *
 * Each renders the *same* `ThemeShowcase` inside a container carrying its own `data-brand`, so
 * the components below are not "the School button" or "the Work button" — they are the platform's
 * button, resolving a different palette. Nothing on these pages is duplicated per brand except
 * the brand's own reference data.
 */

/** The semantic roles worth showing per brand: the ones a palette actually re-points. */
const BRAND_ROLES: TokenRow[] = [
  {
    variable: '--primary',
    utilities: 'bg-primary',
    purpose: 'Primary actions and brand fills.',
  },
  {
    variable: '--primary-strong',
    utilities: 'text-primary-strong',
    purpose: 'Brand-coloured text and links.',
    kind: 'text',
  },
  { variable: '--accent', utilities: 'bg-accent', purpose: 'Quiet brand tint.' },
  {
    variable: '--accent-foreground',
    utilities: 'text-accent-foreground',
    purpose: 'Text on the tint.',
    kind: 'text',
  },
  { variable: '--ring', utilities: 'ring-ring', purpose: 'Focus ring.', kind: 'line' },
  { variable: '--background', utilities: 'bg-background', purpose: 'The page surface.' },
  { variable: '--card', utilities: 'bg-card', purpose: 'Raised surface.' },
  {
    variable: '--border',
    utilities: 'border-border',
    purpose: 'Edges and dividers.',
    kind: 'line',
  },
];

function BrandPage({ id }: { id: ThemeId }) {
  const book: BrandBookEntry = BRAND_BY_ID[id];
  const theme = themes[id];
  const [from, to] = book.gradient;

  return (
    // The pin. Everything inside resolves the palette scoped to this brand, whatever the
    // toolbar's Brand control is set to — so the four pages can be compared side by side.
    <div data-brand={id}>
      <div className="bg-background text-foreground">
        <Page
          title={book.product}
          lead={
            <>
              {book.purpose} <span className="text-muted-foreground">{theme.description}</span>
            </>
          }
        >
          <Section title="Brand overview">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-xl border border-border bg-card p-5">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Personality</p>
                <ul className="mt-2 space-y-1 text-sm">
                  {book.personality.map((word) => (
                    <li key={word} className="font-medium">
                      {word}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-xl border border-border bg-card p-5">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Theme id</p>
                <p className="mt-2 font-mono text-sm">{theme.id}</p>
                <p className="mt-3 text-xs uppercase tracking-wide text-muted-foreground">
                  CSS entry point
                </p>
                <code className="mt-1 block font-mono text-xs break-all">{theme.cssEntry}</code>
              </div>
              <div className="rounded-xl border border-border bg-card p-5">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Gradient</p>
                <span
                  aria-hidden="true"
                  className="mt-2 block h-16 rounded-lg border border-border"
                  style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}
                />
                <p className="mt-2 font-mono text-[11px] text-muted-foreground">
                  {from} → {to}
                </p>
              </div>
            </div>
          </Section>

          <Section
            title="Brand palette"
            description="The reference values issued in the brand book. The runtime palette derives a full perceptual ramp from the primary, so a generated step is not always identical to the single swatch here."
          >
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StaticSwatch name="Primary" hex={book.primary} />
              <StaticSwatch name="Secondary" hex={book.secondary} />
              <StaticSwatch name="Light" hex={book.light} />
              <StaticSwatch name="Dark" hex={book.dark} />
            </div>
          </Section>

          <Section
            title="Semantic token mapping"
            description="What the brand's palette makes each shared role worth, measured live. Every component below reads these and nothing else."
          >
            <TokenTable rows={BRAND_ROLES} />
          </Section>

          <Section
            title="The platform, in this brand"
            description="Identical components to every other theme page — only the palette differs."
          >
            <ThemeShowcase />
          </Section>
        </Page>
      </div>
    </div>
  );
}

const meta = {
  title: 'Foundations/Themes',
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'One shared platform, four product brands. Each page pins its own theme, so the four ' +
          'can be compared directly; the toolbar Brand control re-themes every other story in ' +
          'the sidebar the same way.',
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const MunaxaGroup: Story = { name: 'Munaxa Group', render: () => <BrandPage id="group" /> };
export const MunaxaSchool: Story = {
  name: 'Munaxa School',
  render: () => <BrandPage id="school" />,
};
export const MunaxaWork: Story = { name: 'Munaxa Work', render: () => <BrandPage id="work" /> };
export const MunaxaDocs: Story = { name: 'Munaxa Docs', render: () => <BrandPage id="docs" /> };
