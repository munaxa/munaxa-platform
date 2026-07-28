import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../../lib/cn.js';

const boxBase =
  'h-4 w-4 shrink-0 rounded border-input text-primary accent-primary ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 ' +
  'disabled:cursor-not-allowed disabled:opacity-50';

export interface CheckboxProps extends InputHTMLAttributes<HTMLInputElement> {
  /** When provided, renders an associated inline label around the control. */
  label?: ReactNode;
}

/**
 * Native checkbox styled with design tokens. Pass `label` to get a built-in,
 * properly-associated label (preferred for accessibility); otherwise renders the
 * bare control for custom layouts.
 */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { className, label, ...props },
  ref,
) {
  const input = <input ref={ref} type="checkbox" className={cn(boxBase, className)} {...props} />;
  if (label === undefined) return input;
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-foreground">
      {input}
      <span>{label}</span>
    </label>
  );
});
