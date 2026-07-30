import type { Meta, StoryObj } from '@storybook/react-vite';
import { ElevationPage } from './scale-pages.js';

const meta = {
  title: 'Foundations/Elevation',
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Elevation: Story = { render: () => <ElevationPage /> };
