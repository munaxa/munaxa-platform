import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Kanban, type KanbanColumn, type KanbanMove } from './kanban.js';
import { Gantt, type GanttTask } from './gantt.js';
import { OrgChart, type OrgNode } from './org-chart.js';
import { Badge } from '../primitives/badge.js';
import { Button } from '../primitives/button.js';
import { Avatar, AvatarFallback } from '../data-display/avatar.js';
import { Container } from '../../layouts/container.js';
import { Stack } from '../../layouts/stack.js';
import { Section } from '../../layouts/page.js';
import { LocaleProvider } from '../../date/index.js';

const meta = {
  title: 'Workspace/Boards & Hierarchies',
  parameters: {
    docs: {
      description: {
        component:
          'The surfaces where work is *arranged* rather than listed.\n\n' +
          '**One drag-and-drop foundation.** `DragDropProvider` wraps dnd-kit with the platform’s ' +
          'sensors and — the part dnd-kit does not ship — live announcements, so an accessible ' +
          'drag is the default rather than something each product remembers to add.\n\n' +
          '**Arrangement here, meaning in the product.** Nothing below knows whether a move is ' +
          'allowed. A WIP limit is displayed, never enforced; `onMove` reports what the user did ' +
          'and the product updates its state, or declines to.\n\n' +
          '**Every one of them is real markup.** The Kanban is sections with headings and lists; ' +
          'the Gantt is a table whose bars are named with their own dates; the org chart is the ' +
          'APG tree with `aria-level`, `aria-setsize` and `aria-posinset`. Each is the component ' +
          'most often shipped as an opaque picture, and a picture conveys nothing to a screen ' +
          'reader.\n\n' +
          '**Keyboard throughout:** Space picks a card up and the arrows move it; the Gantt’s ' +
          'arrows move a task and Shift with them changes its duration; the tree is the full APG ' +
          'pattern including typeahead. Horizontal keys mirror in a right-to-left layout.',
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

interface Task {
  id: string;
  columnId: string;
  title: string;
  assignee: string;
  priority: 'low' | 'normal' | 'high';
}

const BOARD_COLUMNS: KanbanColumn[] = [
  { id: 'backlog', title: 'Backlog', label: 'Backlog' },
  { id: 'ready', title: 'Ready', label: 'Ready', limit: 4 },
  { id: 'doing', title: 'In progress', label: 'In progress', limit: 3 },
  { id: 'done', title: 'Done', label: 'Done' },
];

const INITIAL_TASKS: Task[] = [
  { id: '1', columnId: 'backlog', title: 'Order textbooks', assignee: 'AH', priority: 'normal' },
  { id: '2', columnId: 'backlog', title: 'Audit lab equipment', assignee: 'ZB', priority: 'low' },
  { id: '3', columnId: 'ready', title: 'Book the main hall', assignee: 'CF', priority: 'high' },
  {
    id: '4',
    columnId: 'ready',
    title: 'Publish the term calendar',
    assignee: 'AH',
    priority: 'normal',
  },
  { id: '5', columnId: 'doing', title: 'Draft the timetable', assignee: 'ER', priority: 'high' },
  { id: '6', columnId: 'done', title: 'Confirm bus routes', assignee: 'CF', priority: 'normal' },
];

const PRIORITY = { low: 'muted', normal: 'default', high: 'warning' } as const;

/**
 * Cards move between columns with the pointer or the keyboard. `onMove` reports the move; the
 * board never applies it, which is what makes an optimistic update and a rejected move look the
 * same from here.
 */
export const Board: Story = {
  render: function Board() {
    const [tasks, setTasks] = useState(INITIAL_TASKS);
    const [lastMove, setLastMove] = useState<KanbanMove | null>(null);

    return (
      <Container width="wide" className="py-6">
        <Stack gap={4}>
          <Kanban
            aria-label="Term plan"
            columns={BOARD_COLUMNS}
            items={tasks}
            getItemLabel={(task) => task.title}
            onMove={(move) => {
              setLastMove(move);
              setTasks((current) => {
                const moving = current.find((task) => task.id === move.itemId);
                if (!moving) return current;
                const without = current.filter((task) => task.id !== move.itemId);
                const target = without.filter((task) => task.columnId === move.toColumnId);
                const anchor = target[move.toIndex];
                const at = anchor ? without.indexOf(anchor) : without.length;
                const next = [...without];
                next.splice(at, 0, { ...moving, columnId: move.toColumnId });
                return next;
              });
            }}
            renderCard={(task) => (
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">{task.title}</span>
                <span className="flex items-center gap-2">
                  <Badge tone={PRIORITY[task.priority]}>{task.priority}</Badge>
                  <Avatar size="sm">
                    <AvatarFallback>{task.assignee}</AvatarFallback>
                  </Avatar>
                </span>
              </div>
            )}
          />
          <p className="font-mono text-xs text-muted-foreground">
            last move: {lastMove ? JSON.stringify(lastMove) : '—'}
          </p>
        </Stack>
      </Container>
    );
  },
};

/**
 * A limit is advisory. The board shows the count and flags the breach; whether a card may actually
 * land there is a business rule, so this story simply refuses the move.
 */
export const LimitsAreTheProductsRule: Story = {
  name: 'WIP limits are the product’s rule',
  render: function Limits() {
    const [tasks, setTasks] = useState(INITIAL_TASKS);
    const [rejected, setRejected] = useState<string | null>(null);

    return (
      <Container width="wide" className="py-6">
        <Stack gap={4}>
          <p className="text-sm text-muted-foreground">
            “In progress” is limited to three. Try to add a fourth.
          </p>
          <Kanban
            aria-label="Term plan"
            columns={BOARD_COLUMNS}
            items={tasks}
            getItemLabel={(task) => task.title}
            onMove={(move) => {
              const column = BOARD_COLUMNS.find((entry) => entry.id === move.toColumnId);
              const occupancy = tasks.filter(
                (task) => task.columnId === move.toColumnId && task.id !== move.itemId,
              ).length;
              if (column?.limit !== undefined && occupancy >= column.limit) {
                setRejected(`${column.label} is full.`);
                return;
              }
              setRejected(null);
              setTasks((current) =>
                current.map((task) =>
                  task.id === move.itemId ? { ...task, columnId: move.toColumnId } : task,
                ),
              );
            }}
            renderCard={(task) => <span className="text-sm">{task.title}</span>}
          />
          {rejected ? <p className="text-sm text-destructive">{rejected}</p> : null}
        </Stack>
      </Container>
    );
  },
};

const PROGRAMME: GanttTask[] = [
  { id: '1', name: 'Survey', start: '2026-04-01', end: '2026-04-07', group: 'Design', progress: 1 },
  {
    id: '2',
    name: 'Drawings',
    start: '2026-04-06',
    end: '2026-04-20',
    group: 'Design',
    progress: 0.6,
  },
  {
    id: '3',
    name: 'Strip out',
    start: '2026-04-13',
    end: '2026-04-24',
    group: 'Site',
    progress: 0.3,
  },
  { id: '4', name: 'Fit out east wing', start: '2026-04-20', end: '2026-05-15', group: 'Site' },
  {
    id: '5',
    name: 'Install network',
    start: '2026-05-04',
    end: '2026-05-12',
    group: 'Site',
    tone: 'warning',
  },
  {
    id: '6',
    name: 'Snagging',
    start: '2026-05-18',
    end: '2026-05-22',
    group: 'Site',
    tone: 'danger',
  },
  {
    id: '7',
    name: 'Handover',
    start: '2026-05-25',
    end: '2026-05-25',
    milestone: true,
    tone: 'success',
  },
];

export const Schedule: Story = {
  render: function Schedule() {
    const [tasks, setTasks] = useState(PROGRAMME);
    const [scale, setScale] = useState<'day' | 'week' | 'month'>('week');

    return (
      <Container width="wide" className="py-6">
        <Stack gap={4}>
          <Section
            title="Refurbishment programme"
            description="Focus a bar and use the arrow keys to move it, Shift with them to change its duration."
          >
            <div className="mb-3 flex gap-2">
              {(['day', 'week', 'month'] as const).map((option) => (
                <Button
                  key={option}
                  variant={scale === option ? 'default' : 'outline'}
                  onClick={() => setScale(option)}
                >
                  {option}
                </Button>
              ))}
            </div>
            <Gantt
              aria-label="Refurbishment programme"
              locale="en-GB"
              tasks={tasks}
              scale={scale}
              unitWidth={scale === 'day' ? 28 : scale === 'week' ? 56 : 96}
              onTaskChange={(change) =>
                setTasks((current) =>
                  current.map((task) =>
                    task.id === change.taskId
                      ? { ...task, start: change.start, end: change.end }
                      : task,
                  ),
                )
              }
              renderTaskMeta={(task) =>
                task.progress === undefined ? null : (
                  <Badge tone="muted">{Math.round(task.progress * 100)}%</Badge>
                )
              }
            />
          </Section>
        </Stack>
      </Container>
    );
  },
};

/** The axis is drawn by the Phase 7 date engine, so a different calendar needs no change here. */
export const ScheduleInAnotherLocale: Story = {
  name: 'Schedule, right to left',
  render: function ScheduleRtl() {
    return (
      <LocaleProvider locale="ar-JO">
        <div dir="rtl">
          <Container width="wide" className="py-6">
            <Gantt aria-label="البرنامج" tasks={PROGRAMME} scale="week" unitWidth={56} />
          </Container>
        </div>
      </LocaleProvider>
    );
  },
};

interface Person extends OrgNode {
  role: string;
  initials: string;
}

const PEOPLE: Person[] = [
  { id: '1', label: 'Nadia Faris', role: 'Principal', initials: 'NF', parentId: null },
  { id: '2', label: 'Omar Khalil', role: 'Head of Science', initials: 'OK', parentId: '1' },
  { id: '3', label: 'Petra Novak', role: 'Head of Arts', initials: 'PN', parentId: '1' },
  { id: '4', label: 'Yusuf Aziz', role: 'Bursar', initials: 'YA', parentId: '1' },
  { id: '5', label: 'Rami Odeh', role: 'Physics', initials: 'RO', parentId: '2' },
  { id: '6', label: 'Lina Haddad', role: 'Chemistry', initials: 'LH', parentId: '2' },
  { id: '7', label: 'Tomas Berg', role: 'Music', initials: 'TB', parentId: '3' },
];

export const Hierarchy: Story = {
  render: function Hierarchy() {
    const [selected, setSelected] = useState<string>();
    return (
      <Container width="wide" className="py-6">
        <Stack gap={4}>
          <Section
            title="Reporting lines"
            description="Tab in once, then arrows to move, left and right to collapse and expand, and type a letter to jump."
          >
            <OrgChart<Person>
              aria-label="Reporting lines"
              nodes={PEOPLE}
              {...(selected === undefined ? {} : { selectedId: selected })}
              onSelect={(person) => setSelected(person.id)}
              renderNode={(person, { childCount }) => (
                <span className="flex items-center gap-2">
                  <Avatar size="sm">
                    <AvatarFallback>{person.initials}</AvatarFallback>
                  </Avatar>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{person.label}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {person.role}
                      {childCount > 0 ? ` · ${childCount}` : ''}
                    </span>
                  </span>
                </span>
              )}
            />
          </Section>
        </Stack>
      </Container>
    );
  },
};

/** The same tree running left to right, which suits a deep hierarchy in a narrow column. */
export const HierarchyHorizontal: Story = {
  name: 'Hierarchy, horizontal',
  render: function HierarchyHorizontal() {
    return (
      <Container width="content" className="py-6">
        <OrgChart<Person>
          aria-label="Reporting lines"
          nodes={PEOPLE}
          orientation="horizontal"
          renderNode={(person) => (
            <span className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium">{person.label}</span>
              <span className="text-xs text-muted-foreground">{person.role}</span>
            </span>
          )}
        />
      </Container>
    );
  },
};
