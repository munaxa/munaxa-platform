'use client';

import { useState } from 'react';
import {
  Alert,
  Badge,
  Breadcrumb,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  DataGrid,
  Dialog,
  EmptyState,
  Field,
  Input,
  Pagination,
  Select,
  Sparkline,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Timeline,
  TimelineItem,
  type ColumnDef,
} from '../index.js';
import { SidebarNav } from '../ui/shell/index.js';
import { Inbox, LayoutDashboard, Settings, Users } from '../icons/index.js';
import { Section } from './doc-kit.js';

/**
 * One showcase, rendered by all four theme pages.
 *
 * This file is the argument the documentation site exists to make. There is exactly one of it: no
 * per-brand variant, no forked component, no branded copy. Each theme page renders *this* markup
 * inside a container carrying its own `data-brand`, so the only thing that differs between the
 * four pages is which palette the semantic tokens resolve from.
 *
 * If a component had to know which product it was in, that would show up here as a prop — and
 * there isn't one. Every element below is imported from the package root exactly as a product
 * imports it.
 */

interface Row {
  id: string;
  name: string;
  team: string;
  status: 'Active' | 'Pending' | 'Archived';
  score: number;
}

const ROWS: Row[] = [
  { id: '1', name: 'Amina Haddad', team: 'Operations', status: 'Active', score: 92 },
  { id: '2', name: 'Callum Ford', team: 'Finance', status: 'Pending', score: 78 },
  { id: '3', name: 'Zoë Baker', team: 'People', status: 'Active', score: 85 },
  { id: '4', name: 'Émile Rousseau', team: 'Knowledge', status: 'Archived', score: 64 },
];

const TONE: Record<Row['status'], 'success' | 'warning' | 'muted'> = {
  Active: 'success',
  Pending: 'warning',
  Archived: 'muted',
};

const COLUMNS: ColumnDef<Row>[] = [
  { id: 'name', header: 'Name', value: (r) => r.name, sortable: true, rowHeader: true },
  { id: 'team', header: 'Team', value: (r) => r.team, sortable: true },
  {
    id: 'status',
    header: 'Status',
    value: (r) => r.status,
    sortable: true,
    cell: (r) => <Badge tone={TONE[r.status]}>{r.status}</Badge>,
  },
  { id: 'score', header: 'Score', value: (r) => r.score, sortable: true, align: 'end' },
];

const NAV = [
  {
    title: 'Workspace',
    items: [
      { href: '#', label: 'Dashboard', icon: <LayoutDashboard className="size-4" />, active: true },
      { href: '#', label: 'People', icon: <Users className="size-4" />, badge: '12' },
      { href: '#', label: 'Settings', icon: <Settings className="size-4" /> },
    ],
  },
];

export function ThemeShowcase() {
  const [tab, setTab] = useState('overview');
  const [page, setPage] = useState(2);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [notify, setNotify] = useState(false);
  const [switchOn, setSwitchOn] = useState(true);

  return (
    <div className="space-y-8">
      <Section title="Typography" description="One type scale, shared by every brand.">
        <div className="space-y-2 rounded-xl border border-border bg-card p-5">
          <p className="font-display text-3xl font-semibold">The quick brown fox</p>
          <p className="font-display text-xl font-semibold">Section heading</p>
          <p className="text-sm">
            Body text at the default size, with a{' '}
            <a href="#showcase" className="text-primary-strong underline">
              brand-coloured link
            </a>{' '}
            inside it.
          </p>
          <p className="text-sm text-muted-foreground">
            Secondary text, used for descriptions and metadata.
          </p>
          <p className="font-mono text-xs text-muted-foreground">MONO-0123456789</p>
        </div>
      </Section>

      <Section title="Buttons">
        <div className="flex flex-wrap items-center gap-2">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
          <Button disabled>Disabled</Button>
        </div>
      </Section>

      <Section title="Badges">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>Default</Badge>
          <Badge tone="success">Active</Badge>
          <Badge tone="warning">Pending</Badge>
          <Badge tone="danger">Failed</Badge>
          <Badge tone="muted">Archived</Badge>
        </div>
      </Section>

      <Section title="Inputs">
        <div className="grid gap-4 rounded-xl border border-border bg-card p-5 sm:grid-cols-2">
          <Field label="Full name" htmlFor="showcase-name">
            <Input id="showcase-name" placeholder="Amina Haddad" />
          </Field>
          <Field label="Team" htmlFor="showcase-team">
            <Select id="showcase-team" defaultValue="ops">
              <option value="ops">Operations</option>
              <option value="fin">Finance</option>
            </Select>
          </Field>
          <Field label="Required field" error="This field is required." htmlFor="showcase-err">
            <Input id="showcase-err" />
          </Field>
          <div className="flex items-end gap-6">
            <span className="flex items-center gap-2 text-sm">
              <Checkbox defaultChecked aria-label="Send a summary" /> Checkbox
            </span>
            <span className="flex items-center gap-2 text-sm">
              <Switch
                checked={switchOn}
                onCheckedChange={setSwitchOn}
                aria-label="Enable notifications"
              />{' '}
              Switch
            </span>
          </div>
        </div>
      </Section>

      <Section title="Cards">
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Subscription</CardTitle>
              <CardDescription>Standard plan, billed annually.</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Renews on 1 September 2026.
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Engagement</CardTitle>
              <CardDescription>Last thirty days.</CardDescription>
            </CardHeader>
            <CardContent>
              <Sparkline values={[8, 12, 9, 15, 14, 20, 18, 24, 22, 28]} area showLast />
            </CardContent>
          </Card>
        </div>
      </Section>

      <Section title="Navigation" description="Breadcrumb, tabs and pagination.">
        <div className="space-y-4 rounded-xl border border-border bg-card p-5">
          <Breadcrumb
            label="Breadcrumb"
            items={[
              { label: 'Home', href: '#' },
              { label: 'People', href: '#' },
              { label: 'Amina Haddad' },
            ]}
          />
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="activity">Activity</TabsTrigger>
              <TabsTrigger value="settings">Settings</TabsTrigger>
            </TabsList>
            <TabsContent value="overview" className="pt-3 text-sm text-muted-foreground">
              The selected tab is the only panel in the DOM.
            </TabsContent>
            <TabsContent value="activity" className="pt-3 text-sm text-muted-foreground">
              Activity panel.
            </TabsContent>
            <TabsContent value="settings" className="pt-3 text-sm text-muted-foreground">
              Settings panel.
            </TabsContent>
          </Tabs>
          <Pagination page={page} pageCount={8} onPageChange={setPage} />
        </div>
      </Section>

      <Section title="Sidebar">
        <div className="w-64 rounded-xl border border-border bg-card p-3">
          <SidebarNav label="Example" groups={NAV} />
        </div>
      </Section>

      <Section title="Dialogs and notifications">
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => setDialogOpen(true)}>Open dialog</Button>
          <Button variant="outline" onClick={() => setNotify((v) => !v)}>
            Toggle notification
          </Button>
        </div>
        {notify ? (
          <Alert tone="success" title="Changes saved" live="status" className="mt-3">
            The record was updated and everyone on the team was notified.
          </Alert>
        ) : null}
        <Dialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          title="Archive this record?"
          description="It will stop appearing in lists, and can be restored later."
          footer={
            <>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => setDialogOpen(false)}>Archive</Button>
            </>
          }
        >
          <p className="text-sm text-muted-foreground">
            The dialog, its overlay and its focus ring all come from the active theme.
          </p>
        </Dialog>
      </Section>

      <Section title="Alerts">
        <div className="space-y-3">
          <Alert tone="info" title="Scheduled maintenance">
            The service will be briefly unavailable on Sunday.
          </Alert>
          <Alert tone="success" title="Payment received">
            The invoice has been marked as paid.
          </Alert>
          <Alert tone="warning" title="Approaching your plan limit">
            You have used 92% of the included seats.
          </Alert>
          <Alert tone="danger" title="Could not process the payment">
            The card issuer declined the transaction.
          </Alert>
        </div>
      </Section>

      <Section title="DataGrid">
        <DataGrid
          rows={ROWS}
          columns={COLUMNS}
          getRowId={(r) => r.id}
          getRowLabel={(r) => r.name}
          aria-label="Team members"
          selectionMode="multiple"
          selectedIds={['1']}
          onSelectionChange={() => undefined}
        />
      </Section>

      <Section title="Timeline">
        <Timeline className="max-w-md">
          <TimelineItem title="Record archived" meta="System" timestamp="09:41" />
          <TimelineItem
            title="Plan changed to Standard"
            meta="Amina Haddad"
            timestamp="Yesterday"
          />
          <TimelineItem title="Account created" meta="Platform" timestamp="1 Sep 2026" />
        </Timeline>
      </Section>

      <Section title="Empty state">
        <div className="rounded-xl border border-border bg-card">
          <EmptyState
            icon={<Inbox className="size-6" aria-hidden="true" />}
            title="Nothing here yet"
            description="Records you create will appear in this list."
            action={<Button size="sm">Create the first one</Button>}
          />
        </div>
      </Section>
    </div>
  );
}
