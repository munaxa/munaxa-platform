import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

/**
 * Lightweight, non-type-checked flat config used at the repo root (e.g. by the
 * pre-commit lint-staged sweep) so that any file without a closer package config
 * still resolves. Full, type-aware linting is performed per-package via `turbo lint`.
 * @type {import('eslint').Linter.Config[]}
 */
export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  prettier,
);
