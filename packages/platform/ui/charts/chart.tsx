'use client';

import { useId, useRef, type ReactNode } from 'react';
import type { EChartsCoreOption } from 'echarts';
import { cn } from '../lib/cn.js';
import { Skeleton } from '../components/feedback/skeleton.js';
import { EmptyState } from '../components/feedback/empty-state.js';
import { useChart, type ChartRenderer } from './use-chart.js';

export interface ChartLabels {
  loading?: string;
  empty?: string;
  /** Heading for the visually-hidden table that carries the data to assistive technology. */
  dataTable?: string;
}

const DEFAULT_LABELS: Required<ChartLabels> = {
  loading: 'Loading chart…',
  empty: 'No data',
  dataTable: 'Chart data',
};

/** One row of the accessible fallback table. */
export interface ChartDataRow {
  label: string;
  values: Array<{ series: string; value: number | string | null }>;
}

export interface ChartProps {
  /** The ECharts option. Everything ECharts can draw is reachable through it. */
  option: EChartsCoreOption;
  /** Required. A chart with no accessible name is a blank region to a screen reader. */
  'aria-label': string;
  /** Longer explanation, associated with the chart region. */
  description?: string;
  height?: number | string;
  renderer?: ChartRenderer;
  loading?: boolean;
  /** Render the empty state instead of the chart. */
  empty?: boolean;
  emptyState?: ReactNode;
  merge?: boolean;
  /**
   * The data behind the chart, rendered as a visually-hidden table.
   *
   * This is the accessibility story, and it is not optional in an enterprise product. An SVG or
   * canvas chart is a picture: `aria-label` can say "revenue by month", but it cannot say what the
   * numbers *are*, and a summary is not equivalent access. A real table underneath is — it is
   * navigable cell by cell, it is what a screen-reader user would have asked for, and it is what a
   * regulator means by an equivalent alternative.
   */
  data?: ChartDataRow[];
  labels?: ChartLabels;
  className?: string;
}

/**
 * The base chart: an ECharts instance wrapped in the platform's theme, states and accessibility.
 *
 * Everything above this file is a convenience. `Chart` takes a raw ECharts option, so no wrapper
 * ever becomes a bottleneck — a product needing a sankey, a gauge or a custom series writes the
 * option and gets the theme, the resize handling, the loading state and the accessible table for
 * free rather than starting a second charting integration.
 *
 * **The division of labour.** The platform owns the wrapper, the theme, resizing, accessibility
 * and the states. The product owns the data, the query and what any of it means.
 */
export function Chart({
  option,
  description,
  height = 280,
  renderer = 'svg',
  loading = false,
  empty = false,
  emptyState,
  merge = false,
  data,
  labels,
  className,
  ...rest
}: ChartProps) {
  const text = { ...DEFAULT_LABELS, ...labels };
  const containerRef = useRef<HTMLDivElement>(null);
  const generatedId = useId();
  const descriptionId = description ? `${generatedId}-desc` : undefined;

  useChart({ containerRef, option, renderer, loading, merge });

  if (empty) {
    return (
      <div style={{ height }} className={cn('flex items-center justify-center', className)}>
        {emptyState ?? <EmptyState title={text.empty} />}
      </div>
    );
  }

  return (
    <figure className={cn('relative m-0', className)}>
      <div
        // `img` rather than a bare div: it tells assistive technology this is one indivisible
        // graphic, so the cursor does not wander into the SVG's hundreds of meaningless <path>
        // nodes looking for content that is not there. The real content is the table below.
        role="img"
        aria-label={rest['aria-label']}
        {...(descriptionId === undefined ? {} : { 'aria-describedby': descriptionId })}
        aria-busy={loading || undefined}
      >
        <div ref={containerRef} style={{ height }} className="w-full" />
        {loading ? (
          <div className="absolute inset-0 flex flex-col justify-end gap-2 p-4">
            <Skeleton className="h-2/3 w-full" />
            <span className="sr-only">{text.loading}</span>
          </div>
        ) : null}
      </div>

      {description ? (
        <figcaption id={descriptionId} className="mt-2 text-xs text-muted-foreground">
          {description}
        </figcaption>
      ) : null}

      {data && data.length > 0 ? <ChartDataTable caption={text.dataTable} data={data} /> : null}
    </figure>
  );
}

/** The chart's numbers as a real table, visually hidden but fully navigable. */
function ChartDataTable({ caption, data }: { caption: string; data: ChartDataRow[] }) {
  const series = data[0]?.values.map((value) => value.series) ?? [];
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>
          <th scope="col">—</th>
          {series.map((name) => (
            <th key={name} scope="col">
              {name}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.map((row) => (
          <tr key={row.label}>
            <th scope="row">{row.label}</th>
            {row.values.map((value) => (
              <td key={`${row.label}-${value.series}`}>{value.value ?? '—'}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
