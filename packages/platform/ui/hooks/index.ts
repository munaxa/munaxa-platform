/**
 * Shared UI hooks. Only hooks that are genuinely product-agnostic belong here — anything that
 * reaches for product data, permissions or routing stays in the consuming application.
 */
export {
  useTheme,
  type ColorScheme,
  type UseThemeOptions,
  type UseThemeResult,
} from './use-theme.js';
export { useMediaQuery } from './use-media-query.js';
export {
  useBreakpoint,
  useViewport,
  useIsMobile,
  usePrefersReducedMotion,
  VIEWPORT_ORDER,
  type Viewport,
} from './use-breakpoint.js';
