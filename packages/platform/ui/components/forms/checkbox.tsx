import { forwardRef, useCallback, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../../lib/cn.js';

const boxBase =
  'h-4 w-4 shrink-0 rounded border-input text-primary-strong accent-primary ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 ' +
  'disabled:cursor-not-allowed disabled:opacity-50';

export interface CheckboxProps extends InputHTMLAttributes<HTMLInputElement> {
  /** When provided, renders an associated inline label around the control. */
  label?: ReactNode;
  /**
   * The third state: some of what this checkbox covers is checked, but not all of it.
   *
   * A "select all" over a partly-selected list is the case that needs it, and the reason it is a
   * prop rather than something the caller sets by hand is that `indeterminate` is a DOM *property*
   * with no HTML attribute — React will not set it from JSX, so every call site that wants it has
   * to reach for a ref. Doing that once here also lets `aria-checked="mixed"` be set alongside it,
   * which is the half people forget and the half assistive technology actually reads.
   */
  indeterminate?: boolean;
}

/**
 * Native checkbox styled with design tokens. Pass `label` to get a built-in,
 * properly-associated label (preferred for accessibility); otherwise renders the
 * bare control for custom layouts.
 */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { className, label, indeterminate = false, ...props },
  ref,
) {
  const applyIndeterminate = useCallback(
    (node: HTMLInputElement | null) => {
      if (node) node.indeterminate = indeterminate;
      if (typeof ref === 'function') ref(node);
      else if (ref) ref.current = node;
    },
    [indeterminate, ref],
  );

  const input = (
    <input
      ref={applyIndeterminate}
      type="checkbox"
      className={cn(boxBase, className)}
      {...(indeterminate ? { 'aria-checked': 'mixed' as const } : {})}
      {...props}
    />
  );
  if (label === undefined) return input;
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-foreground">
      {input}
      <span>{label}</span>
    </label>
  );
});
