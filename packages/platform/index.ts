/**
 * @axa/platform — the single, canonical UI layer for every AXA product.
 *
 * Applications import from the package root:
 *
 *   import { Button, Card, cn } from '@axa/platform';
 *
 * Never deep-import an internal file path. Components are organised internally by category
 * (primitives / forms / feedback / navigation / layout / data-display), with the layout
 * primitives in `ui/layouts`, composite `patterns` and page-level `templates` kept separate; the public surface is this flat
 * barrel, so the internal taxonomy can evolve without breaking consumers.
 *
 * Narrower entry points exist for consumers that want only part of the system:
 *   `@axa/platform/tokens`      typed design tokens
 *   `@axa/platform/typography`  the type scale
 *   `@axa/platform/themes`      the typed product-theme registry
 *   `@axa/platform/icons`       the shared icon set
 *   `@axa/platform/hooks`       UI hooks
 *   `@axa/platform/patterns`    composite patterns
 *
 * The CSS side is consumed through the theme entry points, e.g.
 *   `@import '@axa/platform/css/themes/school';`
 */

// Helpers
export { cn } from './ui/lib/index.js';

// Hooks
export * from './ui/hooks/index.js';

// Components — grouped by internal category, surfaced flat.
export * from './ui/components/primitives/index.js';
export * from './ui/components/forms/index.js';
export * from './ui/components/feedback/index.js';
export * from './ui/components/navigation/index.js';
export * from './ui/components/layout/index.js';
export * from './ui/components/data-display/index.js';

// Layout primitives — arrangement, measure and page structure.
export * from './ui/layouts/index.js';

// Composite patterns built on top of the components.
export * from './ui/patterns/index.js';

// Product themes — the typed registry of the themes shipped as CSS under `themes/`.
export { themes, type Theme, type ThemeId, type Brand } from './themes/index.js';

// Design tokens — convenience namespace. The canonical import path remains
// `@axa/platform/tokens`; this mirror lets consumers read tokens from the root.
export * as tokens from './tokens/index.js';
