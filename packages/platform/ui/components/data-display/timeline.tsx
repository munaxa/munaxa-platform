import type { ReactNode } from 'react';
import { cn } from '../../lib/cn.js';

/**
 * Activity timeline (Munaxa DS Timeline / Activity-Feed pattern): an ordered list of
 * time-stamped entries with a marker rail. RTL-safe (logical border-s / padding-s).
 * Use for activity feeds and, once an audit API exists, record audit trails.
 */
export function Timeline({ className, children }: { className?: string; children: ReactNode }) {
  return <ol className={cn('flex flex-col', className)}>{children}</ol>;
}

export function TimelineItem({
  title,
  meta,
  timestamp,
  className,
}: {
  title: ReactNode;
  meta?: ReactNode;
  timestamp?: ReactNode;
  className?: string;
}) {
  return (
    <li
      className={cn(
        'relative flex items-start justify-between gap-3 border-s border-border ps-4 pb-3 last:pb-0',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="absolute -start-[5px] top-1 h-2.5 w-2.5 rounded-full border-2 border-background bg-primary"
      />
      <span className="min-w-0 text-sm">
        <span className="font-medium text-foreground">{title}</span>
        {meta ? <span className="text-muted-foreground"> · {meta}</span> : null}
      </span>
      {timestamp ? (
        <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{timestamp}</span>
      ) : null}
    </li>
  );
}
