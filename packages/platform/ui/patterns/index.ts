/**
 * Composite patterns — multi-part UI assembled from the primitives in `components/`.
 *
 * A pattern is still product-agnostic: it encodes a reusable *shape* (a stat card, a stepper,
 * a scroll reveal), never product data or business rules.
 */
export { StatCard, type StatCardProps, type StatDelta } from './stat-card.js';
export { Stepper, type StepperProps, type StepperStep } from './stepper.js';
export {
  Progress,
  type ProgressProps,
  ReadinessRing,
  type ReadinessRingProps,
} from './progress.js';
export { KpiGrid, ChartCard, type KpiGridProps, type ChartCardProps } from './dashboard.js';
export { TokenReference } from './token-reference.js';
export { CountUp } from './motion/count-up.js';
export { Reveal } from './motion/reveal.js';
