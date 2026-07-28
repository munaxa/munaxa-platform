import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes } from 'react';
import { cn } from '../../lib/cn.js';

/**
 * Shared form-control surface used by Input, Select and Textarea — mirrors the Munaxa Design
 * System shadcn input: rounded-md, transparent bg, subtle shadow, 3px focus ring.
 */
export const fieldBase =
  'w-full rounded-md border border-input bg-transparent px-3 text-sm text-foreground shadow-sm ' +
  'outline-none transition-colors placeholder:text-muted-foreground ' +
  'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 ' +
  'disabled:cursor-not-allowed disabled:opacity-50 ' +
  'aria-[invalid=true]:border-destructive aria-[invalid=true]:focus-visible:ring-destructive/40';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn(fieldBase, 'h-9', className)} {...props} />;
  },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, ...props }, ref) {
    return <select ref={ref} className={cn(fieldBase, 'h-9', className)} {...props} />;
  },
);
