'use client';

import { useId, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '../../lib/cn.js';
import { EmptyState } from '../feedback/empty-state.js';
import { Skeleton } from '../feedback/skeleton.js';
import {
  addDays,
  compareDates,
  isSameDay,
  toDayNumber,
  useDateSystem,
  type CalendarAdapter,
  type CalendarDate,
} from '../../date/index.js';

export type GanttScale = 'day' | 'week' | 'month';

export interface GanttTask {
  id: string;
  name: string;
  /** Wire format — `YYYY-MM-DD`. Inclusive of both ends. */
  start: string;
  end: string;
  /** 0–1. Draws a fill inside the bar. */
  progress?: number;
  /** Ids of tasks that must finish first. Drawn as connectors. */
  dependencies?: string[];
  /** Group heading this task sits under — a phase, a workstream, a team. */
  group?: string;
  /** A zero-length task, drawn as a diamond. */
  milestone?: boolean;
  tone?: 'default' | 'success' | 'warning' | 'danger';
}

export interface GanttChange {
  taskId: string;
  start: string;
  end: string;
}

export interface GanttLabels {
  task?: string;
  timeline?: string;
  empty?: string;
  /** Accessible name for a bar — the visible bar is a coloured rectangle and nothing else. */
  bar?: (task: GanttTask, start: string, end: string) => string;
  today?: string;
  moveInstructions?: string;
}

const DEFAULT_LABELS: Required<GanttLabels> = {
  task: 'Task',
  timeline: 'Timeline',
  empty: 'Nothing scheduled',
  bar: (task, start, end) => `${task.name}, ${start} to ${end}`,
  today: 'Today',
  moveInstructions:
    'Use the arrow keys to move this task, and Shift with the arrow keys to change its end date.',
};

const TONE = {
  default: 'bg-primary text-primary-foreground',
  success: 'bg-success text-background',
  warning: 'bg-warning text-background',
  danger: 'bg-destructive text-background',
} as const;

export interface GanttProps {
  tasks: GanttTask[];
  /** Visible window. Derived from the tasks when omitted. Wire format. */
  range?: { start: string; end: string };
  scale?: GanttScale;
  /** Column width in pixels for one unit of the scale. */
  unitWidth?: number;
  rowHeight?: number;
  /**
   * Reports a moved or resized task. Omit it and the chart is read-only — which is what most
   * Gantts in a business application actually are.
   */
  onTaskChange?: (change: GanttChange) => void;
  /** Extra content in each task's row header — an avatar, a status badge. */
  renderTaskMeta?: (task: GanttTask) => ReactNode;
  onTaskActivate?: (task: GanttTask) => void;
  locale?: string;
  adapter?: CalendarAdapter;
  timeZone?: string;
  loading?: boolean;
  labels?: GanttLabels;
  className?: string;
  'aria-label'?: string;
}

/**
 * A schedule: tasks as bars along a time axis.
 *
 * **It is a table.** Not a canvas, not a stack of absolutely positioned divs — a real `<table>`
 * where each row is a task and each bar is named with its own dates. A Gantt is the component most
 * often shipped as an unreadable picture, and the fix is not `aria-label` on a wrapper: it is that
 * every row is a row, every task name is a row header, and every bar says "Fit out east wing,
 * 3 April 2026 to 12 April 2026" when you land on it.
 *
 * **The time axis comes from the platform's date engine.** Positions are computed from day numbers,
 * never from `Date` arithmetic, and every label is formatted through the same `DateFormatter` the
 * pickers use — so a Gantt inside a `LocaleProvider` with a Hijri adapter is drawn against Hijri
 * months without this file knowing what a month is.
 *
 * **Editing is optional and keyboard-first.** With `onTaskChange`, the arrows move a task and Shift
 * with the arrows changes its duration. There is no drag-only path, because a schedule that can
 * only be edited with a mouse is one half the team cannot edit.
 */
export function Gantt({
  tasks,
  range,
  scale = 'day',
  unitWidth = 36,
  rowHeight = 36,
  onTaskChange,
  renderTaskMeta,
  onTaskActivate,
  locale,
  adapter: adapterProp,
  timeZone,
  loading = false,
  labels,
  className,
  ...rest
}: GanttProps) {
  const text = { ...DEFAULT_LABELS, ...labels };
  const system = useDateSystem({ locale, adapter: adapterProp, timeZone });
  const { adapter, formatter } = system;
  const generatedId = useId();
  const [focusedTask, setFocusedTask] = useState<string | null>(null);

  const today = useMemo(() => adapter.today(timeZone), [adapter, timeZone]);

  /** The window the chart draws, padded so a bar never touches the edge. */
  const window = useMemo(() => {
    if (range) return { start: adapter.fromISO(range.start), end: adapter.fromISO(range.end) };
    if (tasks.length === 0) return { start: today, end: addDays(adapter, today, 13) };
    let start = adapter.fromISO(tasks[0]?.start ?? '');
    let end = adapter.fromISO(tasks[0]?.end ?? '');
    for (const task of tasks) {
      const taskStart = adapter.fromISO(task.start);
      const taskEnd = adapter.fromISO(task.end);
      if (compareDates(adapter, taskStart, start) < 0) start = taskStart;
      if (compareDates(adapter, taskEnd, end) > 0) end = taskEnd;
    }
    return { start: addDays(adapter, start, -1), end: addDays(adapter, end, 1) };
  }, [range, tasks, adapter, today]);

  const dayCount = toDayNumber(adapter, window.end) - toDayNumber(adapter, window.start) + 1;

  /** Column boundaries for the chosen scale, as offsets in days from the window start. */
  const columns = useMemo(
    () => buildColumns(adapter, window.start, dayCount, scale, formatter),
    [adapter, window.start, dayCount, scale, formatter],
  );

  const grouped = useMemo(() => groupTasks(tasks), [tasks]);
  const offsetOf = (iso: string) =>
    toDayNumber(adapter, adapter.fromISO(iso)) - toDayNumber(adapter, window.start);

  function onKeyDown(event: KeyboardEvent<HTMLElement>, task: GanttTask) {
    if (!onTaskChange) return;
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();

    const start = adapter.fromISO(task.start);
    const end = adapter.fromISO(task.end);
    // Shift changes the duration; on its own the task moves and keeps its length.
    const next = event.shiftKey
      ? { start, end: addDays(adapter, end, step) }
      : { start: addDays(adapter, start, step), end: addDays(adapter, end, step) };
    if (compareDates(adapter, next.end, next.start) < 0) return;

    onTaskChange({
      taskId: task.id,
      start: adapter.toISO(next.start),
      end: adapter.toISO(next.end),
    });
  }

  const chartWidth = columns.reduce((total, column) => total + column.days * unitWidth, 0);
  const todayOffset = isWithinWindow(adapter, today, window)
    ? (toDayNumber(adapter, today) - toDayNumber(adapter, window.start)) * unitWidth
    : null;

  if (!loading && tasks.length === 0) {
    return <EmptyState title={text.empty} {...(className === undefined ? {} : { className })} />;
  }

  return (
    <div className={cn('overflow-x-auto rounded-xl border border-border', className)}>
      <table
        className="w-full border-collapse text-sm"
        {...(rest['aria-label'] === undefined ? {} : { 'aria-label': rest['aria-label'] })}
      >
        <thead className="sticky top-0 z-sticky bg-muted">
          <tr>
            <th
              scope="col"
              className="sticky start-0 z-sticky w-56 min-w-56 bg-muted px-3 py-2 text-start font-medium"
            >
              {text.task}
            </th>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                colSpan={1}
                style={{ width: column.days * unitWidth, minWidth: column.days * unitWidth }}
                className="border-s border-border px-1 py-2 text-center text-xs font-normal text-muted-foreground"
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {loading
            ? Array.from({ length: 5 }, (_, row) => (
                <tr key={row} className="border-t border-border">
                  <td className="px-3 py-2">
                    <Skeleton className="h-4 w-40" />
                  </td>
                  <td colSpan={columns.length} className="px-3 py-2">
                    <Skeleton className="h-4 w-full" />
                  </td>
                </tr>
              ))
            : grouped.map(([group, groupTaskList]) => (
                <GroupRows
                  key={group ?? '__ungrouped'}
                  group={group}
                  tasks={groupTaskList}
                  columnCount={columns.length}
                  chartWidth={chartWidth}
                  rowHeight={rowHeight}
                  unitWidth={unitWidth}
                  offsetOf={offsetOf}
                  todayOffset={todayOffset}
                  todayLabel={text.today}
                  barLabel={(task) =>
                    text.bar(
                      task,
                      formatter.formatISO(task.start, 'medium'),
                      formatter.formatISO(task.end, 'medium'),
                    )
                  }
                  editable={Boolean(onTaskChange)}
                  instructions={text.moveInstructions}
                  instructionsId={`${generatedId}-instructions`}
                  focusedTask={focusedTask}
                  onFocusTask={setFocusedTask}
                  onKeyDown={onKeyDown}
                  {...(onTaskActivate === undefined ? {} : { onTaskActivate })}
                  {...(renderTaskMeta === undefined ? {} : { renderTaskMeta })}
                />
              ))}
        </tbody>
      </table>

      {onTaskChange ? (
        <span id={`${generatedId}-instructions`} className="sr-only">
          {text.moveInstructions}
        </span>
      ) : null}
    </div>
  );
}

function GroupRows({
  group,
  tasks,
  columnCount,
  chartWidth,
  rowHeight,
  unitWidth,
  offsetOf,
  todayOffset,
  todayLabel,
  barLabel,
  editable,
  instructionsId,
  focusedTask,
  onFocusTask,
  onKeyDown,
  onTaskActivate,
  renderTaskMeta,
}: {
  group: string | undefined;
  tasks: GanttTask[];
  columnCount: number;
  chartWidth: number;
  rowHeight: number;
  unitWidth: number;
  offsetOf: (iso: string) => number;
  todayOffset: number | null;
  todayLabel: string;
  barLabel: (task: GanttTask) => string;
  editable: boolean;
  instructions?: string;
  instructionsId: string;
  focusedTask: string | null;
  onFocusTask: (id: string | null) => void;
  onKeyDown: (event: KeyboardEvent<HTMLElement>, task: GanttTask) => void;
  onTaskActivate?: (task: GanttTask) => void;
  renderTaskMeta?: (task: GanttTask) => ReactNode;
}) {
  return (
    <>
      {group ? (
        <tr className="border-t border-border bg-muted/40">
          <th
            scope="colgroup"
            colSpan={columnCount + 1}
            className="px-3 py-1.5 text-start text-xs font-semibold uppercase tracking-wide text-muted-foreground"
          >
            {group}
          </th>
        </tr>
      ) : null}

      {tasks.map((task) => {
        const start = offsetOf(task.start);
        const span = Math.max(1, offsetOf(task.end) - start + 1);
        return (
          <tr key={task.id} className="border-t border-border hover:bg-muted/30">
            <th
              scope="row"
              className="sticky start-0 z-base bg-background px-3 py-1 text-start font-normal"
              style={{ height: rowHeight }}
            >
              <span className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate">{task.name}</span>
                {renderTaskMeta?.(task)}
              </span>
            </th>

            <td colSpan={columnCount} className="relative p-0" style={{ height: rowHeight }}>
              <div className="relative h-full" style={{ width: chartWidth }}>
                {todayOffset !== null ? (
                  <span
                    aria-hidden="true"
                    title={todayLabel}
                    className="absolute inset-y-0 w-px bg-primary-strong/40"
                    style={{ insetInlineStart: todayOffset }}
                  />
                ) : null}

                <button
                  type="button"
                  // The bar is a button whether or not it is editable: it is how a keyboard user
                  // reaches the task's dates at all, and a bar that cannot be focused is a bar a
                  // screen reader never reads.
                  aria-label={barLabel(task)}
                  {...(editable ? { 'aria-describedby': instructionsId } : {})}
                  onFocus={() => onFocusTask(task.id)}
                  onBlur={() => onFocusTask(null)}
                  onKeyDown={(event) => onKeyDown(event, task)}
                  onClick={() => onTaskActivate?.(task)}
                  className={cn(
                    'absolute top-1/2 flex -translate-y-1/2 items-center overflow-hidden rounded-md text-xs',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    task.milestone ? 'size-4 rotate-45 rounded-sm' : 'h-5 justify-start px-1.5',
                    TONE[task.tone ?? 'default'],
                    focusedTask === task.id && 'ring-2 ring-ring',
                  )}
                  style={{
                    insetInlineStart: start * unitWidth + (task.milestone ? unitWidth / 2 - 8 : 2),
                    ...(task.milestone ? {} : { width: span * unitWidth - 4 }),
                  }}
                >
                  {task.milestone ? null : (
                    <>
                      {task.progress !== undefined ? (
                        <span
                          aria-hidden="true"
                          className="absolute inset-y-0 start-0 bg-background/30"
                          style={{ width: `${Math.round(task.progress * 100)}%` }}
                        />
                      ) : null}
                      <span className="relative truncate">{task.name}</span>
                    </>
                  )}
                </button>
              </div>
            </td>
          </tr>
        );
      })}
    </>
  );
}

interface AxisColumn {
  key: string;
  label: string;
  /** How many days this column covers. */
  days: number;
}

/**
 * The time axis.
 *
 * Built by walking days and grouping them, rather than by dividing the range: months are not the
 * same length, weeks straddle month boundaries, and a chart whose columns are `range / 12` puts
 * every label in the wrong place by a day or two — the sort of error that is invisible until
 * someone plans against it.
 */
function buildColumns(
  adapter: CalendarAdapter,
  start: CalendarDate,
  dayCount: number,
  scale: GanttScale,
  formatter: {
    format(date: CalendarDate, style?: 'short' | 'medium'): string;
    formatMonth(date: CalendarDate): string;
  },
): AxisColumn[] {
  if (scale === 'day') {
    return Array.from({ length: dayCount }, (_, index) => {
      const date = addDays(adapter, start, index);
      return { key: adapter.toISO(date), label: String(date.day), days: 1 };
    });
  }

  const columns: AxisColumn[] = [];
  for (let index = 0; index < dayCount; index += 1) {
    const date = addDays(adapter, start, index);
    const key =
      scale === 'month'
        ? `${date.year}-${date.month}`
        : String(Math.floor((toDayNumber(adapter, date) + 3) / 7));
    const last = columns[columns.length - 1];
    if (last?.key === key) last.days += 1;
    else {
      columns.push({
        key,
        label: scale === 'month' ? formatter.formatMonth(date) : formatter.format(date, 'short'),
        days: 1,
      });
    }
  }
  return columns;
}

/** Group in first-appearance order so the row order stays stable. */
function groupTasks(tasks: GanttTask[]): Array<[string | undefined, GanttTask[]]> {
  const groups = new Map<string | undefined, GanttTask[]>();
  for (const task of tasks) {
    const existing = groups.get(task.group);
    if (existing) existing.push(task);
    else groups.set(task.group, [task]);
  }
  return [...groups.entries()];
}

function isWithinWindow(
  adapter: CalendarAdapter,
  date: CalendarDate,
  window: { start: CalendarDate; end: CalendarDate },
): boolean {
  return (
    compareDates(adapter, date, window.start) >= 0 && compareDates(adapter, date, window.end) <= 0
  );
}

/** Exported for tests and for products that need the same axis under a custom renderer. */
export { buildColumns as buildGanttAxis, isSameDay as isSameGanttDay };
