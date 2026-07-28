/**
 * Munaxa responsive breakpoints — aligned with the Tailwind default screens the platform
 * already builds against, promoted to tokens so every app shares one set of breakpoints.
 */
export const breakpoints = {
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px',
} as const;

export type Breakpoints = typeof breakpoints;
export type BreakpointToken = keyof typeof breakpoints;
