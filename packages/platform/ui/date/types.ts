/**
 * The vocabulary the whole date system is written against.
 *
 * Two decisions here shape everything above them.
 *
 * **A `CalendarDate` is a calendar-local triple, not an instant.** Year, month and day are numbered
 * *in whatever calendar system produced them* — `{ year: 1447, month: 3, day: 12 }` is a perfectly
 * good Hijri date. It carries no time, no zone and no offset, because "the 3rd of March" is not an
 * instant and treating it as one is where date bugs come from: a `Date` at local midnight shifts a
 * day the moment it crosses a timezone, and `toISOString()` on it silently reports yesterday for
 * half the planet.
 *
 * **ISO-8601 Gregorian is the wire format, always.** Every value that crosses a component's public
 * API is a `YYYY-MM-DD` string in the proleptic Gregorian calendar, regardless of which calendar
 * the user is *looking at*. That is the single decision that makes an alternative calendar additive
 * rather than breaking: swapping the adapter changes what is rendered and what arrow keys do, and
 * changes nothing about what the surrounding form submits.
 */

/** A date as a calendar sees it. `month` is 1-based. */
export interface CalendarDate {
  year: number;
  /** 1-based, and month 12 is not universal — a Hijri year has 12, a Hebrew leap year has 13. */
  month: number;
  day: number;
}

/** Wall-clock time, no date and no zone. `hour` is always 0–23 regardless of how it is displayed. */
export interface TimeOfDay {
  hour: number;
  minute: number;
  second?: number;
}

/** `0` is Sunday through `6` Saturday, matching `Date.prototype.getDay`. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/**
 * A start/end pair in the wire format. Either end may be null: a range being picked has a start and
 * no end for as long as it takes the user to choose the second date, and a component that could not
 * represent that state would have to invent one.
 */
export interface DateRange {
  start: string | null;
  end: string | null;
}

/**
 * Everything a calendar system must answer, and nothing else.
 *
 * The surface is deliberately tiny. Anything that can be *derived* — adding days, comparing,
 * finding the start of a month, laying out a month grid, naming a month — lives in the layers above
 * and is written once against this interface, so a new calendar implements arithmetic that is
 * genuinely calendar-specific and inherits the rest. A Hijri adapter is a page of code, not a
 * parallel date library.
 *
 * `intlCalendar` is the hinge for naming and formatting: given the Gregorian pivot from `toISO`,
 * `Intl.DateTimeFormat` will render it in this calendar, so month names, era handling and numbering
 * systems come from the platform's own ICU data rather than from a table someone has to maintain.
 */
export interface CalendarAdapter {
  /** Stable identifier for this adapter — `'gregory'`, `'islamic-umalqura'`. */
  readonly id: string;
  /** BCP-47 calendar key handed to `Intl` for names and formatting. */
  readonly intlCalendar: string;

  /** Convert from the wire format into this calendar's own numbering. */
  fromISO(iso: string): CalendarDate;
  /** Convert back to the wire format. Always proleptic Gregorian. */
  toISO(date: CalendarDate): string;

  /** Today in this calendar, in the given IANA zone (host zone when omitted). */
  today(timeZone?: string): CalendarDate;

  daysInMonth(year: number, month: number): number;
  monthsInYear(year: number): number;

  /**
   * Month and year arithmetic is the part that is genuinely calendar-specific: month lengths vary,
   * year lengths vary, and the day must be clamped when the target month is shorter (31 Jan plus
   * one month is 28 or 29 Feb, never 3 March).
   */
  addMonths(date: CalendarDate, amount: number): CalendarDate;
  addYears(date: CalendarDate, amount: number): CalendarDate;

  isValid(date: CalendarDate): boolean;
}
