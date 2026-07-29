'use client';

import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes } from 'react';
import { cn } from '../../lib/cn.js';
import { useFieldAria } from './field-context.js';

/**
 * Shared form-control surface used by Input, Select and Textarea — rounded-md, transparent
 * background, subtle shadow, 3px focus ring, and a destructive border when `aria-invalid` is set.
 */
export const fieldBase =
  'w-full rounded-md border border-input bg-transparent px-3 text-sm text-foreground shadow-sm ' +
  'outline-none transition-colors placeholder:text-muted-foreground ' +
  'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 ' +
  'disabled:cursor-not-allowed disabled:opacity-50 ' +
  'read-only:bg-muted/40 ' +
  'aria-[invalid=true]:border-destructive aria-[invalid=true]:focus-visible:ring-destructive/40';

/**
 * Single-line text control.
 *
 * Inside a `Field` it inherits the field's id, `aria-describedby`, `aria-invalid`, `required`,
 * `disabled` and `readOnly`; standalone it behaves as a plain `<input>`. Props passed explicitly
 * always win over the field's values.
 */
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    const aria = useFieldAria(props);
    return <input ref={ref} className={cn(fieldBase, 'h-9', className)} {...props} {...aria} />;
  },
);

/** Native select sharing the Input surface, and the same `Field` wiring. */
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, ...props }, ref) {
    const aria = useFieldAria(props);
    return <select ref={ref} className={cn(fieldBase, 'h-9', className)} {...props} {...aria} />;
  },
);
