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
];
