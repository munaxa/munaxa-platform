import type { Meta, StoryObj } from '@storybook/react-vite';
import { RadiusPage } from './scale-pages.js';

const meta = {
  title: 'Foundations/Radius',
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Radius: Story = { render: () => <RadiusPage /> };
