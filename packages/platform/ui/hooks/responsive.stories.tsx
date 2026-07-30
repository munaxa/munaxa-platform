import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  useBreakpoint,
  useIsMobile,
  usePrefersReducedMotion,
  useViewport,
  VIEWPORT_ORDER,
} from './use-breakpoint.js';
import { breakpoints } from '../../tokens/breakpoints/index.js';
import { Stack } from '../layouts/stack.js';
import { Container } from '../layouts/container.js';
import { Surface } from '../layouts/surface.js';
import { Section } from '../layouts/page.js';
import { Badge } from '../components/primitives/badge.js';

const meta = {
  title: 'Foundations/Responsive',
  parameters: {
    docs: {
      description: {
        component:
          'The responsive foundation. Every query is built from `tokens/breakpoints`, so JS and ' +
          'CSS can never disagree about where a breakpoint sits — an app that writes ' +
          '`matchMedia("(min-width: 768px)")` by hand has forked the scale the moment the token ' +
          'changes. Resize the preview to watch these update.\n\n' +
          'These hooks are for *behaviour* — whether to render a drawer or a rail — not for ' +
          'appearance. Anything that must be right in the first paint belongs in CSS, because ' +
          'the hooks report `false` until mount so server and client markup agree.',
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Live: Story = {
  render: function LiveViewport() {
    const viewport = useViewport();
    const isMobile = useIsMobile();
    const reducedMotion = usePrefersReducedMotion();
    const md = useBreakpoint('md');
    const lg = useBreakpoint('lg');

    return (
      <Container className="py-6">
        <Stack gap={6}>
          <Section title="useViewport" description="The widest breakpoint currently satisfied.">
            <Stack direction="horizontal" gap={2} wrap>
              {VIEWPORT_ORDER.map((name) => (
                <Badge key={name} tone={name === viewport ? 'success' : 'muted'}>
                  {name}
                </Badge>
              ))}
            </Stack>
          </Section>

          <Section
            title="useBreakpoint"
            description="The JS mirror of Tailwind's md: / lg: prefixes."
          >
            <Stack gap={2}>
              <Surface padding={3} className="text-sm">
                <code>useBreakpoint(&apos;md&apos;)</code> → <strong>{String(md)}</strong>{' '}
                <span className="text-muted-foreground">(≥ {breakpoints.md})</span>
              </Surface>
              <Surface padding={3} className="text-sm">
                <code>useBreakpoint(&apos;lg&apos;)</code> → <strong>{String(lg)}</strong>{' '}
                <span className="text-muted-foreground">(≥ {breakpoints.lg})</span>
              </Surface>
            </Stack>
          </Section>

          <Section title="Behavioural helpers">
            <Stack gap={2}>
              <Surface padding={3} className="text-sm">
                <code>useIsMobile()</code> → <strong>{String(isMobile)}</strong>{' '}
                <span className="text-muted-foreground">
                  — below md, where navigation becomes a drawer
                </span>
              </Surface>
              <Surface padding={3} className="text-sm">
                <code>usePrefersReducedMotion()</code> → <strong>{String(reducedMotion)}</strong>{' '}
                <span className="text-muted-foreground">
                  — animation must be removed, not shortened
                </span>
              </Surface>
            </Stack>
          </Section>

          <Section title="The scale" description="Single source of truth for CSS and JS alike.">
            <Stack gap={1}>
              {Object.entries(breakpoints).map(([name, value]) => (
                <Surface key={name} padding={2} tone="muted" className="font-mono text-xs">
                  {name.padEnd(4)} {value}
                </Surface>
              ))}
            </Stack>
          </Section>
        </Stack>
      </Container>
    );
  },
};
