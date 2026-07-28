import { motion } from '../motion/index.js';

/**
 * Munaxa transition tokens — ready-to-use `transition` shorthand presets composed from the
 * motion durations/easings. Keeps interaction timing consistent across every component.
 */
export const transitions = {
  none: 'none',
  /** Default for color/background/border interactions. */
  default: `all ${motion.duration.normal} ${motion.easing.standard}`,
  fast: `all ${motion.duration.fast} ${motion.easing.standard}`,
  slow: `all ${motion.duration.slow} ${motion.easing.standard}`,
  /** For elements entering the viewport / opening. */
  enter: `all ${motion.duration.normal} ${motion.easing.enter}`,
  /** For elements leaving / closing. */
  exit: `all ${motion.duration.fast} ${motion.easing.exit}`,
  colors: `color, background-color, border-color, fill, stroke ${motion.duration.fast} ${motion.easing.standard}`,
  transform: `transform ${motion.duration.normal} ${motion.easing.standard}`,
  opacity: `opacity ${motion.duration.normal} ${motion.easing.standard}`,
} as const;

export type Transitions = typeof transitions;
