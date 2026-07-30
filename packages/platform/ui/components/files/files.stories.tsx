import { useMemo, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Dropzone, formatFileSize } from './dropzone.js';
import { FileManager, type FileNode } from './file-manager.js';
import { Button } from '../primitives/button.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../overlays/dropdown-menu.js';
import { MoreHorizontal } from '../../../icons/index.js';
import { Container } from '../../layouts/container.js';
import { Stack } from '../../layouts/stack.js';
import { Section } from '../../layouts/page.js';

const meta = {
  title: 'Workspace/Files',
  parameters: {
    docs: {
      description: {
        component:
          '**Storage-agnostic, and that is the whole design.** Nothing here fetches, uploads, signs ' +
          'a URL or knows a storage backend. `Dropzone` hands over raw `File` objects; `FileManager` ' +
          'renders the folder it was given and reports navigation and selection by id. What happens ' +
          'next — S3, a signed upload, a document API, an in-memory form — is the product’s.\n\n' +
          '**The dropzone is a real button.** Drag is inherently a pointer gesture, so the keyboard ' +
          'path has to be a genuine focusable control or there is no way in at all.\n\n' +
          '**The list view is the platform’s `DataGrid`.** Sorting, keyboard cell navigation, ' +
          'selection and the sticky header already exist and are already tested; a second table ' +
          'inside a file browser would be a second set of the same bugs. The path is the platform’s ' +
          '`Breadcrumb`.\n\n' +
          '**Folders sort before files** whatever the active sort, because that is what makes a deep ' +
          'tree navigable.',
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

interface Tree {
  [folderId: string]: FileNode[];
}

const TREE: Tree = {
  root: [
    { id: 'policies', name: 'Policies', kind: 'folder' },
    { id: 'reports', name: 'Reports', kind: 'folder' },
    { id: 'r1', name: 'Safeguarding.pdf', kind: 'file', size: 284_100, modifiedAt: '2026-03-18' },
    {
      id: 'r2',
      name: 'Governors minutes.docx',
      kind: 'file',
      size: 41_200,
      modifiedAt: '2026-04-02',
    },
  ],
  policies: [
    { id: 'p1', name: 'Admissions.pdf', kind: 'file', size: 132_500, modifiedAt: '2026-01-11' },
    { id: 'p2', name: 'Attendance.pdf', kind: 'file', size: 98_300, modifiedAt: '2026-02-27' },
  ],
  reports: [
    { id: 'q1', name: 'Term 1', kind: 'folder' },
    {
      id: 'q2',
      name: 'Inspection 2026.pdf',
      kind: 'file',
      size: 1_942_000,
      modifiedAt: '2026-04-10',
    },
  ],
  q1: [{ id: 's1', name: 'Attainment.xlsx', kind: 'file', size: 22_400, modifiedAt: '2026-01-30' }],
};

const NAMES: Record<string, string> = {
  root: 'Documents',
  policies: 'Policies',
  reports: 'Reports',
  q1: 'Term 1',
};

export const Browser: Story = {
  render: function Browser() {
    const [stack, setStack] = useState<string[]>(['root']);
    const [view, setView] = useState<'list' | 'grid'>('list');
    const [selected, setSelected] = useState<string[]>([]);
    const [uploaded, setUploaded] = useState<string[]>([]);

    const current = stack[stack.length - 1] as string;
    const items = TREE[current] ?? [];

    const path = useMemo(
      () =>
        stack.map((id, index) => ({
          label: NAMES[id] ?? id,
          // The last crumb is the current folder, and is deliberately not a link.
          ...(index === stack.length - 1 ? {} : { href: `#${id}` }),
        })),
      [stack],
    );

    return (
      <Container width="wide" className="py-6">
        <Stack gap={4}>
          <FileManager
            aria-label="Documents"
            locale="en-GB"
            items={items}
            path={path}
            view={view}
            onViewChange={setView}
            selectedIds={selected}
            onSelectionChange={setSelected}
            onNavigate={(item) => {
              setStack((current) => [...current, item.id]);
              setSelected([]);
            }}
            onOpen={(item) => window.alert(`Open ${item.name}`)}
            onUpload={(files) => setUploaded(files.map((file) => file.name))}
            uploadOptions={{
              accept: '.pdf,.docx,.xlsx',
              maxSize: 5 * 1024 * 1024,
              labels: { hint: 'PDF, Word or Excel, up to 5 MB' },
            }}
            toolbarActions={
              <>
                {stack.length > 1 ? (
                  <Button variant="outline" onClick={() => setStack((s) => s.slice(0, -1))}>
                    Up
                  </Button>
                ) : null}
                <Button variant="outline" disabled={selected.length === 0}>
                  Delete {selected.length || ''}
                </Button>
              </>
            }
            itemActions={(item) => (
              <DropdownMenu>
                <DropdownMenuTrigger
                  aria-label={`Actions for ${item.name}`}
                  className="rounded-md p-1 hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <MoreHorizontal className="size-4" aria-hidden="true" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem>Rename</DropdownMenuItem>
                  <DropdownMenuItem>Download</DropdownMenuItem>
                  <DropdownMenuItem>Delete</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          />
          <p className="font-mono text-xs text-muted-foreground">
            last upload handed to the product: {uploaded.join(', ') || '—'}
          </p>
        </Stack>
      </Container>
    );
  },
};

export const GridView: Story = {
  render: function GridView() {
    const [selected, setSelected] = useState<string[]>(['policies']);
    return (
      <Container width="wide" className="py-6">
        <FileManager
          aria-label="Documents"
          locale="en-GB"
          view="grid"
          items={TREE.root ?? []}
          path={[{ label: 'Documents' }]}
          selectedIds={selected}
          onSelectionChange={setSelected}
          onViewChange={() => {}}
        />
      </Container>
    );
  },
};

export const States: Story = {
  render: function States() {
    return (
      <Container width="wide" className="py-6">
        <Stack gap={8}>
          <Section title="Loading">
            <FileManager aria-label="Loading" items={[]} path={[{ label: 'Documents' }]} loading />
          </Section>
          <Section title="Empty folder">
            <FileManager aria-label="Empty" items={[]} path={[{ label: 'Documents' }]} />
          </Section>
          <Section title="Read only" description="No upload handler, so no dropzone.">
            <FileManager
              aria-label="Read only"
              locale="en-GB"
              items={TREE.policies ?? []}
              path={[{ label: 'Documents', href: '#' }, { label: 'Policies' }]}
            />
          </Section>
        </Stack>
      </Container>
    );
  },
};

/** The dropzone on its own, including how a rejection is reported. */
export const Upload: Story = {
  render: function Upload() {
    const [accepted, setAccepted] = useState<File[]>([]);
    const [rejected, setRejected] = useState<string[]>([]);
    return (
      <Container width="content" className="py-6">
        <Stack gap={4}>
          <Dropzone
            accept=".pdf,image/*"
            maxSize={512 * 1024}
            maxFiles={3}
            onFiles={(files) => setAccepted(files)}
            onReject={(rejections) =>
              setRejected(rejections.map((entry) => `${entry.file.name} (${entry.reason})`))
            }
            labels={{ hint: 'PDF or an image, up to 512 KB, three at a time' }}
          />
          {accepted.length > 0 ? (
            <ul className="list-none text-sm">
              {accepted.map((file) => (
                <li key={file.name} className="flex justify-between gap-4">
                  <span>{file.name}</span>
                  <span className="font-mono text-muted-foreground">
                    {formatFileSize(file.size, 'en-GB')}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          {rejected.length > 0 ? (
            <p className="text-sm text-destructive">Rejected: {rejected.join(', ')}</p>
          ) : null}
        </Stack>
      </Container>
    );
  },
};
