import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Stack, Inline, Cluster } from './stack.js';
import { Container } from './container.js';
import { Grid } from './grid.js';
import { Center, Cover } from './center.js';
import { Surface } from './surface.js';
import { Page, PageHeader, Section } from './page.js';
import { Split, SidebarLayout, InspectorLayout } from './split.js';
import { Panel, Toolbar } from './panel.js';
import { Workspace } from './workspace.js';
import { expectNoA11yViolations } from '../../test/setup.js';

describe('Stack', () => {
  it('flows vertically by default and horizontally on request', () => {
    const { container, rerender } = render(<Stack data-testid="s">x</Stack>);
    expect(container.firstElementChild).toHaveClass('flex', 'flex-col');
    rerender(
      <Stack direction="horizontal" data-testid="s">
        x
      </Stack>,
    );
    expect(container.firstElementChild).toHaveClass('flex-row');
  });

  it('maps every gap step to a real Tailwind class', () => {
    // Assembled class names are never emitted by Tailwind, so the map has to be literal.
    const steps = [0, 1, 2, 3, 4, 6, 8, 12, 16, 20, 24] as const;
    for (const gap of steps) {
      const { container, unmount } = render(<Stack gap={gap}>x</Stack>);
      expect(container.firstElementChild).toHaveClass(`gap-${gap}`);
      unmount();
    }
  });

  it('applies alignment and justification', () => {
    const { container } = render(
      <Stack align="center" justify="between">
        x
      </Stack>,
    );
    expect(container.firstElementChild).toHaveClass('items-center', 'justify-between');
  });

  it('renders as another element when asked', () => {
    render(
      <Stack as="ul">
        <li>one</li>
      </Stack>,
    );
    expect(screen.getByRole('list')).toBeInTheDocument();
  });

  it('merges className instead of replacing layout classes', () => {
    const { container } = render(<Stack className="mt-4">x</Stack>);
    expect(container.firstElementChild).toHaveClass('flex', 'mt-4');
  });

  it('Inline and Cluster are horizontal and wrapping', () => {
    const { container: a } = render(<Inline>x</Inline>);
    expect(a.firstElementChild).toHaveClass('flex-row', 'flex-wrap');
    const { container: b } = render(<Cluster>x</Cluster>);
    expect(b.firstElementChild).toHaveClass('flex-row', 'flex-wrap');
  });
});

describe('Container', () => {
  it('centres, caps the measure and applies a gutter', () => {
    const { container } = render(<Container>x</Container>);
    expect(container.firstElementChild).toHaveClass('mx-auto', 'w-full', 'max-w-6xl', 'px-4');
  });

  it('drops the gutter when flush', () => {
    const { container } = render(<Container flush>x</Container>);
    expect(container.firstElementChild).not.toHaveClass('px-4');
  });

  it('exposes named widths rather than raw max-w values', () => {
    const { container } = render(<Container width="prose">x</Container>);
    expect(container.firstElementChild).toHaveClass('max-w-2xl');
  });
});

describe('Grid', () => {
  it('accepts a plain column count', () => {
    const { container } = render(<Grid cols={3}>x</Grid>);
    expect(container.firstElementChild).toHaveClass('grid', 'grid-cols-3');
  });

  it('resolves a responsive column map, mobile-first', () => {
    const { container } = render(<Grid cols={{ base: 1, md: 2, xl: 4 }}>x</Grid>);
    const el = container.firstElementChild;
    expect(el).toHaveClass('grid-cols-1', 'md:grid-cols-2', 'xl:grid-cols-4');
  });

  it('lets one axis override the shared gap without losing the other', () => {
    const { container } = render(
      <Grid gap={4} gapY={2}>
        x
      </Grid>,
    );
    expect(container.firstElementChild).toHaveClass('gap-x-4', 'gap-y-2');
    expect(container.firstElementChild).not.toHaveClass('gap-4');
  });
});

describe('Center and Cover', () => {
  it('centres on one axis by default and both on request', () => {
    const { container, rerender } = render(<Center>x</Center>);
    expect(container.firstElementChild).toHaveClass('items-center');
    expect(container.firstElementChild).not.toHaveClass('justify-center');
    rerender(<Center axis="both">x</Center>);
    expect(container.firstElementChild).toHaveClass('justify-center');
  });

  it('Cover fills and centres', () => {
    const { container } = render(<Cover minHeight="screen">x</Cover>);
    expect(container.firstElementChild).toHaveClass('min-h-screen', 'justify-center');
  });
});

describe('Surface', () => {
  it('is a bordered themed surface by default', () => {
    const { container } = render(<Surface>x</Surface>);
    expect(container.firstElementChild).toHaveClass('bg-card', 'border', 'border-border');
  });

  it('drops the border and applies elevation and padding on request', () => {
    const { container } = render(
      <Surface bordered={false} elevation="md" padding={6} tone="muted">
        x
      </Surface>,
    );
    const el = container.firstElementChild;
    expect(el).not.toHaveClass('border');
    expect(el).toHaveClass('shadow-md', 'p-6', 'bg-muted');
  });

  it('uses only theme classes — never a literal colour', () => {
    const { container } = render(<Surface>x</Surface>);
    expect(container.innerHTML).not.toMatch(/#[0-9a-fA-F]{3,8}/);
  });
});

describe('Page, PageHeader and Section', () => {
  it('Page wraps content in a container with a single rhythm', () => {
    render(<Page>content</Page>);
    expect(screen.getByText('content')).toBeInTheDocument();
  });

  it('PageHeader renders one h1 by default and can drop to h2', () => {
    const { rerender } = render(<PageHeader title="Students" />);
    expect(screen.getByRole('heading', { level: 1, name: 'Students' })).toBeInTheDocument();
    rerender(<PageHeader title="Students" level="h2" />);
    expect(screen.getByRole('heading', { level: 2, name: 'Students' })).toBeInTheDocument();
  });

  it('PageHeader renders description and actions when given', () => {
    render(
      <PageHeader
        title="Students"
        description="All enrolled students."
        actions={<button type="button">Add</button>}
      />,
    );
    expect(screen.getByText('All enrolled students.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
  });

  it('PageHeader aligns the actions against the title, or centres them on request', () => {
    // `start` lines the actions up with the title rather than the middle of a two-line block.
    const { container, rerender } = render(
      <PageHeader title="Students" actions={<button type="button">Add</button>} />,
    );
    const row = () => container.querySelector('header > div') as HTMLElement;
    expect(row().className).toContain('items-start');

    rerender(
      <PageHeader title="Students" align="center" actions={<button type="button">Add</button>} />,
    );
    expect(row().className).toContain('items-center');
    expect(row().className).not.toContain('items-start');
  });

  it('PageHeader always wraps, so actions reflow instead of overflowing', () => {
    // Not configurable: a header whose actions run off a narrow viewport is a defect, not a style.
    const { container } = render(
      <PageHeader title="Students" align="center" actions={<button type="button">Add</button>} />,
    );
    expect((container.querySelector('header > div') as HTMLElement).className).toContain(
      'flex-wrap',
    );
  });

  it('Section is a labelled region only when it has a title', () => {
    const { rerender } = render(<Section title="Summary">body</Section>);
    expect(screen.getByRole('region', { name: 'Summary' })).toBeInTheDocument();
    rerender(<Section>body</Section>);
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });

  it('Section labels itself with a generated id, not the title text', () => {
    render(
      <>
        <Section title="Details">a</Section>
        <Section title="Details">b</Section>
      </>,
    );
    const [first, second] = screen.getAllByRole('region');
    expect(first?.getAttribute('aria-labelledby')).not.toBe(
      second?.getAttribute('aria-labelledby'),
    );
  });
});

describe('Split, SidebarLayout and InspectorLayout', () => {
  it('Split renders both panes in source order', () => {
    render(<Split start={<div>lead</div>} end={<div>trail</div>} />);
    const html = document.body.innerHTML;
    expect(html.indexOf('lead')).toBeLessThan(html.indexOf('trail'));
  });

  it('SidebarLayout hides the sidebar below the collapse breakpoint', () => {
    const { container } = render(
      <SidebarLayout sidebar={<nav aria-label="Main">nav</nav>} collapseBelow="lg">
        body
      </SidebarLayout>,
    );
    expect(container.querySelector('.hidden')).toHaveClass('lg:block');
  });

  it('SidebarLayout gives the content column min-w-0 so wide tables scroll', () => {
    const { container } = render(<SidebarLayout sidebar={<nav>n</nav>}>body</SidebarLayout>);
    expect(container.querySelector('.min-w-0')).toBeInTheDocument();
  });

  it('InspectorLayout renders the inspector after the content, as a complementary region', () => {
    render(<InspectorLayout inspector={<div>panel</div>}>main content</InspectorLayout>);
    const aside = document.querySelector('aside');
    expect(aside).toHaveTextContent('panel');
    const html = document.body.innerHTML;
    expect(html.indexOf('main content')).toBeLessThan(html.indexOf('panel'));
  });

  it('InspectorLayout renders content full width when no inspector is given', () => {
    render(<InspectorLayout>main content</InspectorLayout>);
    expect(document.querySelector('aside')).toBeNull();
  });
});

describe('Panel and Toolbar', () => {
  it('Panel is a labelled region when it has a title', () => {
    render(<Panel title="Filters">body</Panel>);
    expect(screen.getByRole('region', { name: 'Filters' })).toBeInTheDocument();
  });

  it('Panel renders header actions and a footer', () => {
    render(
      <Panel
        title="Filters"
        actions={<button type="button">Reset</button>}
        footer={<span>3 active</span>}
      >
        body
      </Panel>,
    );
    expect(screen.getByRole('button', { name: 'Reset' })).toBeInTheDocument();
    expect(screen.getByText('3 active')).toBeInTheDocument();
  });

  it('Toolbar is a labelled group, not a role=toolbar single tab stop', () => {
    render(
      <Toolbar label="Student list actions">
        <input aria-label="Search" />
      </Toolbar>,
    );
    const group = screen.getByRole('group', { name: 'Student list actions' });
    expect(group).toBeInTheDocument();
    expect(group).not.toHaveAttribute('role', 'toolbar');
  });
});

describe('Workspace', () => {
  it('exposes the scrolling body as the main landmark', () => {
    render(<Workspace header={<div>chrome</div>}>content</Workspace>);
    expect(screen.getByRole('main')).toHaveTextContent('content');
  });

  it('omits header and footer chrome when not supplied', () => {
    const { container } = render(<Workspace>content</Workspace>);
    expect(container.querySelectorAll('.border-b')).toHaveLength(0);
    expect(container.querySelectorAll('.border-t')).toHaveLength(0);
  });
});

describe('accessibility', () => {
  it('a composed page has no violations', async () => {
    const { container } = render(
      <Page>
        <PageHeader
          title="Students"
          description="All enrolled students."
          actions={<button type="button">Add student</button>}
        />
        <Toolbar label="List actions">
          <input aria-label="Search students" />
        </Toolbar>
        <Section title="Overview">
          <Grid cols={{ base: 1, md: 3 }}>
            <Surface padding={4}>one</Surface>
            <Surface padding={4}>two</Surface>
            <Surface padding={4}>three</Surface>
          </Grid>
        </Section>
        <InspectorLayout inspector={<Panel title="Details">details</Panel>}>
          <Panel title="Records">records</Panel>
        </InspectorLayout>
      </Page>,
    );
    await expectNoA11yViolations(container);
  });
});
