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
    include: ['ui/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['ui/**/*.{ts,tsx}'],
      exclude: ['ui/**/*.stories.tsx', 'ui/**/index.ts'],
    },
  },
});
