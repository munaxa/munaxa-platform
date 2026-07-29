'use client';

import { breakpoints, type BreakpointToken } from '../../tokens/breakpoints/index.js';
import { useMediaQuery } from './use-media-query.js';

/**
 * The device classes the responsive system reasons about, from narrowest to widest. `base` is
 * everything below `sm` — phones — and is the scale every component starts from.
 */
export const VIEWPORT_ORDER = ['base', 'sm', 'md', 'lg', 'xl', '2xl'] as const;
export type Viewport = (typeof VIEWPORT_ORDER)[number];

/**
 * True when the viewport is at or above a breakpoint — the JS mirror of Tailwind's `md:` prefix.
 *
 * The query is built from `tokens/breakpoints`, so JS and CSS can never disagree about where a
 * breakpoint sits. That is the whole point of the hook: an app that writes `matchMedia('(min-width:
 * 768px)')` by hand has forked the scale the moment the token changes.
 */
export function useBreakpoint(token: BreakpointToken): boolean {
  return useMediaQuery(`(min-width: ${breakpoints[token]})`);
}

/**
 * The widest breakpoint the viewport currently satisfies.
 *
 * Use it when behaviour has more than two branches — a sidebar that is a drawer on mobile, an icon
 * rail on tablet and expanded on desktop. For a single threshold, `useBreakpoint` reads better.
 */
export function useViewport(): Viewport {
  const sm = useBreakpoint('sm');
  const md = useBreakpoint('md');
  const lg = useBreakpoint('lg');
  const xl = useBreakpoint('xl');
  const xxl = useBreakpoint('2xl');

  if (xxl) return '2xl';
  if (xl) return 'xl';
  if (lg) return 'lg';
  if (md) return 'md';
  if (sm) return 'sm';
  return 'base';
}

/** True below `md` — the threshold at which navigation becomes a drawer. */
export function useIsMobile(): boolean {
  return !useBreakpoint('md');
}

/**
 * True when the user has asked for reduced motion.
 *
 * Animation must be *removed*, not merely shortened, and the end state has to be reachable without
 * it. Components that only decorate with motion should prefer the `motion-reduce:` CSS variant;
 * this hook is for motion driven from JS, where CSS cannot reach.
 */
export function usePrefersReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)');
}
