import type { CalendarAdapter, CalendarDate, Weekday } from './types.js';
import { civilFromDays, daysFromCivil, gregorianAdapter } from './gregorian.js';

/**
 * Everything derivable from a {@link CalendarAdapter}, written once.
 *
 * The reason this is a separate module rather than more methods on the adapter: none of it is
 * calendar-specific. Adding days, comparing two dates, finding the start of a month and laying out
 * a month grid are all the same operations whichever calendar you are in, provided you can convert
 * to and from a common day number — which the adapter's `toISO`/`fromISO` already give us. Pushing
 * them onto the adapter would mean every new calendar reimplements them, and a Hijri adapter would
 * arrive with its own subtly different off-by-one in the grid.
 */

/** Day number for a calendar date — the common ground every calendar can be compared on. */
export function toDayNumber(adapter: CalendarAdapter, date: CalendarDate): number {
  const iso = gregorianAdapter.fromISO(adapter.toISO(date));
  return daysFromCivil(iso.year, iso.month, iso.day);
}

export function fromDayNumber(adapter: CalendarAdapter, days: number): CalendarDate {
  return adapter.fromISO(gregorianAdapter.toISO(civilFromDays(days)));
}

export function addDays(
  adapter: CalendarAdapter,
  date: CalendarDate,
  amount: number,
): CalendarDate {
  return fromDayNumber(adapter, toDayNumber(adapter, date) + amount);
}

/** `0` Sunday … `6` Saturday. 1970-01-01 was a Thursday, hence the offset. */
export function dayOfWeek(adapter: CalendarAdapter, date: CalendarDate): Weekday {
  const days = toDayNumber(adapter, date);
  return (((days % 7) + 11) % 7) as Weekday;
}

/** Negative when `a` is earlier, matching `Array.prototype.sort`. */
export function compareDates(adapter: CalendarAdapter, a: CalendarDate, b: CalendarDate): number {
  return toDayNumber(adapter, a) - toDayNumber(adapter, b);
}

export function isSameDay(a: CalendarDate, b: CalendarDate): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

export function isSameMonth(a: CalendarDate, b: CalendarDate): boolean {
  return a.year === b.year && a.month === b.month;
}

export function startOfMonth(date: CalendarDate): CalendarDate {
  return { year: date.year, month: date.month, day: 1 };
}

export function endOfMonth(adapter: CalendarAdapter, date: CalendarDate): CalendarDate {
  return { year: date.year, month: date.month, day: adapter.daysInMonth(date.year, date.month) };
}

/** Inclusive at both ends. */
export function isWithin(
  adapter: CalendarAdapter,
  date: CalendarDate,
  min: CalendarDate | null,
  max: CalendarDate | null,
): boolean {
  if (min && compareDates(adapter, date, min) < 0) return false;
  if (max && compareDates(adapter, date, max) > 0) return false;
  return true;
}

/** Pull a date inside `[min, max]`, so keyboard movement stops at the bounds instead of leaving them. */
export function clampDate(
  adapter: CalendarAdapter,
  date: CalendarDate,
  min: CalendarDate | null,
  max: CalendarDate | null,
): CalendarDate {
  if (min && compareDates(adapter, date, min) < 0) return min;
  if (max && compareDates(adapter, date, max) > 0) return max;
  return date;
}

/** One cell of a rendered month. */
export interface CalendarCell {
  date: CalendarDate;
  /** Wire-format value for this cell — what a selection reports and what keys are built from. */
  iso: string;
  /** False for the leading and trailing days borrowed from the neighbouring months. */
  inMonth: boolean;
  weekday: Weekday;
}

export interface CalendarWeek {
  /** ISO-8601 week number, for calendars where that is meaningful. */
  weekNumber: number;
  days: CalendarCell[];
}

/**
 * Lay out a month as whole weeks starting on `weekStartsOn`.
 *
 * Always six rows. A month occupies four to six week-rows depending on its length and start day,
 * and a grid that changed height as you paged through it would push the whole popover around under
 * the pointer — so the trailing days are padded out to a fixed 42 cells. The cost is a few extra
 * out-of-month cells; the benefit is that "next month" never moves the button you just clicked.
 */
export function monthGrid(
  adapter: CalendarAdapter,
  month: CalendarDate,
  weekStartsOn: Weekday,
): CalendarWeek[] {
  const first = startOfMonth(month);
  const firstWeekday = dayOfWeek(adapter, first);
  const lead = (firstWeekday - weekStartsOn + 7) % 7;
  const start = addDays(adapter, first, -lead);

  const weeks: CalendarWeek[] = [];
  let cursor = start;
  for (let week = 0; week < 6; week += 1) {
    const days: CalendarCell[] = [];
    for (let day = 0; day < 7; day += 1) {
      days.push({
        date: cursor,
        iso: adapter.toISO(cursor),
        inMonth: isSameMonth(cursor, month),
        weekday: dayOfWeek(adapter, cursor),
      });
      cursor = addDays(adapter, cursor, 1);
    }
    weeks.push({ weekNumber: isoWeekNumber(adapter, days[0] as CalendarCell), days });
  }
  return weeks;
}

/** ISO-8601 week number of the week containing `cell`. Weeks are Monday-based by definition. */
function isoWeekNumber(adapter: CalendarAdapter, cell: CalendarCell): number {
  const days = toDayNumber(adapter, cell.date);
  // Step to the Thursday of this ISO week; the year that Thursday falls in owns the week.
  const isoWeekday = ((days % 7) + 10) % 7; // 0 = Monday
  const thursday = civilFromDays(days - isoWeekday + 3);
  const firstThursday = daysFromCivil(thursday.year, 1, 4);
  const firstIsoWeekday = ((firstThursday % 7) + 10) % 7;
  return Math.floor((days - isoWeekday + 3 - (firstThursday - firstIsoWeekday + 3)) / 7) + 1;
}
