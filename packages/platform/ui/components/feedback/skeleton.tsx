import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '../../lib/cn.js';

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  /** Convenience shapes for the two cases that come up constantly. */
  shape?: 'block' | 'text' | 'circle';
  /** Number of stacked lines. `shape="text"` only. */
  lines?: number;
}

/**
 * A placeholder for content that has not arrived.
 *
 * It is `aria-hidden` and carries no live region: a screen reader should hear the loading state
 * once, from whatever owns the request, not a stream of announcements from every shimmering box.
 * Give the region an `aria-busy` and a single status message; the skeleton is purely visual.
 *
 * The pulse respects `prefers-reduced-motion` — an indefinitely animating page is a genuine
 * problem for vestibular disorders, and the placeholder reads perfectly well without it.
 */
export const Skeleton = forwardRef<HTMLDivElement, SkeletonProps>(function Skeleton(
  { shape = 'block', lines = 3, className, ...props },
  ref,
) {
  const base = 'animate-pulse bg-muted motion-reduce:animate-none';

  if (shape === 'text') {
    return (
      <div ref={ref} aria-hidden="true" className={cn('space-y-2', className)} {...props}>
        {Array.from({ length: lines }, (_, i) => (
          <div
            key={i}
            className={cn(
              base,
              'h-4 rounded-md',
              // A ragged last line reads as a paragraph rather than a block.
              i === lines - 1 && lines > 1 ? 'w-2/3' : 'w-full',
            )}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className={cn(base, shape === 'circle' ? 'rounded-full' : 'rounded-md', className)}
      {...props}
    />
  );
});
