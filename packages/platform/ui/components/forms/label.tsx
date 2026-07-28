import type { LabelHTMLAttributes } from 'react';
import { cn } from '../../lib/cn.js';

/** Form label — block, medium-weight, with bottom spacing for stacked fields. */
export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn('mb-1.5 block text-sm font-medium text-foreground', className)}
      {...props}
    />
  );
}
