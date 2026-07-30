'use client';

import type { Meta, StoryObj } from '@storybook/react-vite';
import { Badge, Button, Card, CardContent } from '../index.js';
import { themes } from '../themes/index.js';
import { BRAND_BOOK } from './brand-book.js';
import { Page, Section } from './doc-kit.js';

/**
 * The front door of the documentation site.
 *
 * Its job is to correct a specific misreading: that this is the School design system with other
 * products borrowing from it. It is one platform, and School is one of four themes.
 */
const meta = {
  title: 'Foundations/Overview',
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Overview: Story = {
  render: () => (
    <Page
      title="The Munaxa Platform"
      lead={
        <>
          One component library, one token contract, one accessibility floor — shared by every
          Munaxa product. This is not the School design system; School is one of four themes it
          renders. Use the <strong>Brand</strong> control in the toolbar on any story in this
          sidebar to see the same components under a different product.
        </>
      }
    >
      <Section
        title="Four brands, one platform"
        description="Each product ships the platform unchanged and imports exactly one theme."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {BRAND_BOOK.map((brand) => (
            <div key={brand.id} data-brand={brand.id}>
              <Card className="h-full">
                <CardContent className="space-y-3 p-5">
                  <div className="flex items-center gap-3">
                    <span
                      aria-hidden="true"
                      className="size-10 shrink-0 rounded-lg"
                      style={{
                        background: `linear-gradient(135deg, ${brand.gradient[0]}, ${brand.gradient[1]})`,
                      }}
                    />
                    <div className="min-w-0">
                      <p className="font-display text-base font-semibold">{brand.product}</p>
                      <p className="font-mono text-[11px] text-muted-foreground">
                        {themes[brand.id].cssEntry}
                      </p>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">{brand.purpose}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {brand.personality.map((word) => (
                      <Badge key={word} tone="muted">
                        {word}
                      </Badge>
                    ))}
                  </div>
                  {/* Live proof: the same Button, four palettes, no per-brand code. */}
                  <div className="flex items-center gap-2 pt-1">
                    <Button size="sm">Primary action</Button>
                    <Button size="sm" variant="outline">
                      Secondary
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="How a brand reaches a component"
        description="Three layers, and a component only ever sees the last one."
      >
        <div className="space-y-3">
          {[
            {
              step: '1',
              title: 'The palette',
              body: 'themes/<id>/palette.css gives every semantic role a value for one brand. This is the only layer that differs between products.',
            },
            {
              step: '2',
              title: 'The contract',
              body: "themes/base/base.css declares which roles exist and binds them to Tailwind's token namespace. It is product-agnostic and states no colour.",
            },
            {
              step: '3',
              title: 'The component',
              body: 'A component asks for a role — bg-primary, text-muted-foreground — and never knows which product it is running in. There is no brand prop, anywhere.',
            },
          ].map((layer) => (
            <div
              key={layer.step}
              className="flex gap-4 rounded-xl border border-border bg-card p-5"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                {layer.step}
              </span>
              <div className="min-w-0 space-y-1">
                <p className="font-medium">{layer.title}</p>
                <p className="text-sm text-muted-foreground">{layer.body}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="What a theme may change"
        description="The boundary that keeps four products feeling like one system."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-border bg-card p-5">
            <p className="font-medium">Branding only</p>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              <li>The primary scale and its accents</li>
              <li>Brand-tinted surfaces and shadow tint</li>
              <li>Both colour schemes for the above</li>
            </ul>
          </div>
          <div className="rounded-xl border border-border bg-card p-5">
            <p className="font-medium">Never</p>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              <li>Spacing, radius, elevation geometry, motion</li>
              <li>Typography and the neutral ramp</li>
              <li>Status meaning — a failure is red in every product</li>
              <li>Component structure, behaviour or API</li>
            </ul>
          </div>
        </div>
      </Section>
    </Page>
  ),
};
