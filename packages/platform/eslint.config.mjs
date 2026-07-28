import base from '@axa/config-eslint/base.js';
import scripts from '@axa/config-eslint/scripts.js';

export default [
  ...base,
  {
    languageOptions: {
      parserOptions: {
        // The validator scripts are plain ESM outside the TypeScript project; type-aware linting
        // still applies to them via the default project.
        projectService: { allowDefaultProject: ['scripts/*.mjs'] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // Platform guardrail: components, patterns and the structural token scales must never
    // hardcode a hex color. Use token-driven classes (bg-primary, text-foreground, border-border,
    // …) whose values come from the active theme. The `themes/` layer is the one place where raw
    // brand hexes are allowed — that is precisely what a theme is.
    files: ['ui/**/*.{ts,tsx}', 'tokens/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'Literal[value=/#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})(?![0-9a-fA-F])/]',
          message:
            'No hardcoded hex colors outside themes/ — use token-driven classes (bg-primary, text-foreground, …).',
        },
        {
          selector:
            'TemplateElement[value.raw=/#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})(?![0-9a-fA-F])/]',
          message:
            'No hardcoded hex colors outside themes/ — use token-driven classes (bg-primary, text-foreground, …).',
        },
      ],
    },
  },
  // The validators are plain Node ESM outside the TypeScript project.
  ...scripts.map((c) => ({ ...c, files: ['scripts/**/*.mjs'] })),
];
