import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../../lib/cn.js';

const radioBase =
  'h-4 w-4 shrink-0 border-input text-primary-strong accent-primary ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 ' +
  'disabled:cursor-not-allowed disabled:opacity-50';

export interface RadioProps extends InputHTMLAttributes<HTMLInputElement> {
  /** When provided, renders an associated inline label around the control. */
  label?: ReactNode;
}

/** Native radio styled with design tokens. Group via a shared `name`. */
export const Radio = forwardRef<HTMLInputElement, RadioProps>(function Radio(
  { className, label, ...props },
  ref,
) {
  const input = <input ref={ref} type="radio" className={cn(radioBase, className)} {...props} />;
  if (label === undefined) return input;
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-foreground">
      {input}
      <span>{label}</span>
    </label>
  );
});

/** A semantic group wrapper for a set of Radio controls. */
export function RadioGroup({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('flex flex-col gap-2', className)}>
      {children}
    </div>
  );
}
