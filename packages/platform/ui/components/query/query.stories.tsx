import { useMemo, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { FilterBuilder } from './filter-builder.js';
import { SearchBuilder, emptySearchQuery, type SearchQuery } from './search-builder.js';
import {
  countConditions,
  emptyFilter,
  pruneFilter,
  type FilterField,
  type FilterGroup,
} from './types.js';
import { Button } from '../primitives/button.js';
import { DataGrid } from '../data-grid/data-grid.js';
import type { ColumnDef } from '../data-grid/types.js';
import { Container } from '../../layouts/container.js';
import { Stack } from '../../layouts/stack.js';
import { Section } from '../../layouts/page.js';

const meta = {
  title: 'Workspace/Query Builders',
  parameters: {
    docs: {
      description: {
        component:
          'One condition model, two surfaces, and nothing product-specific in either.\n\n' +
          '`FilterBuilder` is the editor — nested groups of `field operator value`. `SearchBuilder` ' +
          'is the bar a product puts above a grid: free text, the editor in a popover, and removable ' +
          'chips for what is applied. It **composes** the builder rather than inventing a query ' +
          'syntax, so there is one model to serialise, one to validate, and one for users to learn.\n\n' +
          '**`FilterField[]` is the only product input, and it is data.** School filtering students ' +
          'and Work filtering timesheets are the same components with different fields — no branch ' +
          'for either, and nothing to change when a third product arrives.\n\n' +
          '**The value is JSON.** A `FilterGroup` survives `JSON.stringify`, which is what makes a ' +
          'saved view, a shareable URL and a server-side query all speak the same thing.\n\n' +
          '**Editing and applying are separate.** Only complete conditions leave the editor, via ' +
          '`pruneFilter`. A half-typed clause stays visible so it can be finished, and never reaches ' +
          'a query where it would silently filter everything away.',
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** School's fields. */
const SCHOOL_FIELDS: FilterField[] = [
  { id: 'name', label: 'Student name', type: 'text' },
  { id: 'grade', label: 'Grade', type: 'number', hint: '1–12' },
  { id: 'enrolledOn', label: 'Enrolled on', type: 'date' },
  {
    id: 'status',
    label: 'Status',
    type: 'select',
    options: [
      { value: 'active', label: 'Active' },
      { value: 'left', label: 'Left' },
      { value: 'pending', label: 'Pending' },
    ],
  },
  { id: 'boarder', label: 'Boarder', type: 'boolean' },
];

/** Work's fields — a different product, the same components, no code in common to change. */
const WORK_FIELDS: FilterField[] = [
  { id: 'project', label: 'Project', type: 'text' },
  { id: 'hours', label: 'Hours', type: 'number' },
  { id: 'week', label: 'Week ending', type: 'date' },
  {
    id: 'billable',
    label: 'Billable',
    type: 'select',
    options: [
      { value: 'yes', label: 'Billable' },
      { value: 'no', label: 'Non-billable' },
    ],
  },
];

export const Builder: Story = {
  render: function Builder() {
    const [value, setValue] = useState<FilterGroup>(emptyFilter());
    const applied = useMemo(() => pruneFilter(value), [value]);

    return (
      <Container width="content" className="py-6">
        <Stack gap={4}>
          <Section
            title="Advanced filter"
            description="Nested groups. Each is a fieldset, so its combinator is announced on entry."
          >
            <FilterBuilder fields={SCHOOL_FIELDS} value={value} onChange={setValue} />
          </Section>
          <Section
            title="What would be applied"
            description={`${countConditions(applied)} complete condition(s) — the rest stay in the editor.`}
          >
            <pre className="overflow-x-auto rounded-lg bg-muted p-3 font-mono text-xs">
              {JSON.stringify(applied, null, 2)}
            </pre>
          </Section>
        </Stack>
      </Container>
    );
  },
};

/** The same component, a different product's fields, and no change to the component. */
export const GenericAcrossProducts: Story = {
  name: 'The same builder, two products',
  render: function GenericAcrossProducts() {
    const [school, setSchool] = useState<FilterGroup>(emptyFilter());
    const [work, setWork] = useState<FilterGroup>(emptyFilter());
    return (
      <Container width="wide" className="py-6">
        <Stack gap={6}>
          <Section title="School" description="Students by grade, status, enrolment date.">
            <FilterBuilder fields={SCHOOL_FIELDS} value={school} onChange={setSchool} />
          </Section>
          <Section title="Work" description="Timesheets by project, hours, billability.">
            <FilterBuilder fields={WORK_FIELDS} value={work} onChange={setWork} />
          </Section>
        </Stack>
      </Container>
    );
  },
};

interface Student {
  id: string;
  name: string;
  grade: number;
  status: 'active' | 'left' | 'pending';
  boarder: boolean;
}

const STUDENTS: Student[] = Array.from({ length: 60 }, (_, index) => ({
  id: String(index + 1),
  name: `Student ${String(index + 1).padStart(3, '0')}`,
  grade: (index % 12) + 1,
  status: (['active', 'left', 'pending'] as const)[index % 3] as Student['status'],
  boarder: index % 4 === 0,
}));

const STUDENT_COLUMNS: ColumnDef<Student>[] = [
  { id: 'name', header: 'Name', value: (row) => row.name, sortable: true, rowHeader: true },
  { id: 'grade', header: 'Grade', value: (row) => row.grade, sortable: true, align: 'end' },
  { id: 'status', header: 'Status', value: (row) => row.status, sortable: true },
  { id: 'boarder', header: 'Boarder', value: (row) => row.boarder },
];

/**
 * The bar above a grid, which is what this is actually for.
 *
 * Evaluating the filter is the *product's* job — the platform never runs a query. The tiny evaluator
 * below is the story's own, and a real product would send the same JSON to a server instead.
 */
export const SearchBar: Story = {
  render: function SearchBar() {
    const [query, setQuery] = useState<SearchQuery>(emptySearchQuery());

    const rows = useMemo(() => {
      const text = query.text.trim().toLowerCase();
      return STUDENTS.filter((student) => {
        if (text && !student.name.toLowerCase().includes(text)) return false;
        return matches(student, query.filter);
      });
    }, [query]);

    return (
      <Container width="wide" className="py-6">
        <Stack gap={3}>
          <SearchBuilder
            fields={SCHOOL_FIELDS}
            value={query}
            onChange={setQuery}
            actions={<Button variant="outline">Save view</Button>}
          />
          <DataGrid
            aria-label="Students"
            rows={rows}
            columns={STUDENT_COLUMNS}
            getRowId={(row) => row.id}
            getRowLabel={(row) => row.name}
            searchable={false}
            columnMenu={false}
          />
        </Stack>
      </Container>
    );
  },
};

/** A saved view is just the value. This one starts from one. */
export const FromASavedView: Story = {
  render: function FromASavedView() {
    const saved: FilterGroup = {
      id: 'root',
      kind: 'group',
      combinator: 'and',
      children: [
        { id: 'c1', kind: 'condition', fieldId: 'status', operator: 'in', value: ['active'] },
        { id: 'c2', kind: 'condition', fieldId: 'grade', operator: 'gte', value: 9 },
      ],
    };
    const [query, setQuery] = useState<SearchQuery>({ text: '', filter: saved });
    return (
      <Container width="wide" className="py-6">
        <Stack gap={3}>
          <SearchBuilder fields={SCHOOL_FIELDS} value={query} onChange={setQuery} />
          <pre className="overflow-x-auto rounded-lg bg-muted p-3 font-mono text-xs">
            {JSON.stringify(query, null, 2)}
          </pre>
        </Stack>
      </Container>
    );
  },
};

/** A minimal client-side evaluator, purely so the story's grid reacts. Not part of the platform. */
function matches(student: Student, filter: FilterGroup | null): boolean {
  if (!filter) return true;
  const results = filter.children.map((child) => {
    if (child.kind === 'group') return matches(student, child);
    const actual = student[child.fieldId as keyof Student];
    switch (child.operator) {
      case 'contains':
        return String(actual).toLowerCase().includes(String(child.value).toLowerCase());
      case 'eq':
        return String(actual) === String(child.value);
      case 'ne':
        return String(actual) !== String(child.value);
      case 'gt':
        return Number(actual) > Number(child.value);
      case 'gte':
        return Number(actual) >= Number(child.value);
      case 'lt':
        return Number(actual) < Number(child.value);
      case 'lte':
        return Number(actual) <= Number(child.value);
      case 'between':
        return Number(actual) >= Number(child.value) && Number(actual) <= Number(child.valueTo);
      case 'in':
        return Array.isArray(child.value) && child.value.map(String).includes(String(actual));
      case 'notIn':
        return Array.isArray(child.value) && !child.value.map(String).includes(String(actual));
      default:
        return true;
    }
  });
  return filter.combinator === 'and' ? results.every(Boolean) : results.some(Boolean);
}
