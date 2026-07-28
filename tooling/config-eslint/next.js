import base from './base.js';
import globals from 'globals';

/** ESLint config for the Next.js admin portal. */
export default [
  ...base,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
];
