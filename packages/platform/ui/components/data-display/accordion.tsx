'use client';

import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react';
import * as AccordionPrimitive from '@radix-ui/react-accordion';
import * as CollapsiblePrimitive from '@radix-ui/react-collapsible';
import { cn } from '../../lib/cn.js';
import { ChevronDown } from '../../../icons/index.js';

/**
 * Sections that expand and collapse, one or several at a time.
 *
 * Every trigger is a real `<button>` inside a heading, `aria-expanded` tracks the state and
 * `aria-controls` points at the panel — which is what lets a screen-reader user understand the
 * structure of a long settings page instead of walking through all of it. Radix handles the
 * roving focus and the arrow-key movement between headers.
 *
 * The open/close height animation reads Radix's `--radix-accordion-content-height` through the
 * `axa-collapse-motion` utility in the theme contract, and is removed under `prefers-reduced-motion`
 * rather than shortened — the end state is the same.
 */
export const Accordion = AccordionPrimitive.Root;

export const AccordionItem = forwardRef<
  ElementRef<typeof AccordionPrimitive.Item>,
  ComponentPropsWithoutRef<typeof AccordionPrimitive.Item>
>(function AccordionItem({ className, ...props }, ref) {
  return (
    <AccordionPrimitive.Item
      ref={ref}
      className={cn('border-b border-border', className)}
      {...props}
    />
  );
});

export const AccordionTrigger = forwardRef<
  ElementRef<typeof AccordionPrimitive.Trigger>,
  ComponentPropsWithoutRef<typeof AccordionPrimitive.Trigger> & {
    /** Heading level the trigger sits in. Match the surrounding outline. */
    level?: 2 | 3 | 4;
  }
>(function AccordionTrigger({ className, children, level = 3, ...props }, ref) {
  return (
    <AccordionPrimitive.Header asChild>
      {/* Radix renders `Header` as an h3 by default; the level has to follow the page's outline,
          so it is a prop rather than a fixed choice. */}
      <div role="heading" aria-level={level} className="flex">
        <AccordionPrimitive.Trigger
          ref={ref}
          className={cn(
            'flex flex-1 items-center justify-between gap-3 py-4 text-start text-sm font-medium',
            'transition-colors hover:text-primary-strong',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            '[&[data-state=open]>svg]:rotate-180',
            className,
          )}
          {...props}
        >
          {children}
          <ChevronDown
            className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none"
            aria-hidden="true"
          />
        </AccordionPrimitive.Trigger>
      </div>
    </AccordionPrimitive.Header>
  );
});

export const AccordionContent = forwardRef<
  ElementRef<typeof AccordionPrimitive.Content>,
  ComponentPropsWithoutRef<typeof AccordionPrimitive.Content>
>(function AccordionContent({ className, children, ...props }, ref) {
  return (
    <AccordionPrimitive.Content
      ref={ref}
      className={cn('overflow-hidden text-sm text-muted-foreground', 'axa-collapse-motion')}
      {...props}
    >
      <div className={cn('pb-4 pt-0', className)}>{children}</div>
    </AccordionPrimitive.Content>
  );
});

/**
 * A single show/hide region, without the accordion's grouping or arrow-key navigation.
 *
 * Reach for this when one thing expands — "show advanced options", a truncated description. Reach
 * for `Accordion` when several sections belong to one set and the user moves between them.
 */
export const Collapsible = CollapsiblePrimitive.Root;
export const CollapsibleTrigger = CollapsiblePrimitive.Trigger;

export const CollapsibleContent = forwardRef<
  ElementRef<typeof CollapsiblePrimitive.Content>,
  ComponentPropsWithoutRef<typeof CollapsiblePrimitive.Content>
>(function CollapsibleContent({ className, ...props }, ref) {
  return (
    <CollapsiblePrimitive.Content
      ref={ref}
      className={cn('overflow-hidden', 'axa-collapse-motion', className)}
      {...props}
    />
  );
});
