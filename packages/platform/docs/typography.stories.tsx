import type { Meta, StoryObj } from '@storybook/react-vite';
import { typography } from '../tokens/index.js';
import { Page, Section } from './doc-kit.js';

/**
 * Type is shared, not branded.
 *
 * All four products use the same families, sizes, weights and line heights; a brand changes the
 * colour of text, never its shape. Keeping type out of the theme is what stops "four brands" from
 * quietly becoming four typographic systems that only look related.
 */
const meta = {
  title: 'Foundations/Typography',
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const SIZE_CLASS: Record<string, string> = {
  xs: 'text-xs',
  sm: 'text-sm',
  base: 'text-base',
  lg: 'text-lg',
  xl: 'text-xl',
  '2xl': 'text-2xl',
  '3xl': 'text-3xl',
  '4xl': 'text-4xl',
};

export const Typography: Story = {
  render: () => (
    <Page
      title="Typography"
      lead={
        <>
          Three families — a display face for headings, a body face for everything else, and a
          monospace face for identifiers and code. Arabic is a first-class fallback in every family,
          because the products ship in Arabic and English and a type stack that only reasons about
          Latin breaks the moment it meets RTL.
        </>
      }
    >
      <Section title="Families">
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Display</p>
            <p className="font-display text-3xl font-semibold">Munaxa Platform</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Body</p>
            <p className="text-base">The quick brown fox jumps over the lazy dog. 0123456789</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Arabic</p>
            <p dir="rtl" className="text-xl">
              منصة مناقسة — نظام تصميم واحد لأربع منتجات
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Mono</p>
            <p className="font-mono text-sm">const primary = &apos;var(--primary)&apos;;</p>
          </div>
        </div>
      </Section>

      <Section title="Size scale">
        <div className="space-y-3">
          {Object.entries(typography.fontSize).map(([token, value]) => (
            <div key={token} className="flex items-baseline gap-4 border-b border-border pb-2">
              <code className="w-14 shrink-0 font-mono text-xs text-muted-foreground">{token}</code>
              <code className="w-20 shrink-0 font-mono text-xs text-muted-foreground">{value}</code>
              <span className={SIZE_CLASS[token]}>The quick brown fox</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Weight">
        <div className="space-y-2">
          {Object.entries(typography.fontWeight).map(([token, value]) => (
            <div key={token} className="flex items-baseline gap-4">
              <code className="w-24 shrink-0 font-mono text-xs text-muted-foreground">{token}</code>
              <span className="text-lg" style={{ fontWeight: value }}>
                The quick brown fox ({value})
              </span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Line height">
        <div className="grid gap-4 sm:grid-cols-3">
          {Object.entries(typography.lineHeight).map(([token, value]) => (
            <div key={token} className="rounded-lg border border-border p-4">
              <code className="font-mono text-xs text-muted-foreground">
                {token} · {value}
              </code>
              <p className="mt-2 text-sm" style={{ lineHeight: value }}>
                One shared platform powers four branded products. Only the palette changes.
              </p>
            </div>
          ))}
        </div>
      </Section>
    </Page>
  ),
};
