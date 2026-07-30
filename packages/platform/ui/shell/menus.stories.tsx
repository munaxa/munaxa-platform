import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { UserMenu, OrganizationSwitcher, NotificationMenu } from './menus.js';
import { DropdownMenuItem } from '../components/overlays/dropdown-menu.js';
import { Breadcrumb } from '../components/navigation/breadcrumb.js';
import { Container } from '../layouts/container.js';
import { Stack, Inline } from '../layouts/stack.js';
import { Section } from '../layouts/page.js';
import { Surface } from '../layouts/surface.js';
import { LogOut, Settings, User } from '../../icons/index.js';

const ORGS = [
  { id: 'a', name: 'Northgate Academy', description: 'Enterprise · tenant-0421' },
  { id: 'b', name: 'Riverside School', description: 'Standard · tenant-0918' },
  { id: 'c', name: 'Hillcrest Prep', description: 'Standard · tenant-1104' },
];

const NOTIFICATIONS = [
  {
    id: '1',
    title: 'Enrolment approved',
    description: 'Olivia Rhye was approved for Grade 6.',
    timestamp: '2m',
    unread: true,
  },
  {
    id: '2',
    title: 'Payment received',
    description: 'Invoice INV-2043 was paid in full.',
    timestamp: '1h',
    unread: true,
  },
  {
    id: '3',
    title: 'Report ready',
    description: 'Term 2 attendance export.',
    timestamp: 'Yesterday',
  },
];

const meta = {
  title: 'Shell/Menus',
  parameters: {
    docs: {
      description: {
        component:
          'Shell menus, composed from the foundation primitives rather than implementing their own ' +
          'interaction. Opening, roving focus, typeahead, Escape, outside-dismissal and focus ' +
          "restoration are all `DropdownMenu`'s — so these three behave identically because they " +
          '*are* the same mechanism, not three that were made to match.\n\n' +
          'They take resolved data and callbacks. Who the user is, which organisations they may ' +
          'switch to and what a notification means are product questions.',
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const TopBarMenus: Story = {
  name: 'User · Organisation · Notifications',
  render: function Menus() {
    const [org, setOrg] = useState('a');
    return (
      <Container className="py-6">
        <Stack gap={8}>
          <Section
            title="Assembled"
            description="How the three sit together in a top bar, with a breadcrumb trail."
          >
            <Surface padding={3}>
              <Inline justify="between" className="w-full">
                <Inline gap={3}>
                  <OrganizationSwitcher
                    organizations={ORGS}
                    currentId={org}
                    onSelect={setOrg}
                    footer={<DropdownMenuItem>Manage organisations…</DropdownMenuItem>}
                  />
                  <Breadcrumb
                    items={[
                      { label: 'People', href: '/people' },
                      { label: 'Students', href: '/people/students' },
                      { label: 'Olivia Rhye' },
                    ]}
                  />
                </Inline>
                <Inline gap={2}>
                  <NotificationMenu
                    notifications={NOTIFICATIONS}
                    footer={<DropdownMenuItem>Mark all as read</DropdownMenuItem>}
                  />
                  <UserMenu
                    name="Ahmad Saadi"
                    description="Administrator"
                    actions={[
                      { id: 'profile', label: 'Profile', icon: <User />, onSelect: () => {} },
                      { id: 'settings', label: 'Settings', icon: <Settings />, onSelect: () => {} },
                      {
                        id: 'signout',
                        label: 'Sign out',
                        icon: <LogOut />,
                        onSelect: () => {},
                        destructive: true,
                      },
                    ]}
                  />
                </Inline>
              </Inline>
            </Surface>
          </Section>

          <Section
            title="Empty notifications"
            description="The trigger's accessible name carries the unread count, so it announces as “Notifications, 2 unread”."
          >
            <NotificationMenu notifications={[]} />
          </Section>
        </Stack>
      </Container>
    );
  },
};
