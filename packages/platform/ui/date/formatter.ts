import type { CalendarAdapter, CalendarDate } from './types.js';
import { gregorianAdapter, daysFromCivil } from './gregorian.js';
import { resolveFieldOrder } from './parser.js';

/**
 * Rendering a date for a human.
 *
 * Kept apart from the parser because the two answer different questions and change for different
 * reasons: this layer decides how a date *looks*, and the only thing it shares with parsing is the
 * field order used by the `'input'` style. Everything else here is `Intl` — month names, era
 * handling, numbering system and the placement of separators all come from ICU data, which is why
 * an alternative calendar needs no naming tables of its own.
 *
 * Every `Intl` call formats the Gregorian pivot at UTC noon. UTC because a calendar date is not an
 * instant and the host zone must not be allowed to shift it; noon rather than midnight because a
 * zone with a historical offset change at midnight can round the wrong way, and no zone is twelve
 * hours out.
 */

export type DateStyle = 'short' | 'medium' | 'long' | 'full' | 'input';

export interface DateFormatter {
  format(date: CalendarDate, style?: DateStyle): string;
  /** Format a wire-format value directly, for tables and read-only displays. */
  formatISO(iso: string, style?: DateStyle): string;
  /** Month-and-year heading for a calendar grid — "April 2026". */
  formatMonth(date: CalendarDate): string;
  /** Full accessible name for one day cell, including the weekday. */
  formatDayLabel(date: CalendarDate): string;
  /** Month names in this calendar, index 0 being month 1. */
  monthNames(style?: 'long' | 'short'): string[];
  /** Weekday names in `Weekday` order — index 0 is Sunday, whatever the week actually starts on. */
  weekdayNames(style?: 'long' | 'short' | 'narrow'): string[];
}

export interface DateFormatterOptions {
  adapter?: CalendarAdapter;
  locale?: string;
}

/** UTC-noon instant for a calendar date, via its Gregorian pivot. */
function pivot(adapter: CalendarAdapter, date: CalendarDate): Date {
  const g = gregorianAdapter.fromISO(adapter.toISO(date));
  return new Date(daysFromCivil(g.year, g.month, g.day) * 86_400_000 + 43_200_000);
}

const STYLE_OPTIONS: Record<Exclude<DateStyle, 'input'>, Intl.DateTimeFormatOptions> = {
  short: { day: 'numeric', month: 'numeric', year: 'numeric' },
  medium: { day: 'numeric', month: 'short', year: 'numeric' },
  long: { day: 'numeric', month: 'long', year: 'numeric' },
  full: { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' },
};

export function createDateFormatter({
  adapter = gregorianAdapter,
  locale = 'en-US',
}: DateFormatterOptions = {}): DateFormatter {
  const base = { calendar: adapter.intlCalendar, timeZone: 'UTC' } as const;
  const cache = new Map<string, Intl.DateTimeFormat>();

  function formatter(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
    const key = JSON.stringify(options);
    let existing = cache.get(key);
    if (!existing) {
      // Constructing an `Intl.DateTimeFormat` is expensive enough that doing it per cell would show
      // in a six-week grid re-rendering on every arrow key.
      existing = new Intl.DateTimeFormat(locale, { ...base, ...options });
      cache.set(key, existing);
    }
    return existing;
  }

  const order = resolveFieldOrder(locale, adapter.intlCalendar);

  /**
   * The `'input'` style is the one the parser can read back. It is built from digits and slashes
   * rather than from `Intl` because a locale's short form may use a two-digit year or a non-ASCII
   * numbering system, and a field that renders something its own parser rejects is a trap: the user
   * opens the picker, closes it, and the value they never touched is suddenly invalid.
   */
  function formatInput(date: CalendarDate): string {
    const parts: Record<string, string> = {
      day: String(date.day).padStart(2, '0'),
      month: String(date.month).padStart(2, '0'),
      year: String(date.year).padStart(4, '0'),
    };
    return order.map((field) => parts[field]).join('/');
  }

  function format(date: CalendarDate, style: DateStyle = 'medium'): string {
    if (style === 'input') return formatInput(date);
    return formatter(STYLE_OPTIONS[style]).format(pivot(adapter, date));
  }

  return {
    format,
    formatISO(iso, style) {
      return format(adapter.fromISO(iso), style);
    },
    formatMonth(date) {
      return formatter({ month: 'long', year: 'numeric' }).format(pivot(adapter, date));
    },
    formatDayLabel(date) {
      return format(date, 'full');
    },
    monthNames(style = 'long') {
      // Sampled from the current year because month *count* is calendar-dependent — a Hebrew leap
      // year has thirteen — so there is no fixed list to hard-code.
      const year = adapter.today().year;
      const fmt = formatter({ month: style });
      return Array.from({ length: adapter.monthsInYear(year) }, (_, index) =>
        fmt.format(pivot(adapter, { year, month: index + 1, day: 1 })),
      );
    },
    weekdayNames(style = 'short') {
      // 2026-03-01 is a Sunday, so seven consecutive days from it land in weekday order.
      const fmt = formatter({ weekday: style });
      return Array.from({ length: 7 }, (_, index) =>
        fmt.format(new Date(Date.UTC(2026, 2, 1 + index, 12))),
      );
    },
  };
}
