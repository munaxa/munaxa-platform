import { defineConfig } from 'vitest/config';

/**
 * Real-browser accessibility tests — Phase 8.4.
 *
 * Deliberately a second config rather than a project inside `vitest.config.ts`. That suite runs
 * every component under happy-dom with `color-contrast` disabled, because happy-dom applies no
 * stylesheet and every element there resolves to transparent-on-transparent. The two answer
 * different questions and must not be conflated:
 *
 *   - `vitest.config.ts`  — structural accessibility: roles, names, focus order, keyboard state.
 *   - this config         — computed visual accessibility: what a browser actually paints.
 *
 * Neither replaces the other. The first is fast and runs on every change; the second needs a
 * Storybook build and a browser, so it is its own command.
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['test/a11y/**/*.a11y.spec.ts'],
    // A browser, a static server and four brands per story: generous, and still bounded.
    testTimeout: 120_000,
    hookTimeout: 180_000,
    fileParallelism: false,
  },
});
