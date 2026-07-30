'use client';

import { useMemo } from 'react';
import type { EChartsCoreOption } from 'echarts';
import { Chart, type ChartDataRow, type ChartProps } from './chart.js';

/**
 * The four charts a business application actually draws.
 *
 * Wrappers rather than raw options because an ECharts option is a hundred lines of grid margins,
 * axis pointers and label rotation before it looks like anything, and every product writing that
 * for a bar chart would produce a dozen bar charts that are subtly different from each other. The
 * shape here is the one products think in — categories and named series — and the option is built
 * from it consistently.
 *
 * They compose `Chart` rather than reimplementing it, so the theme, resize handling, loading
 * state and accessible data table are inherited and not restated. Anything these do not cover
 * goes to `Chart` with a hand-written option; nobody is forced to widen this API to draw a gauge.
 */

/** What a caller passes in. */
export interface ChartSeries {
  name: string;
  data: Array<number | null>;
  /** Override the theme's palette slot for this series. */
  color?: string;
  /** Series sharing a stack id are stacked on top of each other. */
  stack?: string;
}

type BaseProps = Omit<ChartProps, 'option' | 'data'>;

export interface CartesianChartProps extends BaseProps {
  /** The x-axis labels. One per point in every series. */
  categories: string[];
  series: ChartSeries[];
  /** Turned on automatically for more than one series. */
  legend?: boolean;
  /** Format axis and tooltip values — a currency, a percentage. */
  valueFormatter?: (value: number) => string;
  /** Draw a horizontal reference line, e.g. a target. */
  reference?: { value: number; label?: string };
  stacked?: boolean;
}

/** Grid margins that leave room for labels without ECharts' default dead space. */
const GRID = { top: 24, right: 16, bottom: 8, left: 8, containLabel: true } as const;

function tooltip(
  valueFormatter: ((value: number) => string) | undefined,
  trigger: 'axis' | 'item',
) {
  return {
    trigger,
    ...(trigger === 'axis' ? { axisPointer: { type: 'shadow' as const } } : {}),
    ...(valueFormatter
      ? { valueFormatter: (value: unknown) => valueFormatter(Number(value)) }
      : {}),
  };
}

/** Build the accessible table straight from the same inputs — nobody has to remember to pass it. */
function toDataRows(categories: string[], series: ChartSeries[]): ChartDataRow[] {
  return categories.map((label, index) => ({
    label,
    values: series.map((entry) => ({ series: entry.name, value: entry.data[index] ?? null })),
  }));
}

function seriesCommon(entry: ChartSeries, stacked: boolean) {
  return {
    name: entry.name,
    data: entry.data,
    ...(entry.color ? { itemStyle: { color: entry.color } } : {}),
    // An explicit stack id wins; `stacked` is the shorthand for "all of them, together".
    ...((entry.stack ?? stacked) ? { stack: entry.stack ?? 'total' } : {}),
  };
}

function referenceLine(reference: CartesianChartProps['reference']) {
  if (!reference) return {};
  return {
    markLine: {
      silent: true,
      symbol: 'none',
      data: [{ yAxis: reference.value, ...(reference.label ? { name: reference.label } : {}) }],
      label: { formatter: reference.label ?? '{c}', position: 'insideEndTop' as const },
    },
  };
}

/** Only what the option builder needs — not the presentation props `Chart` handles. */
interface CartesianOptions {
  categories: string[];
  series: ChartSeries[];
  legend: boolean | undefined;
  valueFormatter: ((value: number) => string) | undefined;
  reference: CartesianChartProps['reference'];
  stacked: boolean;
  area?: boolean;
  smooth?: boolean;
  horizontal?: boolean;
}

function useCartesianOption(
  type: 'line' | 'bar',
  {
    categories,
    series,
    legend,
    valueFormatter,
    reference,
    stacked,
    area = false,
    smooth = false,
    horizontal = false,
  }: CartesianOptions,
): EChartsCoreOption {
  return useMemo(() => {
    const categoryAxis = {
      type: 'category' as const,
      data: categories,
      boundaryGap: type === 'bar',
    };
    const valueAxis = {
      type: 'value' as const,
      ...(valueFormatter
        ? { axisLabel: { formatter: (value: number) => valueFormatter(value) } }
        : {}),
    };

    return {
      grid: GRID,
      tooltip: tooltip(valueFormatter, 'axis'),
      legend: { show: legend ?? series.length > 1, top: 0 },
      // Swapping the axes is all "horizontal" means to ECharts — there is no separate chart type.
      xAxis: horizontal ? valueAxis : categoryAxis,
      yAxis: horizontal ? categoryAxis : valueAxis,
      series: series.map((entry, index) => ({
        type,
        ...seriesCommon(entry, stacked),
        ...(type === 'line'
          ? // Point markers stop being informative once they touch each other; past a screenful of
            // categories the line alone reads better.
            { smooth, showSymbol: categories.length <= 32 }
          : {}),
        ...(area ? { areaStyle: { opacity: 0.18 } } : {}),
        ...(type === 'bar' ? { barMaxWidth: 40 } : {}),
        ...(index === 0 ? referenceLine(reference) : {}),
      })),
    };
  }, [
    type,
    categories,
    series,
    legend,
    valueFormatter,
    reference,
    stacked,
    area,
    smooth,
    horizontal,
  ]);
}

export interface LineChartProps extends CartesianChartProps {
  smooth?: boolean;
  area?: boolean;
}

/** A trend over an ordered axis — the default choice for anything against time. */
export function LineChart({
  categories,
  series,
  legend,
  valueFormatter,
  reference,
  stacked = false,
  smooth = false,
  area = false,
  ...rest
}: LineChartProps) {
  const option = useCartesianOption('line', {
    categories,
    series,
    legend,
    valueFormatter,
    reference,
    stacked,
    smooth,
    area,
  });
  return <Chart {...rest} option={option} data={toDataRows(categories, series)} />;
}

/** A line chart with the area filled. Reads as a volume rather than a rate. */
export function AreaChart(props: Omit<LineChartProps, 'area'>) {
  return <LineChart {...props} area />;
}

export interface BarChartProps extends CartesianChartProps {
  /** Bars run along the x-axis. Right when the category labels are long. */
  horizontal?: boolean;
}

/** Comparison across categories. */
export function BarChart({
  categories,
  series,
  legend,
  valueFormatter,
  reference,
  stacked = false,
  horizontal = false,
  ...rest
}: BarChartProps) {
  const option = useCartesianOption('bar', {
    categories,
    series,
    legend,
    valueFormatter,
    reference,
    stacked,
    horizontal,
  });
  return <Chart {...rest} option={option} data={toDataRows(categories, series)} />;
}

export interface PieSlice {
  name: string;
  value: number;
  color?: string;
}

export interface PieChartProps extends BaseProps {
  slices: PieSlice[];
  /** Leave the middle open. Easier to read, and it leaves room for a total. */
  donut?: boolean;
  legend?: boolean;
  valueFormatter?: (value: number) => string;
}

/**
 * Composition of a whole.
 *
 * Donut by default: comparing angles is measurably harder than comparing arc lengths, and the open
 * centre also gives the total somewhere to live.
 */
export function PieChart({
  slices,
  donut = true,
  legend = true,
  valueFormatter,
  ...rest
}: PieChartProps) {
  const option = useMemo<EChartsCoreOption>(
    () => ({
      tooltip: tooltip(valueFormatter, 'item'),
      legend: { show: legend, bottom: 0, type: 'scroll' },
      series: [
        {
          type: 'pie',
          radius: donut ? ['58%', '80%'] : '80%',
          center: ['50%', legend ? '46%' : '50%'],
          // A slice too small to see is a slice too small to label; ECharts' default leader lines
          // make a crowded pie unreadable, so labels live in the tooltip and the legend.
          label: { show: false },
          labelLine: { show: false },
          data: slices.map((slice) => ({
            name: slice.name,
            value: slice.value,
            ...(slice.color ? { itemStyle: { color: slice.color } } : {}),
          })),
        },
      ],
    }),
    [slices, donut, legend, valueFormatter],
  );

  return (
    <Chart
      {...rest}
      option={option}
      data={slices.map((slice) => ({
        label: slice.name,
        values: [{ series: 'Value', value: slice.value }],
      }))}
    />
  );
}
