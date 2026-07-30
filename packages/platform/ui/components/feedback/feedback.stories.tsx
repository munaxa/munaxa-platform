import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Spinner } from './spinner.js';
import { EmptyState } from './empty-state.js';
import { ErrorState } from './error-state.js';
import { Tooltip } from './tooltip.js';
import { Drawer } from './drawer.js';
import { ToastProvider, useToast } from './toast.js';
import { Button } from '../primitives/button.js';
import { Inbox } from '../../../icons/index.js';

/**
 * The feedback family: the components that tell the user the system is working, has nothing to
 * show, has failed, or has something to say. They share one rule — the *meaning* is always in
 * text, never in colour or motion alone, so the message survives for anyone who cannot perceive
 * either.
 */
const meta = {
  title: 'Feedback/Overview',
  parameters: {
    docs: {
      description: {
        component:
          'Spinner, EmptyState, ErrorState, Tooltip, Drawer and the toast system. Switch the ' +
          'toolbar to dark or RTL to confirm each one holds up in both.',
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Loading: Story = {
  render: () => (
    <div className="flex items-center gap-2 text-muted-foreground">
      <Spinner /> Loading…
    </div>
  ),
};

export const Empty: Story = {
  render: () => (
    <EmptyState
      icon={<Inbox className="size-6" aria-hidden="true" />}
      title="No students yet"
      description="Admit a student and they will appear here."
      action={<Button size="sm">Admit student</Button>}
    />
  ),
};

/** A failure the user can act on — with a reference id they can quote to support. */
export const Failed: Story = {
  render: () => (
    <ErrorState
      title="Could not load the roster"
      description="The request timed out. Retrying usually resolves it."
      referenceId="req_9f2a1c"
      action={
        <Button size="sm" variant="outline">
          Retry
        </Button>
      }
    />
  ),
};

export const Tooltips: Story = {
  render: () => (
    <div className="flex gap-6">
      <Tooltip content="Export the current view as CSV">
        <Button variant="outline" size="sm">
          Export
        </Button>
      </Tooltip>
      <Tooltip content="مطابقة الهوية بالرقم الوطني" side="bottom">
        <Button variant="outline" size="sm">
          Identity
        </Button>
      </Tooltip>
    </div>
  ),
};

export const DrawerFromTheSide: Story = {
  render: function DrawerStory() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <Button onClick={() => setOpen(true)}>Open drawer</Button>
        <Drawer
          open={open}
          onClose={() => setOpen(false)}
          title="Filters"
          footer={
            <Button size="sm" onClick={() => setOpen(false)}>
              Apply
            </Button>
          }
        >
          <p className="text-sm text-muted-foreground">
            A drawer slides from the inline-end edge, so it opens from the right in LTR and the left
            in RTL without any change here.
          </p>
        </Drawer>
      </>
    );
  },
};

export const Toasts: Story = {
  render: () => (
    <ToastProvider>
      <ToastButtons />
    </ToastProvider>
  ),
};

function ToastButtons() {
  const toast = useToast();
  return (
    <div className="flex gap-2">
      <Button size="sm" variant="outline" onClick={() => toast.success('Student admitted')}>
        Success
      </Button>
      <Button size="sm" variant="outline" onClick={() => toast.error('Could not save changes')}>
        Error
      </Button>
    </div>
  );
}
