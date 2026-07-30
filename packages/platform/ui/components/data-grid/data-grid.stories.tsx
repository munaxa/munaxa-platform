import { useMemo, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { DataGrid } from './data-grid.js';
import type { ColumnDef, DataGridState } from './types.js';
import { Badge } from '../primitives/badge.js';
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

interface Employee {
  id: string;
  name: string;
  department: string;
  role: string;
  salary: number;
  status: 'active' | 'leave' | 'ended';
  startedOn: string;
}

const DEPARTMENTS = ['Science', 'Arts', 'Sport', 'Administration', 'Facilities'];
const ROLES = ['Teacher', 'Coordinator', 'Assistant', 'Head'];
const STATUSES: Employee['status'][] = ['active', 'leave', 'ended'];

function makeRows(count: number): Employee[] {
  return Array.from({ length: count }, (_, index) => ({
    id: String(index + 1),
    name: `Employee ${String(index + 1).padStart(4, '0')}`,
    department: DEPARTMENTS[index % DEPARTMENTS.length] as string,
    role: ROLES[index % ROLES.length] as string,
    salary: 600 + ((index * 37) % 1400),
    status: STATUSES[index % 3] as Employee['status'],
    startedOn: `20${String(18 + (index % 8)).padStart(2, '0')}-0${(index % 9) + 1}-1${index % 9}`,
  }));
}

const SMALL = makeRows(24);
const LARGE = makeRows(50_000);

const TONE = { active: 'success', leave: 'warning', ended: 'muted' } as const;

const COLUMNS: ColumnDef<Employee>[] = [
  {
    id: 'name',
    header: 'Name',
    value: (row) => row.name,
    sortable: true,
    rowHeader: true,
    width: 180,
    resizable: true,
  },
  { id: 'department', header: 'Department', value: (row) => row.department, sortable: true },
  { id: 'role', header: 'Role', value: (row) => row.role, sortable: true },
  {
    id: 'status',
    header: 'Status',
    // Sorts by the word behind the badge, not by the badge.
    value: (row) => row.status,
    sortable: true,
    width: 120,
    cell: (row) => <Badge tone={TONE[row.status]}>{row.status}</Badge>,
  },
  {
    id: 'salary',
    header: 'Salary',
    value: (row) => row.salary,
    sortable: true,
    align: 'end',
    width: 120,
    resizable: true,
    cell: (row) => <span className="font-mono">{row.salary.toLocaleString()} JOD</span>,
  },
  {
    id: 'startedOn',
    header: 'Started',
    value: (row) => row.startedOn,
    sortable: true,
    defaultHidden: true,
  },
];

const meta = {
  title: 'Data/DataGrid',
  parameters: {
    docs: {
      description: {
        component:
          'The enterprise grid: large datasets, keyboard navigation, selection, column resizing ' +
          'and visibility, sticky headers, and server-side data.\n\n' +
          '**It does not replace `Table`.** `Table` is right for a dozen rows of static content and ' +
          'stays. This is the one that windows fifty thousand rows and has to be driven from a ' +
          'keyboard.\n\n' +
          '**Real table semantics.** A `<table role="grid">` with `aria-rowcount` and ' +
          '`aria-rowindex`, so a screen reader announces "row 4,201 of 50,000" over a forty-row ' +
          'window — the counts describe the dataset, not the DOM.\n\n' +
          '**Keyboard:** one tab stop in, then arrows move a cell, Home/End the row, Ctrl+Home and ' +
          'Ctrl+End the grid, PageUp/PageDown a viewport, Space selects a row, Enter enters a ' +
          "cell's control (or activates the row), Escape backs out of it.\n\n" +
          '**Client or server.** `mode="server"` turns off local sorting, searching and slicing and ' +
          'reports state changes instead. The props are otherwise identical.',
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: function Default() {
    return (
      <Container width="wide" className="py-6">
        <DataGrid
          aria-label="Employees"
          rows={SMALL}
          columns={COLUMNS}
          getRowId={(row) => row.id}
          getRowLabel={(row) => row.name}
        />
      </Container>
    );
  },
};

/** Fifty thousand rows, a bounded height, and about forty of them in the DOM at a time. */
export const Virtualized: Story = {
  render: function Virtualized() {
    return (
      <Container width="wide" className="py-6">
        <DataGrid
          aria-label="Employees"
          rows={LARGE}
          columns={COLUMNS}
          getRowId={(row) => row.id}
          getRowLabel={(row) => row.name}
          height="60vh"
          paginated={false}
        />
      </Container>
    );
  },
};

/** Selection, inline actions, and an extra toolbar control. */
export const SelectionAndActions: Story = {
  render: function SelectionAndActions() {
    const [selected, setSelected] = useState<string[]>(['1', '3']);
    return (
      <Container width="wide" className="py-6">
        <DataGrid
          aria-label="Employees"
          rows={SMALL}
          columns={COLUMNS}
          getRowId={(row) => row.id}
          getRowLabel={(row) => row.name}
          selectionMode="multiple"
          selectedIds={selected}
          onSelectionChange={setSelected}
          onRowActivate={(row) => window.alert(`Open ${row.name}`)}
          toolbarActions={
            <Button variant="outline" disabled={selected.length === 0}>
              Export {selected.length || ''}
            </Button>
          }
          rowActions={(row) => (
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label={`Actions for ${row.name}`}
                className="rounded-md p-1 hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <MoreHorizontal className="size-4" aria-hidden="true" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem>Open</DropdownMenuItem>
                <DropdownMenuItem>Duplicate</DropdownMenuItem>
                <DropdownMenuItem>Archive</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        />
      </Container>
    );
  },
};

/**
 * `mode="server"` does no local work. The grid reports every state change; here the "query" is a
 * synchronous slice, but the shape is exactly what a real request would use.
 */
export const ServerSide: Story = {
  render: function ServerSide() {
    const [state, setState] = useState<DataGridState>({
      sort: null,
      search: '',
      page: 1,
      pageSize: 25,
      hiddenColumns: [],
      columnWidths: {},
    });

    const { page, matched } = useMemo(() => {
      const query = state.search.trim().toLowerCase();
      const filtered = query
        ? LARGE.filter((row) => row.name.toLowerCase().includes(query))
        : LARGE;
      const sorted = state.sort
        ? [...filtered].sort((a, b) => {
            const key = state.sort?.columnId as keyof Employee;
            const order = String(a[key]).localeCompare(String(b[key]), undefined, {
              numeric: true,
            });
            return state.sort?.direction === 'asc' ? order : -order;
          })
        : filtered;
      const start = (state.page - 1) * state.pageSize;
      return { page: sorted.slice(start, start + state.pageSize), matched: sorted.length };
    }, [state]);

    return (
      <Container width="wide" className="py-6">
        <Stack gap={3}>
          <DataGrid
            aria-label="Employees"
            mode="server"
            rows={page}
            rowCount={matched}
            state={state}
            onStateChange={setState}
            columns={COLUMNS}
            getRowId={(row) => row.id}
            getRowLabel={(row) => row.name}
          />
          <pre className="overflow-x-auto rounded-lg bg-muted p-3 font-mono text-xs">
            {JSON.stringify(state, null, 2)}
          </pre>
        </Stack>
      </Container>
    );
  },
};

/** Loading and empty, which are most of what a real screen shows. */
export const States: Story = {
  render: function States() {
    return (
      <Container width="wide" className="py-6">
        <Stack gap={8}>
          <DataGrid
            aria-label="Loading"
            rows={[]}
            columns={COLUMNS}
            getRowId={(row) => row.id}
            loading
          />
          <DataGrid aria-label="Empty" rows={[]} columns={COLUMNS} getRowId={(row) => row.id} />
        </Stack>
      </Container>
    );
  },
};
