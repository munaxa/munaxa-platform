import type { Meta, StoryObj } from '@storybook/react-vite';
import { Timeline, TimelineItem } from './timeline.js';

/**
 * A vertical activity feed: events newest-first, each with a title, optional metadata and a
 * timestamp. It is an ordered list under the hood, so a screen reader announces it as one.
 */
const meta = {
  title: 'Data Display/Timeline',
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const ActivityFeed: Story = {
  render: () => (
    <Timeline className="max-w-md">
      <TimelineItem title="Subscription renewed" meta="System" timestamp="09:41" />
      <TimelineItem title="Plan changed to Standard" meta="Amina Haddad" timestamp="Yesterday" />
      <TimelineItem title="School onboarded" meta="Platform" timestamp="1 Sep 2026" />
    </Timeline>
  ),
};
