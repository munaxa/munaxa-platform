import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button, type ButtonVariant, type ButtonSize } from './button.js';
import { Plus, Trash2 } from '../../../icons/index.js';

const VARIANTS: ButtonVariant[] = ['default', 'secondary', 'outline', 'ghost', 'destructive'];
const SIZES: ButtonSize[] = ['sm', 'md', 'lg'];

const meta = {
  title: 'Primitives/Button',
  component: Button,
  parameters: {
    docs: {
      description: {
        component:
          'The primary action control. `bg-primary` is a **fill** and is paired with ' +
          '`--primary-foreground`; brand-coloured *text* uses `text-primary-strong` instead — ' +
          'see the platform README, §4.',
      },
    },
  },
  args: { children: 'Button' },
  argTypes: {
    variant: { control: 'inline-radio', options: VARIANTS },
    size: { control: 'inline-radio', options: [...SIZES, 'icon'] },
    disabled: { control: 'boolean' },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Variants: Story = {
  render: (args) => (
    <div className="flex flex-wrap items-center gap-3">
      {VARIANTS.map((variant) => (
        <Button key={variant} {...args} variant={variant}>
          {variant}
        </Button>
      ))}
    </div>
  ),
};

export const Sizes: Story = {
  render: (args) => (
    <div className="flex flex-wrap items-center gap-3">
      {SIZES.map((size) => (
        <Button key={size} {...args} size={size}>
          {size}
        </Button>
      ))}
      <Button {...args} size="icon" aria-label="Add">
        <Plus className="size-4" aria-hidden="true" />
      </Button>
    </div>
  ),
};

/** Disabled is a real state, not an afterthought: pointer events off, 50% opacity, still focusable order-wise. */
export const Disabled: Story = {
  render: (args) => (
    <div className="flex flex-wrap items-center gap-3">
      {VARIANTS.map((variant) => (
        <Button key={variant} {...args} variant={variant} disabled>
          {variant}
        </Button>
      ))}
    </div>
  ),
};

/** An icon-only button carries its name in `aria-label`; the glyph itself is hidden from AT. */
export const WithIcons: Story = {
  render: (args) => (
    <div className="flex flex-wrap items-center gap-3">
      <Button {...args}>
        <Plus className="size-4" aria-hidden="true" />
        Add record
      </Button>
      <Button {...args} variant="destructive">
        <Trash2 className="size-4" aria-hidden="true" />
        Delete
      </Button>
      <Button {...args} size="icon" variant="outline" aria-label="Add record">
        <Plus className="size-4" aria-hidden="true" />
      </Button>
    </div>
  ),
};
