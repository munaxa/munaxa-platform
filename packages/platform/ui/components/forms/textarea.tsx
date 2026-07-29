'use client';

import { forwardRef, type TextareaHTMLAttributes } from 'react';
import { cn } from '../../lib/cn.js';
import { fieldBase } from './input.js';
import { useFieldAria } from './field-context.js';

/**
 * Multi-line text control sharing the Input surface treatment, and the same `Field` wiring:
 * inside a `Field` it inherits the id, description, validity and disabled/read-only state.
 */
export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, rows = 4, ...props }, ref) {
  const aria = useFieldAria(props);
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={cn(fieldBase, 'py-2', className)}
      {...props}
      {...aria}
    />
  );
});
