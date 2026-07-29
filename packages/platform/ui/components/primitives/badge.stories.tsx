import type { Meta, StoryObj } from '@storybook/react-vite';
import { Badge, type Tone } from './badge.js';

const TONES: Tone[] = ['default', 'success', 'warning', 'danger', 'muted'];

const meta = {
  title: 'Primitives/Badge',
  component: Badge,
  parameters: {
    docs: {
      description: {
        component:
          'A tinted wash with a label on top. Each tone pairs the *fill* form of a role at low ' +
          'alpha with its `-strong` form for the label — the plain status colours sit at roughly ' +
          '2.2:1 on a light surface and are unreadable as text.',
      },
    },
  },
  args: { children: 'Badge', tone: 'default' },
  argTypes: { tone: { control: 'inline-radio', options: TONES } },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Tones: Story = {
  render: (args) => (
    <div className="flex flex-wrap items-center gap-2">
      {TONES.map((tone) => (
        <Badge key={tone} {...args} tone={tone}>
          {tone}
        </Badge>
      ))}
    </div>
  ),
};

/** Record states from the specification, mapped onto the semantic tones. */
export const RecordStates: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      <Badge tone="success">Active</Badge>
      <Badge tone="muted">Inactive</Badge>
      <Badge tone="warning">Pending</Badge>
      <Badge tone="muted">Draft</Badge>
      <Badge tone="muted">Archived</Badge>
      <Badge tone="danger">Cancelled</Badge>
    </div>
  ),
};
