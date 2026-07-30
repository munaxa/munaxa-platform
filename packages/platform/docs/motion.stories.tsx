import type { Meta, StoryObj } from '@storybook/react-vite';
import { MotionPage } from './scale-pages.js';

const meta = {
  title: 'Foundations/Motion',
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Motion: Story = { render: () => <MotionPage /> };
