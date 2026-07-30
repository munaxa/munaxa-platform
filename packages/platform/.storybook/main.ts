import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import type { StorybookConfig } from '@storybook/react-vite';

const require = createRequire(import.meta.url);
/** Resolve an addon to its package directory — required under pnpm's strict node_modules. */
const addon = (value: string) => dirname(require.resolve(join(value, 'package.json')));

const config: StorybookConfig = {
  // `ui/` holds each component's own story next to its source. `docs/` holds the pages that
  // document the system rather than a component — foundations, tokens and the brand themes —
  // kept out of `ui/` because they are documentation and must never reach the published build.
  stories: ['../ui/**/*.stories.@(ts|tsx)', '../docs/**/*.stories.@(ts|tsx)', '../docs/**/*.mdx'],
  addons: [addon('@storybook/addon-docs'), addon('@storybook/addon-a11y')],
  framework: {
    name: addon('@storybook/react-vite') as '@storybook/react-vite',
    options: {},
  },
  /**
   * Storybook's react-vite framework does not know about Tailwind, so the plugin has to be added
   * here. Without it `preview.css` is copied through verbatim and every story renders unstyled —
   * which looks like a broken component rather than a broken config.
   */
  viteFinal: async (viteConfig) => {
    const { default: tailwindcss } = await import('@tailwindcss/vite');
    viteConfig.plugins = [...(viteConfig.plugins ?? []), tailwindcss()];
    return viteConfig;
  },
  typescript: {
    // Props tables are generated from the exported `<Component>Props` types, so the docs page
    // can never drift from the actual component API.
    reactDocgen: 'react-docgen-typescript',
    reactDocgenTypescriptOptions: {
      shouldExtractLiteralValuesFromEnum: true,
      shouldRemoveUndefinedFromOptional: true,
      propFilter: (prop) => !prop.parent || !/node_modules/.test(prop.parent.fileName),
    },
  },
};

export default config;
