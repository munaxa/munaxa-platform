import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './tabs.js';
import { Pagination } from './pagination.js';

/**
 * Navigation within a screen: tabs that switch a panel, and pagination that walks a page window.
 * Both are keyboard-first and direction-aware — the arrow keys on the tab strip and the
 * previous/next controls on the pager follow the writing direction, so RTL is not a special case.
 */
const meta = {
  title: 'Navigation/Overview',
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const TabbedPanels: Story = {
  render: function TabsStory() {
    const [tab, setTab] = useState('overview');
    return (
      <Tabs value={tab} onValueChange={setTab} className="max-w-md">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="finance">Finance</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="pt-3 text-sm text-muted-foreground">
          The selected tab is the only panel in the DOM — arrow keys move between triggers, and the
          panel is labelled by its trigger.
        </TabsContent>
        <TabsContent value="finance" className="pt-3 text-sm text-muted-foreground">
          Finance panel.
        </TabsContent>
        <TabsContent value="documents" className="pt-3 text-sm text-muted-foreground">
          Documents panel.
        </TabsContent>
      </Tabs>
    );
  },
};

/** The page-level set: a rule under the row and a brand bar under the selected section. */
export const UnderlineTabs: Story = {
  render: function UnderlineTabsStory() {
    const [tab, setTab] = useState('overview');
    return (
      <Tabs value={tab} onValueChange={setTab} variant="underline" className="max-w-xl">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="approvals">Approvals</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="pt-3 text-sm text-muted-foreground">
          Overview panel.
        </TabsContent>
        <TabsContent value="approvals" className="pt-3 text-sm text-muted-foreground">
          Approvals panel.
        </TabsContent>
        <TabsContent value="history" className="pt-3 text-sm text-muted-foreground">
          History panel.
        </TabsContent>
      </Tabs>
    );
  },
};

export const Pager: Story = {
  render: function PagerStory() {
    const [page, setPage] = useState(3);
    return <Pagination page={page} pageCount={12} onPageChange={setPage} />;
  },
};
