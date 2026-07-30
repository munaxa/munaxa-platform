import type { Meta, StoryObj } from '@storybook/react-vite';
import { Page, Section, TokenTable, StaticSwatch, type TokenRow } from './doc-kit.js';
import { NEUTRALS } from './brand-book.js';

/**
 * The semantic token reference.
 *
 * Every value in the table is measured off the running document, so the page shows the *active*
 * brand and scheme rather than a transcription of one palette. Switch the Brand control and the
 * hexes change while the token names, the utilities and the purposes stay exactly the same —
 * which is precisely the contract a component is written against.
 */
const BRAND: TokenRow[] = [
  {
    variable: '--primary',
    utilities: 'bg-primary · ring-primary',
    purpose: 'The brand as a fill. Primary actions, selected states, brand surfaces.',
  },
  {
    variable: '--primary-foreground',
    utilities: 'text-primary-foreground',
    purpose: 'Text and icons drawn on top of a --primary fill.',
  },
  {
    variable: '--primary-strong',
    utilities: 'text-primary-strong',
    purpose:
      'The brand at text weight. A light, high-chroma primary fails contrast as type, so brand-coloured text, links and icon strokes use this instead.',
    kind: 'text',
  },
  {
    variable: '--accent',
    utilities: 'bg-accent',
    purpose: 'The quietest brand tint — hover washes and subtle brand-tinted panels.',
  },
  {
    variable: '--accent-foreground',
    utilities: 'text-accent-foreground',
    purpose: 'Text on an --accent wash.',
  },
  {
    variable: '--accent-warm',
    utilities: 'bg-accent-warm · text-accent-warm',
    purpose: 'Secondary warm accent, for charts and categorical fills. Never a status colour.',
  },
  {
    variable: '--accent-cool',
    utilities: 'bg-accent-cool · text-accent-cool',
    purpose: 'Secondary cool accent, for charts and categorical fills. Never a status colour.',
  },
  {
    variable: '--ring',
    utilities: 'ring-ring',
    purpose: 'The focus ring. Must stay visible against every surface in both schemes.',
    kind: 'line',
  },
];

const SURFACES: TokenRow[] = [
  { variable: '--background', utilities: 'bg-background', purpose: 'The page itself.' },
  {
    variable: '--card',
    utilities: 'bg-card',
    purpose: 'Raised content surface — cards, panels, the grid body.',
  },
  {
    variable: '--popover',
    utilities: 'bg-popover',
    purpose: 'Overlay surface — menus, popovers, dialogs, tooltips.',
  },
  {
    variable: '--secondary',
    utilities: 'bg-secondary',
    purpose: 'Recessed surface — secondary buttons, table headers, inset regions.',
  },
  {
    variable: '--muted',
    utilities: 'bg-muted',
    purpose: 'The quietest surface — skeletons, disabled fills, zebra rows.',
  },
];

const TEXT: TokenRow[] = [
  {
    variable: '--foreground',
    utilities: 'text-foreground',
    purpose: 'Primary body and heading text.',
    kind: 'text',
  },
  {
    variable: '--muted-foreground',
    utilities: 'text-muted-foreground',
    purpose: 'Secondary text — descriptions, metadata, placeholders.',
    kind: 'text',
  },
  {
    variable: '--card-foreground',
    utilities: 'text-card-foreground',
    purpose: 'Text on a --card surface.',
    kind: 'text',
  },
  {
    variable: '--secondary-foreground',
    utilities: 'text-secondary-foreground',
    purpose: 'Text on a --secondary surface.',
    kind: 'text',
  },
];

const LINES: TokenRow[] = [
  {
    variable: '--border',
    utilities: 'border-border · divide-border',
    purpose: 'Every divider and container edge.',
    kind: 'line',
  },
  {
    variable: '--input',
    utilities: 'border-input',
    purpose: 'Form-control edges, which sit slightly stronger than a plain border.',
    kind: 'line',
  },
];

const STATUS: TokenRow[] = [
  { variable: '--success', utilities: 'bg-success', purpose: 'Succeeded, approved, paid, active.' },
  {
    variable: '--success-strong',
    utilities: 'text-success-strong',
    purpose: 'The success hue at text weight.',
    kind: 'text',
  },
  {
    variable: '--warning',
    utilities: 'bg-warning',
    purpose: 'Needs attention but is not yet a failure — pending, overdue soon, near a limit.',
  },
  {
    variable: '--warning-strong',
    utilities: 'text-warning-strong',
    purpose: 'The warning hue at text weight.',
    kind: 'text',
  },
  {
    variable: '--destructive',
    utilities: 'bg-destructive',
    purpose: 'Failed, rejected, irreversible. The only correct colour for a delete confirmation.',
  },
  { variable: '--info', utilities: 'bg-info', purpose: 'Neutral information, not a state change.' },
  {
    variable: '--info-strong',
    utilities: 'text-info-strong',
    purpose: 'The info hue at text weight.',
    kind: 'text',
  },
];

const RECORD_STATUS: TokenRow[] = [
  { variable: '--status-active', utilities: 'bg-status-active', purpose: 'Record state: active.' },
  {
    variable: '--status-inactive',
    utilities: 'bg-status-inactive',
    purpose: 'Record state: inactive.',
  },
  {
    variable: '--status-pending',
    utilities: 'bg-status-pending',
    purpose: 'Record state: pending.',
  },
  { variable: '--status-draft', utilities: 'bg-status-draft', purpose: 'Record state: draft.' },
  {
    variable: '--status-archived',
    utilities: 'bg-status-archived',
    purpose: 'Record state: archived.',
  },
  {
    variable: '--status-cancelled',
    utilities: 'bg-status-cancelled',
    purpose: 'Record state: cancelled.',
  },
];

const meta = {
  title: 'Foundations/Tokens',
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Every colour a component may use, by semantic name. Values are read live from the ' +
          'running document, so switching the Brand or Scheme control updates this page in place.',
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const SemanticColour: Story = {
  name: 'Semantic colour',
  render: () => (
    <Page
      title="Semantic tokens"
      lead={
        <>
          A component never names a colour, and never names a brand. It asks for a <em>role</em> —{' '}
          <code className="font-mono text-xs">bg-primary</code>,{' '}
          <code className="font-mono text-xs">text-muted-foreground</code> — and the active theme
          decides what that role is worth. Switch the <strong>Brand</strong> control in the toolbar:
          the hexes below change, the names do not. That gap is the entire multi-brand architecture.
        </>
      }
    >
      <Section
        title="Brand"
        description="The only group that differs meaningfully between the four products."
      >
        <TokenTable rows={BRAND} />
      </Section>
      <Section
        title="Surfaces"
        description="Ordered from the page backwards to the topmost overlay."
      >
        <TokenTable rows={SURFACES} />
      </Section>
      <Section title="Text">
        <TokenTable rows={TEXT} />
      </Section>
      <Section title="Lines and inputs">
        <TokenTable rows={LINES} />
      </Section>
      <Section
        title="Status"
        description="Shared across brands: a failure is red in every product, because meaning must not be a brand decision."
      >
        <TokenTable rows={STATUS} />
      </Section>
      <Section title="Record state" description="The lifecycle states a record badge can express.">
        <TokenTable rows={RECORD_STATUS} />
      </Section>
    </Page>
  ),
};

export const SharedNeutrals: Story = {
  name: 'Shared neutrals',
  render: () => (
    <Page
      title="Shared neutrals"
      lead={
        <>
          The neutral ramp is identical in all four brands, and that is what makes one component
          library possible: structure, body text and dividers are brand-independent, so switching
          brand only repaints the accent surfaces. These are fixed reference values — the tokens a
          component actually uses are the semantic ones above.
        </>
      }
    >
      <Section title="Ramp">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {NEUTRALS.map((n) => (
            <StaticSwatch key={n.name} name={n.name} hex={n.hex} />
          ))}
        </div>
      </Section>
    </Page>
  ),
};
