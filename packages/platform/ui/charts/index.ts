/**
 * Charting — Apache ECharts, wrapped in the platform's theme, states and accessibility.
 *
 * A separate entry point (`@axa/platform/charts`) because ECharts is large and most screens have
 * no chart on it. `Chart` also imports it lazily, so a page that renders one pays for it at that
 * point and a page that does not never loads it at all.
 *
 * **The division of labour, stated once.** The platform owns the wrapper, the theme, resize
 * handling, accessibility, and the loading and empty states. The product owns the data, the query,
 * the transformation and what any of it means. Nothing in here knows what a student or an invoice
 * is, and nothing in here should.
 */
export { Chart, type ChartProps, type ChartLabels, type ChartDataRow } from './chart.js';
export { useChart, type UseChartOptions, type ChartRenderer } from './use-chart.js';
export { readChartTheme, toEChartsTheme, type ChartTheme } from './theme.js';
export {
  LineChart,
  AreaChart,
  BarChart,
  PieChart,
  type ChartSeries,
  type CartesianChartProps,
  type LineChartProps,
  type BarChartProps,
  type PieChartProps,
  type PieSlice,
} from './wrappers.js';
