import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Config fragment for build/validation scripts: plain ESM run by Node, outside any TypeScript
 * project. Type-aware rules cannot work without type information, so they are switched off; the
 * syntactic rules still apply. Scripts run on Node and print to stdout by design.
 *
 * Scope it to the script paths at the call site:
 *
 *   import scripts from '@axa/config-eslint/scripts.js';
 *   ...scripts.map((c) => ({ ...c, files: ['scripts/**\/*.mjs'] })),
 *
 * @type {import('eslint').Linter.Config[]}
 */
export default [
  tseslint.configs.disableTypeChecked,
  {
    languageOptions: { globals: globals.node },
    rules: { 'no-console': 'off' },
  },
];
