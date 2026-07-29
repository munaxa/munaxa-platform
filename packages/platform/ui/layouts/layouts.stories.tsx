import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Stack, Inline, Cluster } from './stack.js';
import { Container } from './container.js';
import { Grid } from './grid.js';
import { Center, Cover } from './center.js';
import { Surface } from './surface.js';
import { PageHeader, Section } from './page.js';
import { Split, SidebarLayout, InspectorLayout } from './split.js';
import { Panel, Toolbar } from './panel.js';
import { Workspace } from './workspace.js';
import { ResizablePanels } from './resizable.js';
import { Button } from '../components/primitives/button.js';
import { Badge } from '../components/primitives/badge.js';
import { Input } from '../components/forms/input.js';

const meta = {
  title: 'Layout/Primitives',
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Layout primitives own *where things sit*, never how they look. Every spacing value is ' +
          'a step on the shared scale and every breakpoint comes from `tokens/breakpoints`, so a ' +
          'layout and a `useBreakpoint` call always agree. Horizontal arrangements use flex row ' +
          'and logical properties, so RTL needs no separate code path — switch the Direction ' +
          'control in the toolbar to check.',
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** A labelled block, so the arrangement being demonstrated is visible. */
function Demo({ children, tone = 'card' }: { children: React.ReactNode; tone?: 'card' | 'muted' }) {
  return (
    <Surface tone={tone} padding={4} className="text-sm">
      {children}
    </Surface>
  );
}

export const StackAndInline: Story = {
  name: 'Stack · Inline · Cluster',
  render: () => (
    <Stack gap={8} className="p-6">
      <Section title="Stack" description="One axis, one gap step. Vertical by default.">
        <Stack gap={2}>
          <Demo>first</Demo>
          <Demo>second</Demo>
          <Demo>third</Demo>
        </Stack>
      </Section>

      <Section title="Inline" description="Horizontal flow that wraps — chips, tags, metadata.">
        <Inline gap={2}>
          {['Active', 'Pending', 'Draft', 'Archived', 'Cancelled', 'Review'].map((label) => (
            <Badge key={label} tone="muted">
              {label}
            </Badge>
          ))}
        </Inline>
      </Section>

      <Section title="Cluster" description="A group that acts as one unit, positioned by justify.">
        <Cluster justify="end">
          <Button variant="outline">Cancel</Button>
          <Button>Save changes</Button>
        </Cluster>
      </Section>
    </Stack>
  ),
};

export const ContainerWidths: Story = {
  render: () => (
    <Stack gap={4} className="py-6">
      {(['prose', 'content', 'page', 'wide'] as const).map((width) => (
        <Container key={width} width={width}>
          <Demo tone="muted">{width}</Demo>
        </Container>
      ))}
    </Stack>
  ),
};

/** Resize the preview to watch the column count change at each breakpoint. */
export const ResponsiveGrid: Story = {
  render: () => (
    <Container className="py-6">
      <Section
        title="Responsive grid"
        description="cols={{ base: 1, sm: 2, lg: 3, xl: 4 }} — mobile-first, same order as the CSS."
      >
        <Grid cols={{ base: 1, sm: 2, lg: 3, xl: 4 }} gap={4}>
          {Array.from({ length: 8 }, (_, i) => (
            <Demo key={i}>card {i + 1}</Demo>
          ))}
        </Grid>
      </Section>
    </Container>
  ),
};

export const Surfaces: Story = {
  render: () => (
    <Container className="py-6">
      <Grid cols={{ base: 1, md: 3 }} gap={4}>
        <Surface padding={4}>bordered (default)</Surface>
        <Surface padding={4} elevation="md" bordered={false}>
          elevated
        </Surface>
        <Surface padding={4} tone="muted">
          muted
        </Surface>
      </Grid>
    </Container>
  ),
};

export const CenterAndCover: Story = {
  name: 'Center · Cover',
  render: () => (
    <Container className="py-6">
      <Grid cols={{ base: 1, md: 2 }} gap={4}>
        <Surface className="h-56">
          <Cover>
            <p className="text-sm text-muted-foreground">Cover — fills and centres</p>
            <Button size="sm">Primary action</Button>
          </Cover>
        </Surface>
        <Surface padding={6}>
          <Center text>
            <p className="text-sm text-muted-foreground">Center — horizontal only</p>
          </Center>
        </Surface>
      </Grid>
    </Container>
  ),
};

/** `start` / `end`, not `left` / `right` — the panes swap sides in RTL. */
export const SplitPanes: Story = {
  render: () => (
    <Container className="py-6">
      <Stack gap={6}>
        <Section title="1/3 · 2/3" description="Stacks below md.">
          <Split ratio="1/3" start={<Demo>start</Demo>} end={<Demo tone="muted">end</Demo>} />
        </Section>
        <Section title="1/2 · 1/2">
          <Split ratio="1/2" start={<Demo>start</Demo>} end={<Demo tone="muted">end</Demo>} />
        </Section>
      </Stack>
    </Container>
  ),
};

export const AppFrame: Story = {
  name: 'Sidebar · Workspace · Inspector',
  render: () => (
    <div className="h-[560px]">
      <SidebarLayout
        className="h-full"
        sidebar={
          <nav aria-label="Main" className="h-full border-e border-border bg-card p-3">
            <Stack gap={1}>
              {['Dashboard', 'People', 'Finance', 'Reports', 'Settings'].map((item, i) => (
                <a
                  key={item}
                  href="#top"
                  className={`rounded-md px-3 py-2 text-sm ${
                    i === 1 ? 'bg-secondary font-medium' : 'text-muted-foreground hover:bg-accent'
                  }`}
                >
                  {item}
                </a>
              ))}
            </Stack>
          </nav>
        }
      >
        <Workspace
          header={
            <Container width="full" className="py-3">
              <PageHeader
                title="Students"
                description="All enrolled students."
                actions={<Button size="sm">Add student</Button>}
              />
            </Container>
          }
          footer={
            <Container width="full" className="py-2">
              <p className="text-xs text-muted-foreground">1–10 of 1,248</p>
            </Container>
          }
        >
          <Container width="full" className="py-4">
            <InspectorLayout inspector={<Panel title="Details">Select a record.</Panel>}>
              <Stack gap={4}>
                <Toolbar label="Student list actions" actions={<Button size="sm">Export</Button>}>
                  <Input aria-label="Search students" placeholder="Search…" className="max-w-xs" />
                </Toolbar>
                <Grid cols={{ base: 1, md: 2 }} gap={3}>
                  {Array.from({ length: 6 }, (_, i) => (
                    <Demo key={i}>record {i + 1}</Demo>
                  ))}
                </Grid>
              </Stack>
            </InspectorLayout>
          </Container>
        </Workspace>
      </SidebarLayout>
    </div>
  ),
};

/**
 * The separator is fully keyboard operable — Tab to it, then arrows to resize, Home/End for the
 * bounds, Enter to collapse and restore. A pointer-only resize handle is unusable for anyone who
 * does not use a pointer.
 */
export const Resizable: Story = {
  render: function ResizableStory() {
    const [size, setSize] = useState(35);
    return (
      <Container className="py-6">
        <Stack gap={3}>
          <p className="text-sm text-muted-foreground">
            Leading pane: <span className="font-mono">{Math.round(size)}%</span> — focus the
            separator and press the arrow keys.
          </p>
          <Surface className="h-72 overflow-hidden">
            <ResizablePanels
              className="h-full"
              label="Resize the list"
              size={size}
              onSizeChange={setSize}
              start={<div className="h-full bg-muted/40 p-4 text-sm">list</div>}
              end={<div className="h-full p-4 text-sm">detail</div>}
            />
          </Surface>
        </Stack>
      </Container>
    );
  },
};
