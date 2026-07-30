import type { Meta, StoryObj } from '@storybook/react-vite';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from './card.js';
import { Separator } from './separator.js';
import { Button } from '../primitives/button.js';

/**
 * The card surface and its parts. A `Card` is the standard bordered container; its header, title,
 * description, content and footer are separate parts so a screen can compose exactly the regions
 * it needs and no more.
 */
const meta = {
  title: 'Layout/Card',
  component: Card,
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Composed: Story = {
  render: () => (
    <Card className="max-w-sm">
      <CardHeader>
        <CardTitle>Subscription</CardTitle>
        <CardDescription>Standard plan, billed annually.</CardDescription>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        <p>Renews on 1 September 2026.</p>
        <Separator className="my-3" />
        <p>Seats: 1,240 of 1,500.</p>
      </CardContent>
      <CardFooter className="justify-end gap-2">
        <Button variant="outline" size="sm">
          Change plan
        </Button>
        <Button size="sm">Manage</Button>
      </CardFooter>
    </Card>
  ),
};
