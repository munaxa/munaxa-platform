'use client';

import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { cn } from '../../lib/cn.js';

/**
 * Floating panel anchored to a trigger.
 *
 * The interaction is Radix's, deliberately. Collision-aware positioning, focus movement in and out,
 * dismissal on Escape and outside-pointer-down, `aria-expanded`/`aria-controls` wiring and the
 * pointer-versus-keyboard intent handling are thousands of lines of subtlety that a hand-rolled
 * version gets wrong in ways only some users ever notice. The platform supplies the styling, the
 * theme and the motion tokens; the behaviour comes from a library that has already solved it.
 *
 * ```tsx
 * <Popover>
 *   <PopoverTrigger asChild><Button>Filters</Button></PopoverTrigger>
 *   <PopoverContent>…</PopoverContent>
 * </Popover>
 * ```
 */
export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;
export const PopoverClose = PopoverPrimitive.Close;

/**
 * Radix renders the panel as `role="dialog"`, and a dialog without an accessible name is a WCAG
 * failure — a screen reader announces "dialog" and nothing else. The type therefore requires one of
 * the two ways to give it a name, so an unnamed popover cannot compile.
 */
export type PopoverContentProps = ComponentPropsWithoutRef<typeof PopoverPrimitive.Content> &
  ({ 'aria-label': string } | { 'aria-labelledby': string });

/**
 * Shared surface for every anchored layer — popover, dropdown, context menu, hover card.
 *
 * `origin-(--radix-*-content-transform-origin)` makes the open animation grow from the trigger
 * rather than from the panel's own centre, which is what makes a flipped panel look intentional
 * instead of misplaced. `axa-overlay-motion` is defined in the theme contract, so a product gets
 * working overlays from its theme import alone — no separate animation package to install and
 * order correctly. Motion is dropped entirely under `prefers-reduced-motion`.
 */
export const overlaySurface = cn(
  'z-popover rounded-lg border border-border bg-popover p-4 text-popover-foreground shadow-card outline-none',
  'axa-overlay-motion',
);

export const PopoverContent = forwardRef<
  ElementRef<typeof PopoverPrimitive.Content>,
  PopoverContentProps
>(function PopoverContent({ className, align = 'center', sideOffset = 6, ...props }, ref) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        ref={ref}
        align={align}
        sideOffset={sideOffset}
        className={cn(
          overlaySurface,
          'w-72 origin-(--radix-popover-content-transform-origin)',
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
});
