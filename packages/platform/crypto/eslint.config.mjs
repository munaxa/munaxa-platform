import base from '@munaxa/config-eslint/base.js';

export default [
  { ignores: ['dist/**', 'coverage/**'] },
  ...base,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // Implementing an async port synchronously is the normal case for an in-memory adapter and
    // for a test double: `CachePort.get` returns a Promise because a Redis-backed implementation
    // must, not because a Map-backed one has anything to await. Requiring a pointless `await` in
    // every one of those methods would add noise to the exact code that is meant to be obvious.
    files: ['src/**/*.ts', 'test/**/*.ts'],
    rules: { '@typescript-eslint/require-await': 'off' },
  },
];
