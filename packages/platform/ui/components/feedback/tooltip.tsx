'use client';

import { forwardRef, type ComponentPropsWithoutRef, type ElementRef, type ReactNode } from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { cn } from '../../lib/cn.js';

/**
 * The tooltip's surface, sharing the overlay vocabulary of every other anchored layer.
 *
 * Not `overlaySurface` itself: a tooltip is much smaller and much lighter than a popover, and
 * giving it the popover's padding and radius would make a two-word hint look like a dialog.
 */
const tooltipSurface = cn(
  'z-popover max-w-64 rounded-md border border-border bg-card px-2 py-1 text-xs text-card-foreground shadow-card',
  'axa-overlay-motion origin-(--radix-tooltip-content-transform-origin)',
);

export const TooltipProvider = TooltipPrimitive.Provider;
export const TooltipRoot = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

export type TooltipContentProps = ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>;

export const TooltipContent = forwardRef<
  ElementRef<typeof TooltipPrimitive.Content>,
  TooltipContentProps
>(function TooltipContent({ className, sideOffset = 6, ...props }, ref) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        className={cn(tooltipSurface, className)}
        {...props}
      />
    </TooltipPrimitive.Portal>
  );
});

export interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  className?: string;
  /** Which side to prefer. Radix flips it when there is no room. */
  side?: TooltipContentProps['side'];
  /** Milliseconds of hover before it opens. */
  delay?: number;
}

/**
 * A short hint attached to a control.
 *
 * **The public API is unchanged** — `<Tooltip content={…}>{trigger}</Tooltip>` — and the
 * implementation underneath is now Radix rather than a hand-rolled hover state. That swap fixes
 * four things the previous version got wrong, none of which were visible in a screenshot:
 *
 * - **Collision handling.** The old one was pinned above the trigger with `left-1/2` and a
 *   translate, so a tooltip on a control near the top or the edge of the viewport was clipped.
 *   `left-1/2` is also a *physical* property, which in a right-to-left layout centred it against
 *   the wrong axis. Radix flips and shifts to stay on screen, and the transform origin follows.
 * - **Dismissal.** There was no way to close it but to move the pointer. Escape now closes it,
 *   which matters most to a keyboard user who opened it by tabbing onto the trigger.
 * - **The description was attached to the wrong element.** The old version wrapped children in a
 *   `<span>` carrying `aria-describedby`, so the description belonged to the wrapper rather than to
 *   the button a screen reader was actually on. `asChild` puts the wiring on the element itself.
 * - **Hover intent.** It opened instantly on every pass of the cursor, so dragging the mouse across
 *   a toolbar flashed every tooltip in turn. Radix delays the first and skips the delay for the
 *   rest of the group, which is what makes a dense toolbar usable.
 *
 * `TooltipProvider`, `TooltipRoot`, `TooltipTrigger` and `TooltipContent` are exported for what this
 * wrapper does not cover — one delay group across a whole toolbar, or a controlled open state. The
 * wrapper carries its own provider so the simple case stays zero-configuration.
 */
export function Tooltip({ content, children, className, side, delay = 300 }: TooltipProps) {
  return (
    <TooltipProvider delayDuration={delay}>
      <TooltipRoot>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent {...(side === undefined ? {} : { side })} className={className}>
          {content}
        </TooltipContent>
      </TooltipRoot>
    </TooltipProvider>
  );
}
