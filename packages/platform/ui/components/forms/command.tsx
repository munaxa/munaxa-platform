'use client';

import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react';
import { Command as CommandPrimitive } from 'cmdk';
import { cn } from '../../lib/cn.js';
import { Search } from '../../../icons/index.js';
import { Dialog } from '../feedback/dialog.js';

/**
 * A filterable list of options with a text input — the foundation under Combobox, MultiSelect,
 * Autocomplete and the command palette.
 *
 * `cmdk` owns the parts that are easy to get subtly wrong: the input keeps focus while the
 * *listbox* selection moves through `aria-activedescendant`, so arrow keys never steal the caret;
 * filtering and scoring are debounced against the rendered list; and the empty state only appears
 * once filtering has actually run. Building four controls on one of these rather than four is the
 * point of this phase.
 *
 * Nothing here decides how options are fetched or what a match means — `shouldFilter={false}` hands
 * filtering back to the caller for server-side search.
 */
export const Command = forwardRef<
  ElementRef<typeof CommandPrimitive>,
  ComponentPropsWithoutRef<typeof CommandPrimitive>
>(function Command({ className, ...props }, ref) {
  return (
    <CommandPrimitive
      ref={ref}
      className={cn(
        'flex size-full flex-col overflow-hidden rounded-lg bg-popover text-popover-foreground',
        className,
      )}
      {...props}
    />
  );
});

export const CommandInput = forwardRef<
  ElementRef<typeof CommandPrimitive.Input>,
  ComponentPropsWithoutRef<typeof CommandPrimitive.Input> & { icon?: boolean }
>(function CommandInput({ className, icon = true, ...props }, ref) {
  return (
    <div className="flex items-center gap-2 border-b border-border px-3" data-slot="command-input">
      {icon ? (
        <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      ) : null}
      <CommandPrimitive.Input
        ref={ref}
        className={cn(
          'flex h-10 w-full bg-transparent py-3 text-sm outline-none',
          'placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        {...props}
      />
    </div>
  );
});

export const CommandList = forwardRef<
  ElementRef<typeof CommandPrimitive.List>,
  ComponentPropsWithoutRef<typeof CommandPrimitive.List>
>(function CommandList({ className, ...props }, ref) {
  return (
    <CommandPrimitive.List
      ref={ref}
      className={cn('max-h-64 overflow-y-auto overflow-x-hidden p-1', className)}
      {...props}
    />
  );
});

/**
 * Shown when nothing matches. `cmdk` renders it only after filtering has run, so it never flashes
 * in before the first keystroke has been processed.
 */
export const CommandEmpty = forwardRef<
  ElementRef<typeof CommandPrimitive.Empty>,
  ComponentPropsWithoutRef<typeof CommandPrimitive.Empty>
>(function CommandEmpty({ className, ...props }, ref) {
  return (
    <CommandPrimitive.Empty
      ref={ref}
      className={cn('py-6 text-center text-sm text-muted-foreground', className)}
      {...props}
    />
  );
});

export const CommandGroup = forwardRef<
  ElementRef<typeof CommandPrimitive.Group>,
  ComponentPropsWithoutRef<typeof CommandPrimitive.Group>
>(function CommandGroup({ className, ...props }, ref) {
  return (
    <CommandPrimitive.Group
      ref={ref}
      className={cn(
        'overflow-hidden text-foreground',
        '[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5',
        '[&_[cmdk-group-heading]]:font-mono [&_[cmdk-group-heading]]:text-[10px]',
        '[&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider',
        '[&_[cmdk-group-heading]]:text-muted-foreground/70',
        className,
      )}
      {...props}
    />
  );
});

export const CommandItem = forwardRef<
  ElementRef<typeof CommandPrimitive.Item>,
  ComponentPropsWithoutRef<typeof CommandPrimitive.Item>
>(function CommandItem({ className, ...props }, ref) {
  return (
    <CommandPrimitive.Item
      ref={ref}
      className={cn(
        'relative flex cursor-default select-none items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none',
        'transition-colors data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground',
        'data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50',
        '[&_svg]:size-4 [&_svg]:shrink-0',
        className,
      )}
      {...props}
    />
  );
});

export const CommandSeparator = forwardRef<
  ElementRef<typeof CommandPrimitive.Separator>,
  ComponentPropsWithoutRef<typeof CommandPrimitive.Separator>
>(function CommandSeparator({ className, ...props }, ref) {
  return (
    <CommandPrimitive.Separator
      ref={ref}
      className={cn('-mx-1 my-1 h-px bg-border', className)}
      {...props}
    />
  );
});

/** A keyboard hint aligned to the end of a row. Decorative — the shortcut is bound elsewhere. */
export function CommandShortcut({ className, ...props }: ComponentPropsWithoutRef<'span'>) {
  return (
    <span
      className={cn('ms-auto font-mono text-xs tracking-widest text-muted-foreground', className)}
      {...props}
    />
  );
}

export interface CommandPaletteProps extends ComponentPropsWithoutRef<typeof CommandPrimitive> {
  open: boolean;
  onClose: () => void;
  /** Accessible name for the dialog — "Search", "Command palette". */
  title: string;
  /** Visually hidden supporting text describing how to use it. */
  description?: string;
}

/**
 * The command palette: a `Command` inside the platform's `Dialog`, so it inherits the focus trap,
 * Escape handling, scroll lock and focus restoration rather than reimplementing them.
 *
 * The title is visually hidden — a palette needs no visible heading — but it is still the dialog's
 * accessible name, because an unnamed dialog announces as "dialog" and nothing else.
 */
export function CommandPalette({
  open,
  onClose,
  title,
  description,
  className,
  children,
  ...props
}: CommandPaletteProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      {...(description === undefined ? {} : { description })}
      className="max-w-xl overflow-hidden p-0 [&>div:first-child]:sr-only"
    >
      <Command className={cn('[&_[data-slot=command-input]]:border-b', className)} {...props}>
        {children}
      </Command>
    </Dialog>
  );
}
