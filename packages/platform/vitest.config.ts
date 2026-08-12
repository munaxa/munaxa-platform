import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/**
 * Unit + accessibility tests for the platform's components.
 *
 * The platform ships no product data, so tests are targeted rather than broad: behaviour that
 * can regress silently (keyboard handling, focus management, state machines) and the
 * accessibility floor every component has to clear. Snapshot tests of markup are deliberately
 * absent — they fail on every legitimate change and pass on every broken one.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./test/setup.ts'],
    // `themes/` is included as well as `ui/`: the palettes are a generated contract the components
    // depend on, and Phase 8.3 found a contrast defect that lived in the generator's rule rather
    // than in any component. A test that can only see `ui/` cannot catch that class of defect.
    include: [
      'ui/**/*.test.{ts,tsx}',
      'brand/**/*.test.{ts,tsx}',
      'themes/**/*.test.ts',
      'scripts/**/*.test.ts',
    ],
    coverage: {
      provider: 'v8',
      include: ['ui/**/*.{ts,tsx}'],
      exclude: ['ui/**/*.stories.tsx', 'ui/**/index.ts'],
    },
  },
});
