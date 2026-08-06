import { defineConfig } from 'vitest/config';

/**
 * @munaxa/interfaces runs on the server, with no DOM and no product data. Tests are split by the
 * question they answer: `unit` (does the unit behave), `integration` (do the units compose),
 * `security` (does the guarantee hold against an attacker), `performance` (is the hot path
 * still cheap) and `compat` (does last release's data and API still work).
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['test/**/*.test.ts'],
    coverage: { provider: 'v8', include: ['src/**/*.ts'], exclude: ['src/**/index.ts'] },
  },
});
