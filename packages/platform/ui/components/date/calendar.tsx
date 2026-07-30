'use client';

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { cn } from '../../lib/cn.js';
import { ChevronLeft, ChevronRight } from '../../../icons/index.js';
import {
  addDays,
  clampDate,
  compareDates,
  dayOfWeek,
  endOfMonth,
  isSameDay,
  isSameMonth,
  isWithin,
  monthGrid,
  startOfMonth,
  useDateSystem,
  type CalendarAdapter,
  type CalendarDate,
  type DateRange,
  type Weekday,
} from '../../date/index.js';

export interface CalendarLabels {
  previousMonth?: string;
  nextMonth?: string;
  /** Column heading for the week-number column. */
  weekNumber?: string;
  /** Appended to a day's accessible name when it is today. */
  today?: string;
  /** Appended when the day is the start or the end of a selected range. */
  rangeStart?: string;
  rangeEnd?: string;
}

const DEFAULT_LABELS: Required<CalendarLabels> = {
  previousMonth: 'Previous month',
  nextMonth: 'Next month',
  weekNumber: 'Week',
  today: 'Today',
  rangeStart: 'Start of range',
  rangeEnd: 'End of range',
};

interface CalendarCommonProps {
  /** Earliest selectable date, in the wire format. */
  min?: string;
  max?: string;
  /** Veto individual dates — holidays, blackout days. Receives the wire-format value. */
  isDateDisabled?: (iso: string) => boolean;
  /** Two months side by side is the usual range-picking layout. */
  numberOfMonths?: 1 | 2;
  showWeekNumbers?: boolean;
  /** Override the enclosing `LocaleProvider` for this calendar only. */
  locale?: string;
  adapter?: CalendarAdapter;
  weekStartsOn?: Weekday;
  timeZone?: string;
  labels?: CalendarLabels;
  /** Which month to show before anything is selected. Wire format. */
  defaultMonth?: string;
  /** Move focus into the grid on mount. Off by default: a calendar in a page must not grab focus. */
  autoFocus?: boolean;
  className?: string;
  id?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
}

export type CalendarProps = CalendarCommonProps &
  (
    | { mode?: 'single'; value?: string | null; onChange?: (value: string) => void }
    | { mode: 'range'; value?: DateRange | null; onChange?: (value: DateRange) => void }
  );

/**
 * A month grid for choosing a date or a range.
 *
 * **Calendar-agnostic.** Nothing below knows what a month is called, how many days it has or how
 * many months are in a year — all of that is asked of the adapter and the formatter from
 * `ui/date`. Handing it `adapter={hijriAdapter}` renders a Hijri year with Hijri month lengths and
 * Hijri month names, and the values it emits are unchanged, because selection is reported in the
 * wire format. That is the whole point of the layering.
 *
 * **Keyboard.** The APG grid pattern: one roving tab stop, arrows move a day, Home and End the
 * week, PageUp/PageDown a month, Shift+PageUp/PageDown a year, Enter or Space selects. The
 * horizontal arrows follow the *writing direction*, so in Arabic ArrowLeft moves forward — matching
 * the direction the days visibly run, which is what a user's hand expects.
 *
 * **Six rows, always.** A month spans four to six week-rows, and a grid that changed height as you
 * paged would move the next-month button out from under the pointer that was clicking it.
 */
export function Calendar(props: CalendarProps) {
  const {
    min,
    max,
    isDateDisabled,
    numberOfMonths = 1,
    showWeekNumbers = false,
    locale,
    adapter: adapterProp,
    weekStartsOn: weekStartsOnProp,
    timeZone,
    labels,
    defaultMonth,
    autoFocus = false,
    className,
    ...rest
  } = props;

  const text = { ...DEFAULT_LABELS, ...labels };
  const system = useDateSystem({
    locale,
    adapter: adapterProp,
    weekStartsOn: weekStartsOnProp,
    timeZone,
  });
  const { adapter, formatter, weekStartsOn, direction } = system;

  const generatedId = useId();
  const gridId = rest.id ?? generatedId;
  const gridRef = useRef<HTMLDivElement>(null);
  const focusPending = useRef(autoFocus);

  const selection = readSelection(props, adapter);
  const today = useMemo(() => adapter.today(timeZone), [adapter, timeZone]);
  const minDate = useMemo(() => (min ? adapter.fromISO(min) : null), [adapter, min]);
  const maxDate = useMemo(() => (max ? adapter.fromISO(max) : null), [adapter, max]);

  const initialFocus =
    selection.start ?? (defaultMonth ? adapter.fromISO(defaultMonth) : null) ?? today;
  const [focused, setFocused] = useState<CalendarDate>(() =>
    clampDate(adapter, initialFocus, minDate, maxDate),
  );
  /** The month in the leftmost pane. Focus pulls it along rather than the other way round. */
  const [cursor, setCursor] = useState<CalendarDate>(() => startOfMonth(focused));
  /** Second endpoint being previewed while a range is half-chosen. */
  const [preview, setPreview] = useState<CalendarDate | null>(null);

  const months = useMemo(
    () => Array.from({ length: numberOfMonths }, (_, index) => adapter.addMonths(cursor, index)),
    [adapter, cursor, numberOfMonths],
  );

  // Keep the focused day visible. Paging with PageUp only changes `focused`; the pane follows.
  useEffect(() => {
    const first = months[0] as CalendarDate;
    const last = months[months.length - 1] as CalendarDate;
    if (compareDates(adapter, focused, startOfMonth(first)) < 0) {
      setCursor(startOfMonth(focused));
    } else if (compareDates(adapter, focused, endOfMonth(adapter, last)) > 0) {
      setCursor(startOfMonth(adapter.addMonths(focused, -(numberOfMonths - 1))));
    }
  }, [adapter, focused, months, numberOfMonths]);

  // Move DOM focus only when the grid already owns it, or when the caller asked on mount.
  //
  // The flag survives a render where the target is not there yet. Paging with PageDown moves the
  // focused day out of the displayed month, and the pane only catches up on the *next* commit — so
  // on this pass there is no day carrying the tab stop. Clearing the flag regardless would drop
  // focus to the body and silently end keyboard navigation after a single page.
  useEffect(() => {
    if (!focusPending.current) return;
    const target = gridRef.current?.querySelector<HTMLElement>('[data-day][tabindex="0"]');
    if (!target) return;
    focusPending.current = false;
    target.focus();
  });

  function isDisabled(date: CalendarDate): boolean {
    if (!isWithin(adapter, date, minDate, maxDate)) return true;
    return isDateDisabled ? isDateDisabled(adapter.toISO(date)) : false;
  }

  function moveFocus(next: CalendarDate) {
    const target = clampDate(adapter, next, minDate, maxDate);
    setFocused(target);
    focusPending.current = true;
  }

  function select(date: CalendarDate) {
    if (isDisabled(date)) return;
    setFocused(date);

    if (props.mode === 'range') {
      const { start, end } = selection;
      // A completed range restarts from the clicked day; a half-made one completes, swapping ends
      // if the user picked backwards — which is a normal way to choose a range, not a mistake.
      const next: DateRange =
        !start || end
          ? { start: adapter.toISO(date), end: null }
          : compareDates(adapter, date, start) < 0
            ? { start: adapter.toISO(date), end: adapter.toISO(start) }
            : { start: adapter.toISO(start), end: adapter.toISO(date) };
      setPreview(null);
      props.onChange?.(next);
      return;
    }
    props.onChange?.(adapter.toISO(date));
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const forward = direction === 'rtl' ? -1 : 1;
    const key = event.key;

    const handlers: Record<string, () => CalendarDate> = {
      ArrowRight: () => addDays(adapter, focused, forward),
      ArrowLeft: () => addDays(adapter, focused, -forward),
      ArrowDown: () => addDays(adapter, focused, 7),
      ArrowUp: () => addDays(adapter, focused, -7),
      Home: () => addDays(adapter, focused, -weekOffset(focused)),
      End: () => addDays(adapter, focused, 6 - weekOffset(focused)),
      PageUp: () =>
        event.shiftKey ? adapter.addYears(focused, -1) : adapter.addMonths(focused, -1),
      PageDown: () =>
        event.shiftKey ? adapter.addYears(focused, 1) : adapter.addMonths(focused, 1),
    };

    const handler = handlers[key];
    if (handler) {
      event.preventDefault();
      moveFocus(handler());
      return;
    }
    if (key === 'Enter' || key === ' ') {
      event.preventDefault();
      select(focused);
    }
  }

  /** Days from the start of the displayed week — Home/End need it, and it moves with `weekStartsOn`. */
  function weekOffset(date: CalendarDate): number {
    return (dayOfWeek(adapter, date) - weekStartsOn + 7) % 7;
  }

  const weekdayNames = useMemo(() => formatter.weekdayNames('short'), [formatter]);
  const weekdayLongNames = useMemo(() => formatter.weekdayNames('long'), [formatter]);

  const paging = {
    previous: adapter.addMonths(cursor, -1),
    next: adapter.addMonths(cursor, 1),
  };
  const canPageBack =
    !minDate || compareDates(adapter, endOfMonth(adapter, paging.previous), minDate) >= 0;
  const canPageForward =
    !maxDate ||
    compareDates(adapter, startOfMonth(adapter.addMonths(cursor, numberOfMonths)), maxDate) <= 0;

  return (
    <div
      className={cn('inline-block select-none text-sm', className)}
      {...(rest['aria-label'] === undefined ? {} : { 'aria-label': rest['aria-label'] })}
      {...(rest['aria-labelledby'] === undefined
        ? {}
        : { 'aria-labelledby': rest['aria-labelledby'] })}
      role="group"
      id={gridId}
    >
      <div className="mb-2 flex items-center justify-between gap-2 px-1">
        <NavButton
          label={text.previousMonth}
          disabled={!canPageBack}
          onClick={() => setCursor(paging.previous)}
          direction={direction}
          back
        />
        {/*
          One live region for the whole header. Announcing the month on change is what tells a
          screen-reader user that PageDown did anything — without it, paging is silent.
        */}
        <div aria-live="polite" className="flex flex-1 justify-around gap-4 font-medium">
          {months.map((month) => (
            <span key={`${month.year}-${month.month}`} id={`${gridId}-caption-${month.month}`}>
              {formatter.formatMonth(month)}
            </span>
          ))}
        </div>
        <NavButton
          label={text.nextMonth}
          disabled={!canPageForward}
          onClick={() => setCursor(paging.next)}
          direction={direction}
        />
      </div>

      <div
        ref={gridRef}
        className="flex gap-4"
        onKeyDown={onKeyDown}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setPreview(null);
        }}
      >
        {months.map((month) => {
          const weeks = monthGrid(adapter, month, weekStartsOn);
          return (
            <table
              key={`${month.year}-${month.month}`}
              role="grid"
              aria-labelledby={`${gridId}-caption-${month.month}`}
              className="border-collapse"
            >
              <thead>
                <tr>
                  {showWeekNumbers ? (
                    <th scope="col" className="p-0">
                      <span className="sr-only">{text.weekNumber}</span>
                    </th>
                  ) : null}
                  {Array.from({ length: 7 }, (_, index) => {
                    const weekday = ((weekStartsOn + index) % 7) as Weekday;
                    return (
                      <th
                        key={weekday}
                        scope="col"
                        abbr={weekdayLongNames[weekday]}
                        className="size-9 p-0 text-xs font-normal text-muted-foreground"
                      >
                        {weekdayNames[weekday]}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {weeks.map((week) => (
                  <tr key={week.days[0]?.iso}>
                    {showWeekNumbers ? (
                      <th
                        scope="row"
                        className="pe-1 text-end font-mono text-[10px] font-normal text-muted-foreground/70"
                      >
                        {week.weekNumber}
                      </th>
                    ) : null}
                    {week.days.map((cell) => {
                      const state = dayState({
                        cell: cell.date,
                        selection,
                        preview,
                        adapter,
                        mode: props.mode,
                      });
                      const disabled = isDisabled(cell.date);
                      const isToday = isSameDay(cell.date, today);
                      // A date can appear twice across two panes — 30 April is in April and is
                      // also a borrowed leading day of May. Only the pane that owns the month
                      // carries the tab stop, or the grid would have two of them and the arrows
                      // would move focus between duplicates of the same day.
                      const isFocused =
                        isSameDay(cell.date, focused) && isSameMonth(cell.date, month);

                      return (
                        <td
                          key={cell.iso}
                          role="gridcell"
                          aria-selected={state.selected}
                          className={cn(
                            'p-0',
                            // The connecting band behind a range lives on the cell, not the button,
                            // so it meets its neighbours with no gap between the days.
                            state.inRange && 'bg-primary/10',
                            state.isStart && 'rounded-s-md bg-primary/10',
                            state.isEnd && 'rounded-e-md bg-primary/10',
                          )}
                        >
                          <button
                            type="button"
                            data-day={cell.iso}
                            tabIndex={isFocused ? 0 : -1}
                            aria-disabled={disabled || undefined}
                            aria-current={isToday ? 'date' : undefined}
                            aria-label={dayLabel(cell.date, {
                              formatter,
                              isToday,
                              text,
                              state,
                            })}
                            onClick={() => select(cell.date)}
                            onMouseEnter={() => {
                              if (props.mode === 'range' && selection.start && !selection.end) {
                                setPreview(cell.date);
                              }
                            }}
                            className={cn(
                              'relative flex size-9 items-center justify-center rounded-md text-sm transition-colors',
                              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                              !isSameMonth(cell.date, month) && 'text-muted-foreground/40',
                              disabled && 'cursor-not-allowed text-muted-foreground/30',
                              !disabled && !state.selected && 'hover:bg-secondary',
                              state.selected && 'bg-primary font-medium text-primary-foreground',
                              isToday && !state.selected && 'font-semibold text-primary-strong',
                            )}
                          >
                            {cell.date.day}
                            {isToday ? (
                              <span
                                aria-hidden="true"
                                className={cn(
                                  'absolute bottom-1 size-1 rounded-full',
                                  state.selected ? 'bg-primary-foreground' : 'bg-primary',
                                )}
                              />
                            ) : null}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          );
        })}
      </div>
    </div>
  );
}

function NavButton({
  label,
  disabled,
  onClick,
  direction,
  back = false,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  direction: 'ltr' | 'rtl';
  back?: boolean;
}) {
  // The glyph points the way the days run, so in Arabic "previous" points right.
  const pointsLeft = back === (direction === 'ltr');
  const Icon = pointsLeft ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors',
        'hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        'disabled:pointer-events-none disabled:opacity-40',
      )}
    >
      <Icon className="size-4" aria-hidden="true" />
    </button>
  );
}

interface Selection {
  start: CalendarDate | null;
  end: CalendarDate | null;
}

/** Normalise the two shapes of `value` into one internal representation. */
function readSelection(props: CalendarProps, adapter: CalendarAdapter): Selection {
  if (props.mode === 'range') {
    const range = props.value;
    return {
      start: range?.start ? adapter.fromISO(range.start) : null,
      end: range?.end ? adapter.fromISO(range.end) : null,
    };
  }
  return { start: props.value ? adapter.fromISO(props.value) : null, end: null };
}

interface DayState {
  selected: boolean;
  inRange: boolean;
  isStart: boolean;
  isEnd: boolean;
}

function dayState({
  cell,
  selection,
  preview,
  adapter,
  mode,
}: {
  cell: CalendarDate;
  selection: Selection;
  preview: CalendarDate | null;
  adapter: CalendarAdapter;
  mode: 'single' | 'range' | undefined;
}): DayState {
  if (mode !== 'range') {
    return {
      selected: Boolean(selection.start && isSameDay(cell, selection.start)),
      inRange: false,
      isStart: false,
      isEnd: false,
    };
  }

  const { start } = selection;
  // While the second endpoint is being chosen the hovered day stands in for it, so the band shows
  // what the range *would* be before it is committed.
  const end = selection.end ?? (start && preview ? preview : null);
  if (!start) return { selected: false, inRange: false, isStart: false, isEnd: false };

  const [from, to] =
    end && compareDates(adapter, end, start) < 0 ? [end, start] : [start, end ?? start];

  const isStart = isSameDay(cell, from);
  const isEnd = isSameDay(cell, to);
  const inRange = compareDates(adapter, cell, from) >= 0 && compareDates(adapter, cell, to) <= 0;

  return { selected: isStart || isEnd, inRange, isStart, isEnd };
}

/**
 * The accessible name for a day.
 *
 * The visible text is a bare number, which reads as "14" and nothing else. The full date plus its
 * role in the selection is the only way a screen-reader user can tell where they are in the grid.
 */
function dayLabel(
  date: CalendarDate,
  {
    formatter,
    isToday,
    text,
    state,
  }: {
    formatter: { formatDayLabel(date: CalendarDate): string };
    isToday: boolean;
    text: Required<CalendarLabels>;
    state: DayState;
  },
): string {
  const parts = [formatter.formatDayLabel(date)];
  if (isToday) parts.push(text.today);
  if (state.isStart) parts.push(text.rangeStart);
  if (state.isEnd && !state.isStart) parts.push(text.rangeEnd);
  return parts.join(', ');
}
