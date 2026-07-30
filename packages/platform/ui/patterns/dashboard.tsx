import { useId, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '../lib/cn.js';
import { Grid, type GridProps } from '../layouts/grid.js';
import { Card, CardContent, CardHeader } from '../components/layout/card.js';

/**
 * The two shapes every dashboard is made of.
 *
 * Both are compositions of primitives that already exist — `Grid`, `Card` — and they earn their
 * place by fixing the *decisions*, not by adding anything: how many KPI tiles fit at each
 * breakpoint, and where a chart's title, its controls and its footnote go. Those get re-decided on
 * every dashboard otherwise, slightly differently each time, and a dashboard whose cards do not
 * line up reads as unfinished however good the individual pieces are.
 */

export interface KpiGridProps extends Omit<GridProps, 'cols'> {
  /** Override the responsive column count. The default suits three to six tiles. */
  cols?: GridProps['cols'];
}

/**
 * The strip of KPI tiles across the top of a dashboard.
 *
 * Two columns on a phone rather than one, because a KPI tile is short and a single column turns
 * five of them into a scroll before the user has seen anything else.
 */
export function KpiGrid({ cols, gap = 4, className, ...props }: KpiGridProps) {
  return (
    <Grid cols={cols ?? { base: 2, md: 3, xl: 5 }} gap={gap} className={cn(className)} {...props} />
  );
}

export interface ChartCardProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  title: ReactNode;
  description?: ReactNode;
  /** Controls for this chart — a range picker, a series toggle, an export button. */
  actions?: ReactNode;
  /** Source, caveat or last-updated note. */
  footnote?: ReactNode;
  children: ReactNode;
}

/**
 * A chart with its title, its controls and its caveat in fixed places.
 *
 * `<section>` with a real heading, not a styled div: a dashboard is a page of a dozen panels, and
 * without headings a screen reader user has no way to move between them or to know which chart
 * they have landed in. The heading is the navigation.
 */
export function ChartCard({
  title,
  description,
  actions,
  footnote,
  children,
  className,
  ...props
}: ChartCardProps) {
  const headingId = useId();
  return (
    <Card className={cn('flex flex-col', className)}>
      <section aria-labelledby={headingId} className="flex flex-1 flex-col" {...props}>
        <CardHeader className="flex-row items-start justify-between gap-4 p-4 pb-2">
          <div className="flex min-w-0 flex-col gap-1">
            <h3 id={headingId} className="font-display text-sm font-semibold leading-none">
              {title}
            </h3>
            {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </CardHeader>
        <CardContent className="flex-1 p-4 pt-0">{children}</CardContent>
        {footnote ? <p className="px-4 pb-4 text-xs text-muted-foreground">{footnote}</p> : null}
      </section>
    </Card>
  );
}
