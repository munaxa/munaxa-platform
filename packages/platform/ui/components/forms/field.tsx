import type { ReactNode } from 'react';
import { cn } from '../../lib/cn.js';

/**
 * A labelled form field. The label uses the design system's mono micro-label treatment.
 * `error` (optional) renders an assertive validation message; `required` adds a marker.
 * Backward compatible: existing `label`/`htmlFor`/`hint` usage is unchanged.
 */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  className,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label
        htmlFor={htmlFor}
        className="font-mono text-xs uppercase tracking-wide text-muted-foreground"
      >
        {label}
        {required ? (
          <span className="text-destructive" aria-hidden="true">
            {' '}
            *
          </span>
        ) : null}
      </label>
      {children}
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
