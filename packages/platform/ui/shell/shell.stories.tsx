import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { AppShellProvider } from './app-shell-context.js';
import { AppShell } from './app-shell.js';
import { Sidebar } from './sidebar.js';
import { NavigationDrawer } from './navigation-drawer.js';
import { TopBar, SidebarTrigger } from './top-bar.js';
import { SidebarNav, type NavigationGroup } from './navigation.js';
import { Container } from '../layouts/container.js';
import { Grid } from '../layouts/grid.js';
import { Stack } from '../layouts/stack.js';
import { Surface } from '../layouts/surface.js';
import { PageHeader } from '../layouts/page.js';
import { Panel, Toolbar } from '../layouts/panel.js';
import { InspectorLayout } from '../layouts/split.js';
import { Button } from '../components/primitives/button.js';
import { Badge } from '../components/primitives/badge.js';
import { Input } from '../components/forms/input.js';
import {
  BarChart3,
  Users,
  Wallet,
  Settings,
  LayoutDashboard,
  GraduationCap,
} from '../../icons/index.js';

/**
 * Navigation as an application would hand it over: already filtered by permission, already
 * translated, already marked active. The platform makes none of those decisions.
 */
const GROUPS: NavigationGroup[] = [
  {
    items: [
      {
        href: '/',
        label: 'Dashboard',
        icon: <LayoutDashboard className="size-4" />,
        active: true,
      },
    ],
  },
  {
    title: 'People',
    items: [
      { href: '/students', label: 'Students', icon: <GraduationCap className="size-4" /> },
      {
        href: '/staff',
        label: 'Staff',
        icon: <Users className="size-4" />,
        badge: <Badge tone="muted">3</Badge>,
      },
    ],
  },
  {
    title: 'Operations',
    items: [
      { href: '/finance', label: 'Finance', icon: <Wallet className="size-4" /> },
      { href: '/reports', label: 'Reports', icon: <BarChart3 className="size-4" /> },
      { href: '/settings', label: 'Settings', icon: <Settings className="size-4" /> },
    ],
  },
];

const Brand = ({ collapsed }: { collapsed: boolean }) => (
  <span className="flex items-center gap-2 font-display font-semibold">
    <span
      aria-hidden="true"
      className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground"
    >
      A
    </span>
    {collapsed ? null : <span className="truncate">Acme</span>}
  </span>
);

const SessionFooter = () => (
  <Surface tone="muted" padding={3} className="text-xs">
    <p className="truncate text-muted-foreground">Administrator</p>
    <p className="truncate font-mono text-[10px] text-muted-foreground/70">tenant-0421</p>
  </Surface>
);

const meta = {
  title: 'Shell/AppShell',
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The application frame, decomposed. `AppShellProvider` owns the state the parts share; ' +
          '`AppShell`, `Sidebar`, `SidebarNav`, `TopBar`, `NavigationDrawer` and `SkipLink` each ' +
          'do one thing.\n\n' +
          'It is product-agnostic by construction: no logo, no search, no user menu and no ' +
          'navigation data of its own. Navigation arrives **already resolved** — visibility, ' +
          'active state and labels are permission, routing and translation decisions, and those ' +
          'are business rules. It persists nothing, and it imports no router; the application ' +
          'supplies the link element through `renderLink`.\n\n' +
          '**Try it:** narrow the preview below `md` to swap the rail for the drawer, Tab from the ' +
          'top to reach the skip link, and switch the Direction control to RTL — the rail, the ' +
          'drawer and the collapse chevron all mirror.',
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function Demo({
  collapsed,
  onCollapsedChange,
}: {
  collapsed?: boolean;
  onCollapsedChange?: (v: boolean) => void;
}) {
  const nav = <SidebarNav groups={GROUPS} label="Main" />;
  return (
    <AppShellProvider
      {...(collapsed === undefined ? {} : { collapsed })}
      {...(onCollapsedChange === undefined ? {} : { onCollapsedChange })}
    >
      <AppShell
        skipLinkLabel="Skip to content"
        sidebar={
          <Sidebar
            brand={(isCollapsed) => <Brand collapsed={isCollapsed} />}
            footer={<SessionFooter />}
          >
            {nav}
          </Sidebar>
        }
        drawer={
          <NavigationDrawer
            label="Navigation"
            brand={<Brand collapsed={false} />}
            footer={<SessionFooter />}
          >
            <SidebarNav groups={GROUPS} label="Main" collapsed={false} />
          </NavigationDrawer>
        }
        topBar={
          <TopBar
            actions={
              <>
                <Button variant="outline" size="sm">
                  Notifications
                </Button>
                <Button size="sm">Account</Button>
              </>
            }
          >
            <SidebarTrigger />
            <Input aria-label="Search" placeholder="Search…" className="max-w-sm" />
          </TopBar>
        }
      >
        <Container width="full" className="py-6">
          <Stack gap={6}>
            <PageHeader
              title="Students"
              description="All enrolled students."
              actions={<Button size="sm">Add student</Button>}
            />
            <InspectorLayout inspector={<Panel title="Details">Select a record.</Panel>}>
              <Stack gap={4}>
                <Toolbar label="List actions" actions={<Button size="sm">Export</Button>}>
                  <Input aria-label="Filter students" placeholder="Filter…" className="max-w-xs" />
                </Toolbar>
                <Grid cols={{ base: 1, md: 2, xl: 3 }} gap={3}>
                  {Array.from({ length: 6 }, (_, i) => (
                    <Surface key={i} padding={4} className="text-sm">
                      Record {i + 1}
                    </Surface>
                  ))}
                </Grid>
              </Stack>
            </InspectorLayout>
          </Stack>
        </Container>
      </AppShell>
    </AppShellProvider>
  );
}

export const Default: Story = {
  render: () => <Demo />,
};

/** Collapsed to the icon rail. Every link keeps its accessible name through `title` + `sr-only`. */
export const CollapsedRail: Story = {
  render: () => <Demo collapsed />,
};

/**
 * Controlled collapse. The provider holds state but persists nothing — where a preference is
 * stored is an application decision, and a platform that wrote a storage key would have to invent
 * a name for itself or bake a product's name into shared code.
 */
export const ControlledCollapse: Story = {
  render: function Controlled() {
    const [collapsed, setCollapsed] = useState(false);
    return (
      <Stack gap={0}>
        <div className="border-b border-border bg-muted px-4 py-2 text-sm">
          Owner state: <code>collapsed = {String(collapsed)}</code> — the application would persist
          this.
        </div>
        <Demo collapsed={collapsed} onCollapsedChange={setCollapsed} />
      </Stack>
    );
  },
};

/**
 * Below `md` the rail is not rendered at all and the same navigation appears in a modal drawer:
 * focus moves in, Tab is trapped, Escape and the scrim close it, and focus returns to the trigger.
 */
export const MobileDrawer: Story = {
  parameters: { viewport: { defaultViewport: 'mobile1' } },
  render: () => <Demo />,
};
