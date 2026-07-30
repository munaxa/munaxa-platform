import type { Meta, StoryObj } from '@storybook/react-vite';
import { TokenReference } from './token-reference.js';

const meta = {
  title: 'Foundations/Tokens',
  component: TokenReference,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The live token reference. Every swatch reads the *actual* CSS custom property off the ' +
          'running document and paints itself with the real Tailwind utility, so it cannot drift ' +
          'from `themes/<product>/palette.css`. Toggle the Scheme control to see the dark values ' +
          'update in place. Copy the "Use as" class — never a hex.',
      },
    },
  },
} satisfies Meta<typeof TokenReference>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Reference: Story = {};
