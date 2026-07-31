import root from '@munaxa/config-eslint/root.js';

/**
 * Root ESLint flat config. A fast, non-type-checked safety net for root-level sweeps.
 * `packages/platform` defines its own stricter, type-aware config, which takes precedence
 * when linting within that package via `turbo lint`.
 */
export default [
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/.turbo/**',
      '**/storybook-static/**',
      'packages/{ui,tokens,icons,theme,typography,utils}/**', // generated façades
      '**/*.config.{js,mjs,cjs,ts}',
      '**/*.d.ts',
    ],
  },
  ...root,
];
