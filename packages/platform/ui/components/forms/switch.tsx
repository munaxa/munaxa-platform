import { cn } from '../../lib/cn.js';
import { useFieldAria } from './field-context.js';

export interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  /** Accessible name; required when no visible label is wired via aria-labelledby. */
  'aria-label'?: string;
  'aria-labelledby'?: string;
  id?: string;
  className?: string;
}

/**
 * An accessible toggle (role="switch"). Controlled via `checked` / `onCheckedChange`.
 * RTL-safe: the thumb offset uses a logical transform that mirrors with `dir`.
 */
export function Switch({
  checked,
  onCheckedChange,
  disabled,
  className,
  id,
  ...aria
}: SwitchProps) {
  /*
   * Read the enclosing `Field` — Phase 8.15.
   *
   * `Field` renders `<label htmlFor={controlId}>` and publishes `controlId` through context.
   * `Input` and `Textarea` consumed it; this did not, so `<Field label="Value"><Switch /></Field>`
   * produced a label pointing at nothing and a `role="switch"` with **no accessible name** —
   * `button-name`, which axe rates **critical**. Measured on Munaxa Docs' `/admin/settings`: twelve
   * unnamed switches, in both themes.
   *
   * The asymmetry was the real defect. Two of the package's form controls honoured the labelling
   * contract and two ignored it, so the correct-looking composition silently produced an unusable
   * control — and a product that noticed had to wire `id`/`htmlFor` by hand at every call site.
   */
  const field = useFieldAria({
    ...(id === undefined ? {} : { id }),
    ...(disabled === undefined ? {} : { disabled }),
  });
  return (
    <button
      type="button"
      role="switch"
      {...(field.id === undefined ? {} : { id: field.id })}
      {...(field['aria-describedby'] === undefined
        ? {}
        : { 'aria-describedby': field['aria-describedby'] })}
      aria-checked={checked}
      disabled={field.disabled ?? disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-transparent transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'bg-primary' : 'bg-secondary',
        className,
      )}
      {...aria}
    >
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none inline-block h-5 w-5 rounded-full bg-background shadow transition-transform',
          checked ? 'translate-x-5 rtl:-translate-x-5' : 'translate-x-0.5 rtl:-translate-x-0.5',
        )}
      />
    </button>
  );
}
