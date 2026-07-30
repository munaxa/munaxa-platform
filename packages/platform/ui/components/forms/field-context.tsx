'use client';

import { createContext, useContext } from 'react';

/**
 * What a `Field` tells the control inside it.
 *
 * The problem this solves: a field renders a label, a hint and a validation message, but the
 * control is a child it does not own, so nothing wires `aria-describedby` or `aria-invalid` onto
 * it. The result is a form that looks correct and reads wrong — a screen-reader user hears the
 * label and never hears why the field was rejected.
 *
 * Passing the ids through context rather than cloning children keeps every existing call site
 * working untouched: a control that does not read the context behaves exactly as it did before,
 * and one that does picks the wiring up automatically.
 */
export interface FieldContextValue {
  /** Id the control should carry, so the label's `htmlFor` resolves. */
  controlId: string;
  /** Ids of the description and error nodes, ready for `aria-describedby`. */
  describedBy: string | undefined;
  invalid: boolean;
  required: boolean;
  disabled: boolean;
  readOnly: boolean;
}

const FieldContext = createContext<FieldContextValue | null>(null);

export const FieldProvider = FieldContext.Provider;

/**
 * Read the enclosing `Field`, if there is one.
 *
 * Returns `null` outside a field rather than throwing: platform controls are usable standalone,
 * and a control that demanded a `Field` wrapper would be a breaking change for every existing use.
 */
export function useFieldContext(): FieldContextValue | null {
  return useContext(FieldContext);
}

/**
 * The ARIA a control should apply, merging what the field knows with what the caller passed.
 *
 * An explicit prop always wins — a caller who writes `aria-invalid` or `aria-describedby` by hand
 * means it. Where both the field and the caller supply `aria-describedby` the two are concatenated,
 * because a control can legitimately be described by its field's hint *and* by something else.
 */
export function useFieldAria(explicit: {
  id?: string | undefined;
  'aria-describedby'?: string | undefined;
  'aria-invalid'?: boolean | 'true' | 'false' | 'grammar' | 'spelling' | undefined;
  required?: boolean | undefined;
  disabled?: boolean | undefined;
  readOnly?: boolean | undefined;
}): {
  id?: string | undefined;
  'aria-describedby'?: string | undefined;
  'aria-invalid'?: boolean | 'true' | 'grammar' | 'spelling' | undefined;
  required?: boolean | undefined;
  disabled?: boolean | undefined;
  readOnly?: boolean | undefined;
} {
  const field = useFieldContext();
  if (!field) {
    return {
      ...(explicit.id === undefined ? {} : { id: explicit.id }),
      ...(explicit['aria-describedby'] === undefined
        ? {}
        : { 'aria-describedby': explicit['aria-describedby'] }),
      ...(explicit['aria-invalid'] === undefined ||
      explicit['aria-invalid'] === false ||
      explicit['aria-invalid'] === 'false'
        ? {}
        : { 'aria-invalid': explicit['aria-invalid'] }),
      ...(explicit.required === undefined ? {} : { required: explicit.required }),
      ...(explicit.disabled === undefined ? {} : { disabled: explicit.disabled }),
      ...(explicit.readOnly === undefined ? {} : { readOnly: explicit.readOnly }),
    };
  }

  const describedBy = [field.describedBy, explicit['aria-describedby']]
    .filter((value): value is string => Boolean(value))
    .join(' ');

  const invalid = explicit['aria-invalid'] ?? field.invalid;
  const required = explicit.required ?? field.required;
  const disabled = explicit.disabled ?? field.disabled;
  const readOnly = explicit.readOnly ?? field.readOnly;

  return {
    id: explicit.id ?? field.controlId,
    ...(describedBy ? { 'aria-describedby': describedBy } : {}),
    // `grammar` and `spelling` are meaningful values in their own right, so pass them through
    // rather than flattening every truthy value to `true`.
    ...(invalid && invalid !== 'false' ? { 'aria-invalid': invalid } : {}),
    ...(required ? { required: true } : {}),
    ...(disabled ? { disabled: true } : {}),
    ...(readOnly ? { readOnly: true } : {}),
  };
}
