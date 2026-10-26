import { defineConfig } from 'vitest/config';

/**
 * @munaxa/licensing runs on the server and inside on-premises installations, with no DOM and no
 * product data. `unit` covers the pure rules, `security` the guarantees a forged, replayed or
 * clock-shifted licence must not defeat.
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['test/**/*.test.ts'],
    coverage: { provider: 'v8', include: ['src/**/*.ts'], exclude: ['src/**/index.ts'] },
  },
});
