import type { Meta, StoryObj } from '@storybook/react-vite';
import { Overline } from './overline.js';

const meta = {
  title: 'Primitives/Overline',
  component: Overline,
  parameters: {
    docs: {
      description: {
        component:
          'Small, spaced capitals that label the group beneath them. Muted foreground at full ' +
          'strength, and no letter-spacing in RTL, where it would break the joins between Arabic ' +
          'letters.',
      },
    },
  },
  args: { children: 'Approval progress', as: 'h3' },
} satisfies Meta<typeof Overline>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

/** Labelling a panel section, the way a detail pane uses it. */
export const InAPanel: Story = {
  render: (args) => (
    <section className="flex w-72 flex-col gap-2 rounded-xl border border-border bg-card p-4">
      <Overline {...args} />
      <p className="text-sm">Department review — approved by Omar Saleh.</p>
    </section>
  ),
};
