'use client';

import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react';
import * as HoverCardPrimitive from '@radix-ui/react-hover-card';
import { cn } from '../../lib/cn.js';
import { overlaySurface } from './popover.js';

/**
 * A preview panel shown when a pointer rests on a trigger.
 *
 * It is **supplementary by definition**: it opens on hover and on keyboard focus, but it holds no
 * focusable content the user must reach, because there is no reliable way for a touch or
 * keyboard-only user to enter a panel that exists only while hovered. Anything actionable belongs
 * in a `Popover`, which opens on click and moves focus.
 *
 * Use it for a preview of something the user can already reach another way — a person behind a
 * name, a record behind a reference.
 */
export const HoverCard = HoverCardPrimitive.Root;
export const HoverCardTrigger = HoverCardPrimitive.Trigger;

export const HoverCardContent = forwardRef<
  ElementRef<typeof HoverCardPrimitive.Content>,
  ComponentPropsWithoutRef<typeof HoverCardPrimitive.Content>
>(function HoverCardContent({ className, align = 'center', sideOffset = 6, ...props }, ref) {
  return (
    <HoverCardPrimitive.Portal>
      <HoverCardPrimitive.Content
        ref={ref}
        align={align}
        sideOffset={sideOffset}
        className={cn(
          overlaySurface,
          'w-64 origin-(--radix-hover-card-content-transform-origin)',
          className,
        )}
        {...props}
      />
    </HoverCardPrimitive.Portal>
  );
});
