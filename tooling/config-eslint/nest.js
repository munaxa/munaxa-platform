import base from './base.js';

/** ESLint config for the NestJS backend. */
export default [
  ...base,
  {
    rules: {
      // Nest uses decorators & DI heavily; relax a few rules that fight the framework.
      '@typescript-eslint/no-extraneous-class': 'off',
      '@typescript-eslint/interface-name-prefix': 'off',
    },
  },
];
