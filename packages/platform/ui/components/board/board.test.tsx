import { describe, expect, it, vi } from 'vitest';
import { render, renderHook, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Kanban, type KanbanColumn } from './kanban.js';
import { useDragAnnouncements } from './dnd.js';
import { Gantt, buildGanttAxis } from './gantt.js';
import { OrgChart, buildTree } from './org-chart.js';
import { gregorianAdapter, createDateFormatter, LocaleProvider } from '../../date/index.js';
import { expectNoA11yViolations } from '../../../test/setup.js';

interface Card {
  id: string;
  columnId: string;
  title: string;
}

const COLUMNS: KanbanColumn[] = [
  { id: 'todo', title: 'To do', label: 'To do' },
  { id: 'doing', title: 'Doing', label: 'Doing', limit: 2 },
  { id: 'done', title: 'Done', label: 'Done' },
];

const CARDS: Card[] = [
  { id: 'a', columnId: 'todo', title: 'Order textbooks' },
  { id: 'b', columnId: 'todo', title: 'Book the hall' },
  { id: 'c', columnId: 'doing', title: 'Draft the timetable' },
];

describe('Kanban', () => {
  function Board(props: Partial<Parameters<typeof Kanban<Card>>[0]> = {}) {
    return (
      <Kanban
        aria-label="Term plan"
        columns={COLUMNS}
        items={CARDS}
        getItemLabel={(item) => item.title}
        renderCard={(item) => <span>{item.title}</span>}
        {...props}
      />
    );
  }

  it('is a set of sections with real headings, not a wall of divs', () => {
    render(<Board />);
    for (const column of ['To do', 'Doing', 'Done']) {
      expect(screen.getByRole('heading', { name: column, level: 3 })).toBeInTheDocument();
      expect(screen.getByRole('region', { name: column })).toBeInTheDocument();
    }
  });

  it('puts each card in its own column', () => {
    render(<Board />);
    const todo = screen.getByRole('region', { name: 'To do' });
    expect(within(todo).getByText('Order textbooks')).toBeInTheDocument();
    expect(within(todo).queryByText('Draft the timetable')).not.toBeInTheDocument();
  });

  it('shows the count against the limit without enforcing it', () => {
    // Three cards in a column limited to two: the board flags it and still renders them, because
    // whether that is allowed is the product's rule, not the board's.
    const over = [...CARDS, { id: 'd', columnId: 'doing', title: 'Chase suppliers' }];
    render(<Board items={over} />);
    const doing = screen.getByRole('region', { name: 'Doing' });
    expect(within(doing).getByText('2 / 2')).toBeInTheDocument();
    expect(within(doing).getByText('Chase suppliers')).toBeInTheDocument();
  });

  it('gives every card a named drag handle', () => {
    render(<Board />);
    expect(screen.getByRole('button', { name: 'Move Order textbooks' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Move Draft the timetable' })).toBeInTheDocument();
  });

  it('publishes screen-reader instructions for the drag', () => {
    render(<Board />);
    expect(screen.getByText(/Press Space or Enter to pick up/)).toBeInTheDocument();
  });

  /**
   * The drag lifecycle itself is dnd-kit's, and it needs a real layout box to run — happy-dom has
   * none, so driving it here would test the DOM shim. What the platform owns is the announcements,
   * which dnd-kit does not supply at all, so those are asserted directly.
   */
  it('announces every step of a drag by name, not by id', () => {
    const { result } = renderHook(() =>
      useDragAnnouncements((id) => CARDS.find((card) => card.id === id)?.title ?? id, undefined),
    );
    const { announcements } = result.current;
    const active = { active: { id: 'a' }, over: { id: 'c' } } as never;

    expect(announcements.onDragStart?.(active)).toBe('Picked up Order textbooks.');
    expect(announcements.onDragOver?.(active)).toBe('Order textbooks is over Draft the timetable.');
    expect(announcements.onDragEnd?.(active)).toBe(
      'Order textbooks was dropped on Draft the timetable.',
    );
    expect(announcements.onDragCancel?.(active)).toBe('Moving Order textbooks was cancelled.');
  });

  it('lets a product translate the announcements', () => {
    const { result } = renderHook(() =>
      useDragAnnouncements(undefined, { onDragStart: (id) => `Rammt ${id}` }),
    );
    expect(result.current.announcements.onDragStart?.({ active: { id: 'a' } } as never)).toBe(
      'Rammt a',
    );
  });

  it('has no drag handles when read-only', () => {
    render(<Board readOnly />);
    expect(screen.queryByRole('button', { name: /^Move / })).not.toBeInTheDocument();
    expect(screen.getByText('Order textbooks')).toBeInTheDocument();
  });

  it('shows an empty column as empty rather than as nothing', () => {
    render(<Board />);
    const done = screen.getByRole('region', { name: 'Done' });
    expect(within(done).getByText('Nothing here')).toBeInTheDocument();
  });

  it('has no accessibility violations', async () => {
    const { container } = render(<Board />);
    await expectNoA11yViolations(container);
  });
});

describe('Gantt', () => {
  const TASKS = [
    { id: '1', name: 'Fit out east wing', start: '2026-04-03', end: '2026-04-12', group: 'Site' },
    { id: '2', name: 'Install network', start: '2026-04-08', end: '2026-04-10', group: 'Site' },
    { id: '3', name: 'Handover', start: '2026-04-14', end: '2026-04-14', milestone: true },
  ];

  function Chart(props: Partial<Parameters<typeof Gantt>[0]> = {}) {
    return <Gantt aria-label="Programme" locale="en-GB" tasks={TASKS} {...props} />;
  }

  it('is a table with one row per task and the name as its row header', () => {
    render(<Chart />);
    expect(screen.getByRole('rowheader', { name: /Fit out east wing/ })).toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: /Install network/ })).toBeInTheDocument();
  });

  it('names every bar with its own dates, so a picture is not the only information', () => {
    render(<Chart />);
    expect(
      screen.getByRole('button', { name: 'Fit out east wing, 3 Apr 2026 to 12 Apr 2026' }),
    ).toBeInTheDocument();
  });

  it('groups tasks under a heading row', () => {
    render(<Chart />);
    expect(screen.getByRole('columnheader', { name: 'Site' })).toBeInTheDocument();
  });

  it('is read-only until onTaskChange is given', async () => {
    const user = userEvent.setup();
    render(<Chart />);
    const bar = screen.getByRole('button', { name: /Fit out east wing/ });
    bar.focus();
    await user.keyboard('{ArrowRight}');
    // Nothing to assert against but the absence of a crash and of a description.
    expect(bar).not.toHaveAccessibleDescription();
  });

  it('moves a task with the arrows and resizes it with Shift', async () => {
    const onTaskChange = vi.fn();
    const user = userEvent.setup();
    render(<Chart onTaskChange={onTaskChange} />);
    const bar = screen.getByRole('button', { name: /Fit out east wing/ });
    bar.focus();

    await user.keyboard('{ArrowRight}');
    expect(onTaskChange).toHaveBeenLastCalledWith({
      taskId: '1',
      start: '2026-04-04',
      end: '2026-04-13',
    });

    await user.keyboard('{Shift>}{ArrowRight}{/Shift}');
    // Shift moves the end only — the start is untouched.
    expect(onTaskChange).toHaveBeenLastCalledWith({
      taskId: '1',
      start: '2026-04-03',
      end: '2026-04-13',
    });
  });

  it('refuses to drag an end date past its start', async () => {
    const onTaskChange = vi.fn();
    const user = userEvent.setup();
    render(<Chart tasks={[TASKS[2]!]} onTaskChange={onTaskChange} />);
    screen.getByRole('button', { name: /Handover/ }).focus();
    await user.keyboard('{Shift>}{ArrowLeft}{/Shift}');
    expect(onTaskChange).not.toHaveBeenCalled();
  });

  it('describes the keyboard editing once, on the bars that support it', () => {
    render(<Chart onTaskChange={() => {}} />);
    expect(screen.getByRole('button', { name: /Fit out east wing/ })).toHaveAccessibleDescription(
      /arrow keys to move this task/,
    );
  });

  it('renders an empty state rather than a bare axis', () => {
    render(<Chart tasks={[]} />);
    expect(screen.getByText('Nothing scheduled')).toBeInTheDocument();
  });

  it('has no accessibility violations', async () => {
    const { container } = render(<Chart onTaskChange={() => {}} />);
    await expectNoA11yViolations(container);
  });

  describe('the time axis', () => {
    const formatter = createDateFormatter({ locale: 'en-GB' });
    const start = gregorianAdapter.fromISO('2026-04-01');

    it('gives one column per day at day scale', () => {
      const columns = buildGanttAxis(gregorianAdapter, start, 10, 'day', formatter);
      expect(columns).toHaveLength(10);
      expect(columns.every((column) => column.days === 1)).toBe(true);
      expect(columns[0]?.label).toBe('1');
    });

    it('groups by real month lengths, not by dividing the range', () => {
      // 1 April plus 45 days crosses into May; April has 30 days and the split must land there.
      const columns = buildGanttAxis(gregorianAdapter, start, 45, 'month', formatter);
      expect(columns).toHaveLength(2);
      expect(columns[0]?.days).toBe(30);
      expect(columns[0]?.label).toBe('April 2026');
      expect(columns[1]?.days).toBe(15);
    });

    it('covers exactly the requested number of days at every scale', () => {
      for (const scale of ['day', 'week', 'month'] as const) {
        const columns = buildGanttAxis(gregorianAdapter, start, 45, scale, formatter);
        expect(columns.reduce((total, column) => total + column.days, 0)).toBe(45);
      }
    });
  });
});

describe('OrgChart', () => {
  const PEOPLE = [
    { id: '1', label: 'Nadia Faris', parentId: null },
    { id: '2', label: 'Omar Khalil', parentId: '1' },
    { id: '3', label: 'Petra Novak', parentId: '1' },
    { id: '4', label: 'Rami Odeh', parentId: '2' },
  ];

  function Chart(props: Partial<Parameters<typeof OrgChart<(typeof PEOPLE)[number]>>[0]> = {}) {
    return <OrgChart aria-label="Reporting lines" nodes={PEOPLE} {...props} />;
  }

  it('is an APG tree, with levels and set positions that carry the hierarchy', () => {
    render(<Chart />);
    const tree = screen.getByRole('tree', { name: 'Reporting lines' });
    expect(tree).toBeInTheDocument();

    const root = screen.getByRole('treeitem', { name: /Nadia Faris/ });
    expect(root).toHaveAttribute('aria-level', '1');
    expect(root).toHaveAttribute('aria-expanded', 'true');

    const child = screen.getByRole('treeitem', { name: /Omar Khalil/ });
    expect(child).toHaveAttribute('aria-level', '2');
    expect(child).toHaveAttribute('aria-posinset', '1');
    expect(child).toHaveAttribute('aria-setsize', '2');
  });

  it('counts direct reports', () => {
    render(<Chart />);
    expect(screen.getByText('2 direct reports')).toBeInTheDocument();
    expect(screen.getByText('1 direct report')).toBeInTheDocument();
  });

  it('has exactly one tab stop', () => {
    const { container } = render(<Chart />);
    expect(container.querySelectorAll('[data-node][tabindex="0"]')).toHaveLength(1);
  });

  it('walks visible nodes with the up and down arrows', async () => {
    const user = userEvent.setup();
    const { container } = render(<Chart />);
    const node = (label: string) =>
      container.querySelector(`[data-node="${PEOPLE.find((p) => p.label === label)?.id}"]`);

    await user.tab();
    await waitFor(() => expect(node('Nadia Faris')).toHaveFocus());
    await user.keyboard('{ArrowDown}');
    await waitFor(() => expect(node('Omar Khalil')).toHaveFocus());
    await user.keyboard('{ArrowDown}');
    await waitFor(() => expect(node('Rami Odeh')).toHaveFocus());
    await user.keyboard('{ArrowUp}');
    await waitFor(() => expect(node('Omar Khalil')).toHaveFocus());
  });

  it('collapses with the back arrow and expands with the forward one', async () => {
    const user = userEvent.setup();
    const { container } = render(<Chart />);
    await user.tab();
    await user.keyboard('{ArrowDown}');
    await waitFor(() => expect(container.querySelector('[data-node="2"]')).toHaveFocus());

    await user.keyboard('{ArrowLeft}');
    await waitFor(() =>
      expect(screen.getByRole('treeitem', { name: /Omar Khalil/ })).toHaveAttribute(
        'aria-expanded',
        'false',
      ),
    );
    // Its child is no longer in the tree at all.
    expect(screen.queryByRole('treeitem', { name: /Rami Odeh/ })).not.toBeInTheDocument();

    await user.keyboard('{ArrowRight}');
    await waitFor(() =>
      expect(screen.getByRole('treeitem', { name: /Rami Odeh/ })).toBeInTheDocument(),
    );
  });

  it('jumps to a node by typing its first letter', async () => {
    const user = userEvent.setup();
    const { container } = render(<Chart />);
    await user.tab();
    await user.keyboard('p');
    await waitFor(() => expect(container.querySelector('[data-node="3"]')).toHaveFocus());
  });

  it('selects with Enter', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    const { container } = render(<Chart onSelect={onSelect} />);
    await user.tab();
    await user.keyboard('{ArrowDown}');
    await waitFor(() => expect(container.querySelector('[data-node="2"]')).toHaveFocus());
    await user.keyboard('{Enter}');
    expect(onSelect).toHaveBeenCalledWith(PEOPLE[1]);
  });

  it('follows the writing direction for the horizontal keys', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <LocaleProvider locale="ar-JO" direction="rtl">
        <div dir="rtl">
          <Chart />
        </div>
      </LocaleProvider>,
    );
    await user.tab();
    await user.keyboard('{ArrowDown}');
    await waitFor(() => expect(container.querySelector('[data-node="2"]')).toHaveFocus());
    // In a right-to-left tree the branches grow leftwards, so ArrowRight collapses.
    await user.keyboard('{ArrowRight}');
    await waitFor(() =>
      expect(screen.getByRole('treeitem', { name: /Omar Khalil/ })).toHaveAttribute(
        'aria-expanded',
        'false',
      ),
    );
  });

  it('has no accessibility violations', async () => {
    const { container } = render(<Chart />);
    await expectNoA11yViolations(container);
  });

  describe('buildTree', () => {
    it('assembles a flat list into a forest', () => {
      const roots = buildTree(PEOPLE);
      expect(roots).toHaveLength(1);
      expect(roots[0]?.children.map((child) => child.node.label)).toEqual([
        'Omar Khalil',
        'Petra Novak',
      ]);
      expect(roots[0]?.children[0]?.depth).toBe(1);
    });

    it('keeps orphans as roots instead of dropping them', () => {
      // A query scoped to one department will not contain the director it reports to.
      const roots = buildTree([{ id: '9', label: 'Sara Nasser', parentId: 'missing' }]);
      expect(roots.map((root) => root.node.label)).toEqual(['Sara Nasser']);
    });

    it('survives a cycle in the data rather than looping forever', () => {
      const roots = buildTree([
        { id: 'x', label: 'X', parentId: 'y' },
        { id: 'y', label: 'Y', parentId: 'x' },
      ]);
      // Neither is a root by `parentId`, so nothing renders — but nothing hangs either.
      expect(roots).toHaveLength(0);
    });
  });
});
