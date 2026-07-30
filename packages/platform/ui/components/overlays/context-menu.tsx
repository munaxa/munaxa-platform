'use client';

import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react';
import * as ContextMenuPrimitive from '@radix-ui/react-context-menu';
import { cn } from '../../lib/cn.js';
import { Check, ChevronRight } from '../../../icons/index.js';
import { menuItemClass, menuSurface } from './dropdown-menu.js';

/**
 * A menu opened by right-click, long-press, or the keyboard's context-menu key.
 *
 * It shares the dropdown's row and surface styling — one menu look, two ways of summoning it.
 *
 * A context menu must never be the *only* route to an action: right-click is undiscoverable, and
 * on touch it competes with the browser's own selection handling. Offer the same actions from a
 * visible control and treat this as the accelerator it is.
 */
export const ContextMenu = ContextMenuPrimitive.Root;
export const ContextMenuTrigger = ContextMenuPrimitive.Trigger;
export const ContextMenuGroup = ContextMenuPrimitive.Group;
export const ContextMenuSub = ContextMenuPrimitive.Sub;
export const ContextMenuRadioGroup = ContextMenuPrimitive.RadioGroup;

export const ContextMenuContent = forwardRef<
  ElementRef<typeof ContextMenuPrimitive.Content>,
  ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Content>
>(function ContextMenuContent({ className, ...props }, ref) {
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.Content
        ref={ref}
        className={cn(
          menuSurface,
          'origin-(--radix-context-menu-content-transform-origin)',
          className,
        )}
        {...props}
      />
    </ContextMenuPrimitive.Portal>
  );
});

export const ContextMenuItem = forwardRef<
  ElementRef<typeof ContextMenuPrimitive.Item>,
  ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Item> & {
    inset?: boolean;
    destructive?: boolean;
  }
>(function ContextMenuItem({ className, inset, destructive, ...props }, ref) {
  return (
    <ContextMenuPrimitive.Item
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

export const ContextMenuCheckboxItem = forwardRef<
  ElementRef<typeof ContextMenuPrimitive.CheckboxItem>,
  ComponentPropsWithoutRef<typeof ContextMenuPrimitive.CheckboxItem>
>(function ContextMenuCheckboxItem({ className, children, ...props }, ref) {
  return (
    <ContextMenuPrimitive.CheckboxItem
      ref={ref}
      className={cn(menuItemClass, 'ps-8', className)}
      {...props}
    >
      <span className="absolute start-2 flex size-4 items-center justify-center">
        <ContextMenuPrimitive.ItemIndicator>
          <Check className="size-4" aria-hidden="true" />
        </ContextMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </ContextMenuPrimitive.CheckboxItem>
  );
});

export const ContextMenuLabel = forwardRef<
  ElementRef<typeof ContextMenuPrimitive.Label>,
  ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Label> & { inset?: boolean }
>(function ContextMenuLabel({ className, inset, ...props }, ref) {
  return (
    <ContextMenuPrimitive.Label
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

export const ContextMenuSeparator = forwardRef<
  ElementRef<typeof ContextMenuPrimitive.Separator>,
  ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Separator>
>(function ContextMenuSeparator({ className, ...props }, ref) {
  return (
    <ContextMenuPrimitive.Separator
      ref={ref}
      className={cn('-mx-1 my-1 h-px bg-border', className)}
      {...props}
    />
  );
});

export const ContextMenuSubTrigger = forwardRef<
  ElementRef<typeof ContextMenuPrimitive.SubTrigger>,
  ComponentPropsWithoutRef<typeof ContextMenuPrimitive.SubTrigger> & { inset?: boolean }
>(function ContextMenuSubTrigger({ className, inset, children, ...props }, ref) {
  return (
    <ContextMenuPrimitive.SubTrigger
      ref={ref}
      className={cn(menuItemClass, 'data-[state=open]:bg-accent', inset && 'ps-8', className)}
      {...props}
    >
      {children}
      <ChevronRight className="ms-auto size-4 rtl:-scale-x-100" aria-hidden="true" />
    </ContextMenuPrimitive.SubTrigger>
  );
});

export const ContextMenuSubContent = forwardRef<
  ElementRef<typeof ContextMenuPrimitive.SubContent>,
  ComponentPropsWithoutRef<typeof ContextMenuPrimitive.SubContent>
>(function ContextMenuSubContent({ className, ...props }, ref) {
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.SubContent
        ref={ref}
        className={cn(menuSurface, className)}
        {...props}
      />
    </ContextMenuPrimitive.Portal>
  );
});
