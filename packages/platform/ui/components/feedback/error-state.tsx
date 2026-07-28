import type { ReactNode } from 'react';
import { cn } from '../../lib/cn.js';

/**
 * Error-state pattern (Munaxa DS "Error States"): a contained, non-alarming message
 * with optional recovery action and reference id. Use for recoverable surface errors;
 * for inline form validation prefer Field's `error` prop. Never expose stack traces.
 */
export function ErrorState({
  title,
  description,
  action,
  referenceId,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  referenceId?: string;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-8 text-center',
        className,
      )}
    >
      <p className="text-sm font-medium text-destructive">{title}</p>
      {description ? <p className="max-w-sm text-sm text-muted-foreground">{description}</p> : null}
      {referenceId ? (
        <p className="font-mono text-xs text-muted-foreground">{referenceId}</p>
      ) : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
