import type { Meta, StoryObj } from '@storybook/react-vite';
import { SpacingPage } from './scale-pages.js';

const meta = {
  title: 'Foundations/Spacing',
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Spacing: Story = { render: () => <SpacingPage /> };
