import type { Meta, StoryObj } from '@storybook/react-vite';
import { BreakpointsPage } from './scale-pages.js';

const meta = {
  title: 'Foundations/Breakpoints',
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Breakpoints: Story = { render: () => <BreakpointsPage /> };
