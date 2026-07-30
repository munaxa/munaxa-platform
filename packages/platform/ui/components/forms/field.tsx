'use client';

import { useId, useMemo, type ReactNode } from 'react';
import { cn } from '../../lib/cn.js';
import { FieldProvider, type FieldContextValue } from './field-context.js';

export interface FieldProps {
  label: string;
  /** Id of the control. Omit it and the field generates one and hands it to the control. */
  htmlFor?: string;
  /** Guidance shown below the control while the field is valid. */
  hint?: string;
  /** Longer supporting copy, shown above the control rather than below it. */
  description?: string;
  /** Validation message. Replaces the hint and marks the control invalid. */
  error?: string;
  required?: boolean;
  /** Explicit "optional" marker — useful on forms where most fields are required. */
  optionalLabel?: string;
  disabled?: boolean;
  readOnly?: boolean;
  className?: string;
  children: ReactNode;
}

/**
 * A labelled form field: label, optional description, the control, and either a hint or a
 * validation message.
 *
 * The field also publishes its state through context, so the control inside picks up
 * `aria-describedby`, `aria-invalid`, `required`, `disabled` and `readOnly` without the caller
 * repeating them. Before that, a field could render an error that was never associated with the
 * control, and a screen-reader user would hear the label but never the reason the value was
 * rejected.
 *
 * Nothing about the existing API changed: `label` / `htmlFor` / `hint` / `error` / `required`
 * behave exactly as before, an explicit `htmlFor` still wins over the generated id, and a control
 * that ignores the context is unaffected.
 */
export function Field({
  label,
  htmlFor,
  hint,
  description,
  error,
  required,
  optionalLabel,
  disabled,
  readOnly,
  className,
  children,
}: FieldProps) {
  const generatedId = useId();
  const controlId = htmlFor ?? generatedId;
  const descriptionId = `${controlId}-description`;
  const hintId = `${controlId}-hint`;
  const errorId = `${controlId}-error`;

  const context = useMemo<FieldContextValue>(() => {
    // The error replaces the hint, so only one of the two is ever referenced.
    const ids = [description ? descriptionId : null, error ? errorId : hint ? hintId : null].filter(
      (value): value is string => value !== null,
    );
    return {
      controlId,
      describedBy: ids.length > 0 ? ids.join(' ') : undefined,
      invalid: Boolean(error),
      required: Boolean(required),
      disabled: Boolean(disabled),
      readOnly: Boolean(readOnly),
    };
  }, [
    controlId,
    description,
    descriptionId,
    error,
    errorId,
    hint,
    hintId,
    required,
    disabled,
    readOnly,
  ]);

  return (
    <FieldProvider value={context}>
      <div className={cn('space-y-1.5', className)}>
        <label
          htmlFor={controlId}
          className="font-mono text-xs uppercase tracking-wide text-muted-foreground"
        >
          {label}
          {required ? (
            // Decorative: requiredness reaches assistive technology through the control's
            // `required` attribute, so the marker must not be announced as "star".
            <span className="text-destructive" aria-hidden="true">
              {' '}
              *
            </span>
          ) : optionalLabel ? (
            <span className="text-muted-foreground/70"> ({optionalLabel})</span>
          ) : null}
        </label>

        {description ? (
          <p id={descriptionId} className="text-xs text-muted-foreground">
            {description}
          </p>
        ) : null}

        {children}

        {error ? (
          <p id={errorId} role="alert" className="text-xs text-destructive">
            {error}
          </p>
        ) : hint ? (
          <p id={hintId} className="text-xs text-muted-foreground">
            {hint}
          </p>
        ) : null}
      </div>
    </FieldProvider>
  );
}
