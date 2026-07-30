'use client';

import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react';
import * as AvatarPrimitive from '@radix-ui/react-avatar';
import { cn } from '../../lib/cn.js';

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

const SIZE: Record<AvatarSize, string> = {
  xs: 'size-6 text-[10px]',
  sm: 'size-8 text-xs',
  md: 'size-10 text-sm',
  lg: 'size-12 text-base',
  xl: 'size-16 text-lg',
};

/**
 * A person's or entity's picture, with a fallback for when there is no image or it fails to load.
 *
 * Radix handles the loading state, so the fallback appears immediately on a broken URL rather than
 * after a blank gap — and never flashes in when the image was going to load anyway.
 *
 * The image's `alt` should usually be empty. An avatar almost always sits beside the name it
 * depicts, and a picture captioned with the same name it is next to is read twice.
 */
export const Avatar = forwardRef<
  ElementRef<typeof AvatarPrimitive.Root>,
  ComponentPropsWithoutRef<typeof AvatarPrimitive.Root> & { size?: AvatarSize }
>(function Avatar({ className, size = 'md', ...props }, ref) {
  return (
    <AvatarPrimitive.Root
      ref={ref}
      className={cn(
        'relative flex shrink-0 overflow-hidden rounded-full bg-muted',
        SIZE[size],
        className,
      )}
      {...props}
    />
  );
});

export const AvatarImage = forwardRef<
  ElementRef<typeof AvatarPrimitive.Image>,
  ComponentPropsWithoutRef<typeof AvatarPrimitive.Image>
>(function AvatarImage({ className, alt = '', ...props }, ref) {
  return (
    <AvatarPrimitive.Image
      ref={ref}
      alt={alt}
      className={cn('aspect-square size-full object-cover', className)}
      {...props}
    />
  );
});

export const AvatarFallback = forwardRef<
  ElementRef<typeof AvatarPrimitive.Fallback>,
  ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback>
>(function AvatarFallback({ className, ...props }, ref) {
  return (
    <AvatarPrimitive.Fallback
      ref={ref}
      className={cn(
        'flex size-full items-center justify-center rounded-full',
        'bg-primary/10 font-semibold text-primary-strong',
        className,
      )}
      {...props}
    />
  );
});

export interface AvatarGroupProps extends ComponentPropsWithoutRef<'div'> {
  /** Show at most this many, then a "+N" counter. */
  max?: number;
  size?: AvatarSize;
}

/**
 * Overlapping avatars with an overflow count.
 *
 * The overflow marker carries the real number as text, so "and 7 more" is available to a screen
 * reader rather than being conveyed only by a visual "+7".
 */
export const AvatarGroup = forwardRef<HTMLDivElement, AvatarGroupProps>(function AvatarGroup(
  { max = 4, size = 'sm', className, children, ...props },
  ref,
) {
  const items = Array.isArray(children) ? children : [children];
  const visible = items.slice(0, max);
  const overflow = items.length - visible.length;

  return (
    <div
      ref={ref}
      className={cn('flex items-center -space-x-2 rtl:space-x-reverse', className)}
      {...props}
    >
      {visible}
      {overflow > 0 ? (
        <span
          className={cn(
            'flex items-center justify-center rounded-full border-2 border-background',
            'bg-muted font-medium text-muted-foreground',
            SIZE[size],
          )}
        >
          +{overflow}
        </span>
      ) : null}
    </div>
  );
});
