/**
 * Design tokens — the single source of truth for every value in the AXA design system.
 *
 * These typed tokens are the reference for design tooling and documentation. The *runtime*
 * palette is authored as CSS custom properties under `themes/` and exposed to applications
 * through the Tailwind v4 theme contract (`themes/base.css`), which every component and every
 * product application consumes.
 *
 * No application may hardcode a color, spacing, radius, shadow, z-index or breakpoint.
 */
export { typography, type Typography, type TypeRole } from '../typography/index.js';
export { spacing, type Spacing, type SpacingToken } from './spacing/index.js';
export { radius, type Radius } from './radius/index.js';
export { elevation, type Elevation } from './elevation/index.js';
export { border, type Border } from './borders/index.js';
export { motion, type Motion } from './motion/index.js';
export { opacity, type Opacity, type OpacityToken } from './opacity/index.js';
export { transitions, type Transitions } from './transitions/index.js';
export { zIndex, type ZIndex, type ZIndexToken } from './z-index/index.js';
export { breakpoints, type Breakpoints, type BreakpointToken } from './breakpoints/index.js';

import { typography } from '../typography/index.js';
import { spacing } from './spacing/index.js';
import { radius } from './radius/index.js';
import { elevation } from './elevation/index.js';
import { border } from './borders/index.js';
import { motion } from './motion/index.js';
import { opacity } from './opacity/index.js';
import { transitions } from './transitions/index.js';
import { zIndex } from './z-index/index.js';
import { breakpoints } from './breakpoints/index.js';

/** The complete token set as a single object, for tooling and documentation. */
export const tokens = {
  typography,
  spacing,
  radius,
  elevation,
  border,
  motion,
  opacity,
  transitions,
  zIndex,
  breakpoints,
} as const;

export type Tokens = typeof tokens;
