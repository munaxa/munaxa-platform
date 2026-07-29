import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { readChartTheme, toEChartsTheme } from './theme.js';
import { Chart } from './chart.js';
import { BarChart, LineChart, PieChart } from './wrappers.js';
import { Sparkline } from '../components/data-display/sparkline.js';
import { StatCard } from '../patterns/stat-card.js';
import { ChartCard, KpiGrid } from '../patterns/dashboard.js';
import { expectNoA11yViolations } from '../../test/setup.js';

/**
 * ECharts is stubbed rather than run.
 *
 * It measures a real layout box and rasterises into one — neither of which exists in happy-dom, so
 * running it here would test the DOM shim rather than this code. What is worth asserting is the
 * part the platform actually owns: that a theme is registered from the live custom properties, that
 * the instance is created once and disposed, that the option reaches it, and that the accessible
 * table beside the picture carries the numbers. The drawing itself is ECharts' own tested job.
 */
interface StubInstance {
  setOption: ReturnType<typeof vi.fn>;
  resize: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
  showLoading: ReturnType<typeof vi.fn>;
  hideLoading: ReturnType<typeof vi.fn>;
}

const echarts = vi.hoisted(() => ({
  init: vi.fn(),
  registerTheme: vi.fn(),
  instances: [] as StubInstance[],
}));

vi.mock('echarts', () => ({
  registerTheme: echarts.registerTheme,
  init: (...args: unknown[]) => {
    echarts.init(...args);
    const instance = {
      setOption: vi.fn(),
      resize: vi.fn(),
      dispose: vi.fn(),
      showLoading: vi.fn(),
      hideLoading: vi.fn(),
    };
    echarts.instances.push(instance);
    return instance;
  },
}));

const OPTION = { series: [{ type: 'line', data: [1, 2, 3] }] };

beforeEach(() => {
  echarts.init.mockClear();
  echarts.registerTheme.mockClear();
  echarts.instances.length = 0;
});

describe('chart theme', () => {
  it('reads the palette and the semantic roles off the element', () => {
    const element = document.createElement('div');
    element.style.setProperty('--chart-1', 'oklch(0.7 0.1 200)');
    element.style.setProperty('--chart-2', 'oklch(0.6 0.1 40)');
    element.style.setProperty('--muted-foreground', 'oklch(0.5 0 0)');
    document.body.append(element);

    const theme = readChartTheme(element);
    expect(theme.palette.slice(0, 2)).toEqual(['oklch(0.7 0.1 200)', 'oklch(0.6 0.1 40)']);
    expect(theme.mutedForeground).toBe('oklch(0.5 0 0)');
    element.remove();
  });

  it('invents no colours when a role is missing', () => {
    const theme = readChartTheme(document.createElement('div'));
    // Undefined roles are dropped from the palette rather than filled with a plausible grey.
    expect(theme.palette).toEqual([]);
    expect(theme.foreground).toBe('currentColor');
  });

  it('leaves the palette to ECharts when the theme supplies none', () => {
    expect(toEChartsTheme(readChartTheme(document.createElement('div')))).not.toHaveProperty(
      'color',
    );
  });

  it('maps the roles onto every axis kind', () => {
    const element = document.createElement('div');
    element.style.setProperty('--border', 'red');
    document.body.append(element);
    const theme = toEChartsTheme(readChartTheme(element)) as Record<
      string,
      { axisLine: { lineStyle: { color: string } } }
    >;
    for (const axis of ['categoryAxis', 'valueAxis', 'timeAxis', 'logAxis']) {
      expect(theme[axis]?.axisLine.lineStyle.color).toBe('red');
    }
    element.remove();
  });
});

describe('Chart', () => {
  it('names the graphic and hands the option to one instance', async () => {
    render(<Chart aria-label="Revenue by month" option={OPTION} />);
    expect(screen.getByRole('img', { name: 'Revenue by month' })).toBeInTheDocument();
    await waitFor(() => expect(echarts.instances).toHaveLength(1));
    expect(echarts.instances[0]?.setOption).toHaveBeenCalledWith(OPTION, { notMerge: true });
  });

  it('registers a theme built from the document before creating the instance', async () => {
    render(<Chart aria-label="Revenue" option={OPTION} />);
    await waitFor(() => expect(echarts.registerTheme).toHaveBeenCalled());
    const [, theme] = echarts.registerTheme.mock.calls[0] as [string, Record<string, unknown>];
    expect(theme).toHaveProperty('textStyle');
    expect(theme).toHaveProperty('tooltip');
  });

  it('disposes the instance on unmount', async () => {
    const { unmount } = render(<Chart aria-label="Revenue" option={OPTION} />);
    await waitFor(() => expect(echarts.instances).toHaveLength(1));
    const instance = echarts.instances[0];
    unmount();
    await waitFor(() => expect(instance?.dispose).toHaveBeenCalled());
  });

  it('shows and clears the loading state', async () => {
    const { rerender } = render(<Chart aria-label="Revenue" option={OPTION} loading />);
    await waitFor(() => expect(echarts.instances).toHaveLength(1));
    expect(screen.getByRole('img', { name: 'Revenue' })).toHaveAttribute('aria-busy', 'true');
    rerender(<Chart aria-label="Revenue" option={OPTION} />);
    await waitFor(() => expect(echarts.instances[0]?.hideLoading).toHaveBeenCalled());
  });

  it('renders the empty state instead of a chart', () => {
    render(<Chart aria-label="Revenue" option={OPTION} empty />);
    expect(screen.getByText('No data')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('carries the numbers in a real table beside the picture', () => {
    render(
      <Chart
        aria-label="Revenue"
        option={OPTION}
        data={[
          { label: 'January', values: [{ series: 'Revenue', value: 100 }] },
          { label: 'February', values: [{ series: 'Revenue', value: 140 }] },
        ]}
      />,
    );
    const table = screen.getByRole('table', { name: 'Chart data' });
    expect(table).toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: 'January' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '140' })).toBeInTheDocument();
  });

  it('associates a description with the graphic', () => {
    render(<Chart aria-label="Revenue" description="Excludes refunds." option={OPTION} />);
    expect(screen.getByRole('img', { name: 'Revenue' })).toHaveAccessibleDescription(
      'Excludes refunds.',
    );
  });

  it('has no accessibility violations', async () => {
    const { container } = render(
      <Chart
        aria-label="Revenue"
        option={OPTION}
        data={[{ label: 'January', values: [{ series: 'Revenue', value: 100 }] }]}
      />,
    );
    await expectNoA11yViolations(container);
  });
});

describe('chart wrappers', () => {
  const categories = ['Jan', 'Feb', 'Mar'];
  const series = [
    { name: 'Enrolled', data: [10, 20, 30] },
    { name: 'Left', data: [1, 2, 3] },
  ];

  async function optionFor(ui: React.ReactElement) {
    render(ui);
    await waitFor(() => expect(echarts.instances).toHaveLength(1));
    const instance = echarts.instances[0];
    if (!instance) throw new Error('no chart instance');
    return instance.setOption.mock.calls[0]?.[0] as unknown as {
      series: Array<Record<string, unknown>>;
      xAxis: Record<string, unknown>;
      yAxis: Record<string, unknown>;
      legend: { show: boolean };
    };
  }

  it('builds a line option and derives the accessible table from the same input', async () => {
    const option = await optionFor(
      <LineChart aria-label="Enrolment" categories={categories} series={series} />,
    );
    expect(option.series).toHaveLength(2);
    expect(option.series[0]).toMatchObject({ type: 'line', name: 'Enrolled' });
    expect(option.xAxis).toMatchObject({ type: 'category', data: categories });
    // Nobody had to pass `data` — it comes from the same categories and series.
    expect(screen.getByRole('rowheader', { name: 'Feb' })).toBeInTheDocument();
  });

  it('shows the legend only when there is more than one series', async () => {
    const many = await optionFor(
      <LineChart aria-label="A" categories={categories} series={series} />,
    );
    expect(many.legend.show).toBe(true);
    echarts.instances.length = 0;
    const one = await optionFor(
      <LineChart aria-label="B" categories={categories} series={[series[0]!]} />,
    );
    expect(one.legend.show).toBe(false);
  });

  it('stacks when asked', async () => {
    const option = await optionFor(
      <BarChart aria-label="Enrolment" categories={categories} series={series} stacked />,
    );
    expect(option.series[0]).toMatchObject({ stack: 'total' });
    expect(option.series[1]).toMatchObject({ stack: 'total' });
  });

  it('makes a horizontal bar chart by swapping the axes, not by changing type', async () => {
    const option = await optionFor(
      <BarChart aria-label="Enrolment" categories={categories} series={series} horizontal />,
    );
    expect(option.series[0]).toMatchObject({ type: 'bar' });
    expect(option.yAxis).toMatchObject({ type: 'category' });
    expect(option.xAxis).toMatchObject({ type: 'value' });
  });

  it('draws a reference line once, not once per series', async () => {
    const option = await optionFor(
      <LineChart
        aria-label="Enrolment"
        categories={categories}
        series={series}
        reference={{ value: 25, label: 'Target' }}
      />,
    );
    expect(option.series[0]).toHaveProperty('markLine');
    expect(option.series[1]).not.toHaveProperty('markLine');
  });

  it('renders a pie as a donut by default and tables its slices', async () => {
    const option = (await optionFor(
      <PieChart aria-label="Split" slices={[{ name: 'Science', value: 3 }]} />,
    )) as unknown as { series: Array<{ radius: unknown }> };
    expect(Array.isArray(option.series[0]?.radius)).toBe(true);
    expect(screen.getByRole('rowheader', { name: 'Science' })).toBeInTheDocument();
  });
});

describe('Sparkline', () => {
  it('is hidden from assistive technology unless it is given a name', () => {
    const { container, rerender } = render(<Sparkline values={[1, 4, 2, 8]} />);
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    rerender(<Sparkline values={[1, 4, 2, 8]} aria-label="Enrolment trend" />);
    expect(screen.getByRole('img', { name: 'Enrolment trend' })).toBeInTheDocument();
  });

  it('renders nothing for fewer than two points', () => {
    const { container } = render(<Sparkline values={[1]} />);
    expect(container.querySelector('svg')).toBeNull();
  });

  it('survives a flat series without dividing by zero', () => {
    const { container } = render(<Sparkline values={[5, 5, 5]} />);
    const points = container.querySelector('polyline')?.getAttribute('points') ?? '';
    expect(points).not.toContain('NaN');
    expect(points).not.toContain('Infinity');
  });
});

describe('StatCard', () => {
  it('colours a change by what it means, not by its direction', () => {
    const { container, rerender } = render(
      <StatCard label="Attendance" value="94%" delta={{ value: 3, goodWhen: 'up' }} />,
    );
    expect(container.querySelector('.text-success-strong')).not.toBeNull();

    // The same rise, on a metric where rising is bad, must not read as good news.
    rerender(<StatCard label="Absences" value="31" delta={{ value: 3, goodWhen: 'down' }} />);
    expect(container.querySelector('.text-destructive')).not.toBeNull();
    expect(container.querySelector('.text-success-strong')).toBeNull();
  });

  it('leaves a change uncoloured when nobody said which way is good', () => {
    const { container } = render(<StatCard label="Headcount" value="1,240" delta={{ value: 8 }} />);
    expect(container.querySelector('.text-success-strong')).toBeNull();
    expect(container.querySelector('.text-destructive')).toBeNull();
  });

  it('renders a trend without announcing it twice', () => {
    const { container } = render(
      <StatCard label="Enrolment" value="1,240" trend={[1, 3, 2, 6, 5, 9]} />,
    );
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('has no accessibility violations', async () => {
    const { container } = render(
      <StatCard
        label="Attendance"
        value="94%"
        delta={{ value: -2, goodWhen: 'up', comparison: 'vs last term' }}
        trend={[9, 8, 7, 8, 6]}
      />,
    );
    await expectNoA11yViolations(container);
  });
});

describe('dashboard primitives', () => {
  it('gives a chart card a real heading that names its region', () => {
    render(
      <ChartCard title="Revenue" description="Net of refunds">
        <div>chart</div>
      </ChartCard>,
    );
    expect(screen.getByRole('heading', { name: 'Revenue', level: 3 })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Revenue' })).toBeInTheDocument();
  });

  it('lays KPI tiles out two-up on a phone', () => {
    const { container } = render(
      <KpiGrid>
        <StatCard label="A" value="1" />
      </KpiGrid>,
    );
    expect(container.firstElementChild?.className).toContain('grid-cols-2');
  });

  it('has no accessibility violations', async () => {
    const { container } = render(
      <KpiGrid>
        <StatCard label="Students" value="1,240" delta={{ value: 12, goodWhen: 'up' }} />
        <ChartCard title="Enrolment" footnote="Updated hourly">
          <Sparkline values={[1, 2, 3, 4]} aria-label="Enrolment trend" />
        </ChartCard>
      </KpiGrid>,
    );
    await expectNoA11yViolations(container);
  });
});
