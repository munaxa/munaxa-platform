'use client';

import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react';
import * as SeparatorPrimitive from '@radix-ui/react-separator';
import * as ScrollAreaPrimitive from '@radix-ui/react-scroll-area';
import { cn } from '../../lib/cn.js';

/**
 * A dividing line.
 *
 * `decorative` defaults to true, and that is the right default: most rules are visual grouping the
 * surrounding markup already expresses, and announcing every one of them to a screen reader is
 * noise. Set `decorative={false}` only when the line is the *only* thing communicating a boundary.
 */
export const Separator = forwardRef<
  ElementRef<typeof SeparatorPrimitive.Root>,
  ComponentPropsWithoutRef<typeof SeparatorPrimitive.Root>
>(function Separator({ className, orientation = 'horizontal', decorative = true, ...props }, ref) {
  return (
    <SeparatorPrimitive.Root
      ref={ref}
      decorative={decorative}
      orientation={orientation}
      className={cn(
        'shrink-0 bg-border',
        orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
        className,
      )}
      {...props}
    />
  );
});

/**
 * A scrolling region with a styled scrollbar that behaves the same on every platform.
 *
 * Native overlay scrollbars are invisible until scrolled on macOS and touch, so a panel that
 * scrolls can look like it does not. This keeps the affordance visible while leaving real scrolling
 * intact — wheel, trackpad, keyboard and touch all work, because it styles the scrollbar rather
 * than reimplementing scrolling.
 */
export const ScrollArea = forwardRef<
  ElementRef<typeof ScrollAreaPrimitive.Root>,
  ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root> & {
    orientation?: 'vertical' | 'horizontal' | 'both';
  }
>(function ScrollArea({ className, children, orientation = 'vertical', ...props }, ref) {
  return (
    <ScrollAreaPrimitive.Root
      ref={ref}
      className={cn('relative overflow-hidden', className)}
      {...props}
    >
      {/*
       * The viewport is a Tab stop — Phase 8.12.
       *
       * A region that scrolls but cannot be focused is unreachable from the keyboard: a person
       * using arrow keys has nothing to put focus on, so whatever has overflowed is simply
       * unavailable to them. That is WCAG 2.1.1, and axe reports it as
       * `scrollable-region-focusable`.
       *
       * `tabIndex={0}` is the remedy the rule itself names. It adds one stop per scroll area, which
       * is redundant where the content already holds focusable controls and essential where it does
       * not — and the harmless case is much cheaper than the unreachable one.
       */}
      <ScrollAreaPrimitive.Viewport tabIndex={0} className="size-full rounded-[inherit]">
        {children}
      </ScrollAreaPrimitive.Viewport>
      {orientation !== 'horizontal' ? <ScrollBar orientation="vertical" /> : null}
      {orientation !== 'vertical' ? <ScrollBar orientation="horizontal" /> : null}
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  );
});

export const ScrollBar = forwardRef<
  ElementRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>,
  ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>
>(function ScrollBar({ className, orientation = 'vertical', ...props }, ref) {
  return (
    <ScrollAreaPrimitive.ScrollAreaScrollbar
      ref={ref}
      orientation={orientation}
      className={cn(
        'flex touch-none select-none transition-colors',
        orientation === 'vertical'
          ? 'h-full w-2 border-s border-s-transparent p-px'
          : 'h-2 flex-col border-t border-t-transparent p-px',
        className,
      )}
      {...props}
    >
      <ScrollAreaPrimitive.ScrollAreaThumb className="relative flex-1 rounded-full bg-border" />
    </ScrollAreaPrimitive.ScrollAreaScrollbar>
  );
});
