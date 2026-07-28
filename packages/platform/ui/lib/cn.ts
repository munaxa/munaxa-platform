import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Tailwind-aware className combiner used across the Admin Portal & shared UI. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
