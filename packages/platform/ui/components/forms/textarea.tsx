import { forwardRef, type TextareaHTMLAttributes } from 'react';
import { cn } from '../../lib/cn.js';
import { fieldBase } from './input.js';

/** Multi-line text control sharing the Input/Select surface treatment. */
export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, rows = 4, ...props }, ref) {
  return <textarea ref={ref} rows={rows} className={cn(fieldBase, 'py-2', className)} {...props} />;
});
