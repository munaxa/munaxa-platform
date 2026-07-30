'use client';

import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { cn } from '../../lib/cn.js';
import { Check, ChevronRight, Circle } from '../../../icons/index.js';
import { overlaySurface } from './popover.js';

/**
 * A menu of actions opened from a button.
 *
 * Radix owns the behaviour: roving focus, typeahead, submenu open/close intent (which is not
 * "hover" — it accounts for the diagonal path a pointer takes toward a submenu), Escape and
 * outside dismissal, and focus returning to the trigger. Hand-rolling any of that produces a menu
 * that works with a mouse and fails with a keyboard.
 *
 * Menu items are actions, not links. For navigation, use a link inside `DropdownMenuItem asChild`
 * so the element stays an anchor and middle-click, copy-link and open-in-new-tab keep working.
 */
export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
export const DropdownMenuGroup = DropdownMenuPrimitive.Group;
export const DropdownMenuSub = DropdownMenuPrimitive.Sub;
export const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup;

/** Row styling shared by every kind of menu item, in this menu and in the context menu. */
export const menuItemClass = cn(
  'relative flex cursor-default select-none items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none',
  'transition-colors focus:bg-accent focus:text-accent-foreground',
  'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
  '[&_svg]:size-4 [&_svg]:shrink-0',
);

export const menuSurface = cn(
  overlaySurface,
  'min-w-[10rem] p-1 origin-(--radix-dropdown-menu-content-transform-origin)',
);

export const DropdownMenuContent = forwardRef<
  ElementRef<typeof DropdownMenuPrimitive.Content>,
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>
>(function DropdownMenuContent({ className, sideOffset = 6, ...props }, ref) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        className={cn(menuSurface, className)}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
});

export const DropdownMenuItem = forwardRef<
  ElementRef<typeof DropdownMenuPrimitive.Item>,
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & {
    /** Indent to line up with checkable siblings in the same menu. */
    inset?: boolean;
    /** Destructive actions read in the destructive colour, and are still labelled as such. */
    destructive?: boolean;
  }
>(function DropdownMenuItem({ className, inset, destructive, ...props }, ref) {
  return (
    <DropdownMenuPrimitive.Item
      ref={ref}
      className={cn(
        menuItemClass,
        inset && 'ps-8',
        destructive && 'text-destructive focus:bg-destructive/10 focus:text-destructive',
        className,
      )}
      {...props}
    />
  );
});

export const DropdownMenuCheckboxItem = forwardRef<
  ElementRef<typeof DropdownMenuPrimitive.CheckboxItem>,
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.CheckboxItem>
>(function DropdownMenuCheckboxItem({ className, children, ...props }, ref) {
  return (
    <DropdownMenuPrimitive.CheckboxItem
      ref={ref}
      className={cn(menuItemClass, 'ps-8', className)}
      {...props}
    >
      <span className="absolute start-2 flex size-4 items-center justify-center">
        <DropdownMenuPrimitive.ItemIndicator>
          <Check className="size-4" aria-hidden="true" />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.CheckboxItem>
  );
});

export const DropdownMenuRadioItem = forwardRef<
  ElementRef<typeof DropdownMenuPrimitive.RadioItem>,
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.RadioItem>
>(function DropdownMenuRadioItem({ className, children, ...props }, ref) {
  return (
    <DropdownMenuPrimitive.RadioItem
      ref={ref}
      className={cn(menuItemClass, 'ps-8', className)}
      {...props}
    >
      <span className="absolute start-2 flex size-4 items-center justify-center">
        <DropdownMenuPrimitive.ItemIndicator>
          <Circle className="size-2 fill-current" aria-hidden="true" />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.RadioItem>
  );
});

export const DropdownMenuLabel = forwardRef<
  ElementRef<typeof DropdownMenuPrimitive.Label>,
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Label> & { inset?: boolean }
>(function DropdownMenuLabel({ className, inset, ...props }, ref) {
  return (
    <DropdownMenuPrimitive.Label
      ref={ref}
      className={cn(
        'px-2 py-1.5 text-xs font-medium text-muted-foreground',
        inset && 'ps-8',
        className,
      )}
      {...props}
    />
  );
});

export const DropdownMenuSeparator = forwardRef<
  ElementRef<typeof DropdownMenuPrimitive.Separator>,
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>
>(function DropdownMenuSeparator({ className, ...props }, ref) {
  return (
    <DropdownMenuPrimitive.Separator
      ref={ref}
      className={cn('-mx-1 my-1 h-px bg-border', className)}
      {...props}
    />
  );
});

export const DropdownMenuSubTrigger = forwardRef<
  ElementRef<typeof DropdownMenuPrimitive.SubTrigger>,
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubTrigger> & { inset?: boolean }
>(function DropdownMenuSubTrigger({ className, inset, children, ...props }, ref) {
  return (
    <DropdownMenuPrimitive.SubTrigger
      ref={ref}
      className={cn(menuItemClass, 'data-[state=open]:bg-accent', inset && 'ps-8', className)}
      {...props}
    >
      {children}
      {/* Points toward where the submenu will open, which is the other side in RTL. */}
      <ChevronRight className="ms-auto size-4 rtl:-scale-x-100" aria-hidden="true" />
    </DropdownMenuPrimitive.SubTrigger>
  );
});

export const DropdownMenuSubContent = forwardRef<
  ElementRef<typeof DropdownMenuPrimitive.SubContent>,
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubContent>
>(function DropdownMenuSubContent({ className, ...props }, ref) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.SubContent
        ref={ref}
        className={cn(menuSurface, className)}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
});

/** A keyboard hint aligned to the end of a row. Decorative: the shortcut itself is bound elsewhere. */
export function DropdownMenuShortcut({ className, ...props }: ComponentPropsWithoutRef<'span'>) {
  return (
    <span
      className={cn('ms-auto font-mono text-xs tracking-widest text-muted-foreground', className)}
      {...props}
    />
  );
}
