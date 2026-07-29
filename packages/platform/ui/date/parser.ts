import type { CalendarAdapter, CalendarDate, TimeOfDay } from './types.js';
import { gregorianAdapter } from './gregorian.js';

/**
 * Turning what someone typed into a date.
 *
 * This is its own layer because parsing and formatting are not inverses of each other and pretending
 * they are is how date utilities become unusable. A formatter has one job and one output. A parser
 * has to accept the several things a person plausibly means: `3/4/2026`, `03-04-2026`, `3.4.26`,
 * `2026-04-03`. What it must *not* do is guess the field order — `3/4/2026` is the third of April
 * to most of the world and the fourth of March in the United States, and a component that hard-codes
 * either one is wrong for half its users.
 *
 * So the order is asked of the platform. `Intl.DateTimeFormat.formatToParts` on a probe date reports
 * the order this locale and calendar actually use, and the parser follows it. Nothing is hard-coded
 * and no locale table has to be maintained.
 */

export interface DateParser {
  /** `null` when the input is not a date — never a partially-guessed one. */
  parse(input: string): CalendarDate | null;
  /** The field order this parser expects, for hints and placeholders. */
  readonly order: DateFieldOrder;
  /** A placeholder in the parser's own order — `dd/mm/yyyy`. */
  readonly placeholder: string;
}

export type DateField = 'day' | 'month' | 'year';
export type DateFieldOrder = readonly [DateField, DateField, DateField];

const DEFAULT_ORDER: DateFieldOrder = ['day', 'month', 'year'];

/**
 * Ask the platform which order this locale writes dates in.
 *
 * The probe date has a distinct day, month and year so the parts are unambiguous; only the order of
 * the numeric parts is read, never their values.
 */
export function resolveFieldOrder(locale: string, calendar: string): DateFieldOrder {
  try {
    const parts = new Intl.DateTimeFormat(locale, {
      calendar,
      timeZone: 'UTC',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    }).formatToParts(new Date(Date.UTC(2026, 3, 3)));
    const order = parts
      .map((part) => part.type)
      .filter((type): type is DateField => type === 'day' || type === 'month' || type === 'year');
    return order.length === 3 ? (order as unknown as DateFieldOrder) : DEFAULT_ORDER;
  } catch {
    // An unknown locale or calendar key is a caller mistake, not a reason for the field to stop
    // accepting input. Fall back to the most widely used order rather than throwing.
    return DEFAULT_ORDER;
  }
}

/** Two-digit years resolve inside a century window centred a little ahead of now. */
function expandYear(year: number, digits: number): number {
  if (digits > 2) return year;
  const currentYear = new Date().getFullYear();
  const pivot = currentYear + 20;
  const century = Math.floor(pivot / 100) * 100;
  const candidate = century + year;
  return candidate > pivot ? candidate - 100 : candidate;
}

const PLACEHOLDER_TEXT: Record<DateField, string> = { day: 'dd', month: 'mm', year: 'yyyy' };
const ISO_INPUT = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/;

export interface DateParserOptions {
  adapter?: CalendarAdapter;
  locale?: string;
}

/**
 * Build a parser for one locale and calendar.
 *
 * Numbers typed in Eastern Arabic digits (`٠١٢٣`) parse too: `Number()` does not accept them, so the
 * digits are folded to ASCII first. An Arabic-locale user typing on an Arabic keyboard is not an
 * edge case in a product that ships an `ar-JO` locale.
 */
export function createDateParser({
  adapter = gregorianAdapter,
  locale = 'en-US',
}: DateParserOptions = {}): DateParser {
  const order = resolveFieldOrder(locale, adapter.intlCalendar);
  const placeholder = order.map((field) => PLACEHOLDER_TEXT[field]).join('/');

  function parse(input: string): CalendarDate | null {
    const text = foldDigits(input).trim();
    if (!text) return null;

    // ISO is accepted in every locale: it is unambiguous, and it is what a paste from a system or a
    // spreadsheet looks like. A four-digit leading group can only be a year.
    const iso = ISO_INPUT.exec(text);
    if (iso) {
      const candidate = adapter.fromISO(
        gregorianAdapter.toISO({
          year: Number(iso[1]),
          month: Number(iso[2]),
          day: Number(iso[3]),
        }),
      );
      return adapter.isValid(candidate) ? candidate : null;
    }

    const groups = text.split(/[^\d]+/).filter(Boolean);
    if (groups.length !== 3) return null;

    const fields: Partial<Record<DateField, number>> = {};
    order.forEach((field, index) => {
      const group = groups[index] as string;
      fields[field] = field === 'year' ? expandYear(Number(group), group.length) : Number(group);
    });

    const candidate: CalendarDate = {
      year: fields.year as number,
      month: fields.month as number,
      day: fields.day as number,
    };
    return adapter.isValid(candidate) ? candidate : null;
  }

  return { parse, order, placeholder };
}

/** Fold Eastern Arabic and Extended Arabic-Indic digits onto ASCII so `Number` can read them. */
export function foldDigits(input: string): string {
  return input.replace(/[٠-٩۰-۹]/g, (char) => {
    const code = char.charCodeAt(0);
    const base = code >= 0x06f0 ? 0x06f0 : 0x0660;
    return String(code - base);
  });
}

export interface TimeParser {
  parse(input: string): TimeOfDay | null;
  readonly placeholder: string;
}

const TIME_INPUT = /^(\d{1,2})(?::(\d{1,2}))?(?::(\d{1,2}))?\s*(.*)$/;

/**
 * Parse a typed time.
 *
 * Separate from the date parser rather than folded into one "smart" parser: a time has its own
 * ambiguity (is `7` seven in the morning or nineteen hundred?) and its own affordances (`7p`,
 * `7 pm`, `19:00`), and a combined parser would have to decide which half of a string is which
 * before it could apply either set of rules. Two small parsers beat one clever one.
 *
 * The meridiem strings come from `Intl` so an Arabic-locale user can type `م` and be understood.
 */
export function createTimeParser(locale = 'en-US'): TimeParser {
  const { am, pm } = meridiemStrings(locale);

  function parse(input: string): TimeOfDay | null {
    const text = foldDigits(input).trim().toLowerCase();
    if (!text) return null;

    const match = TIME_INPUT.exec(text);
    if (!match) return null;

    let hour = Number(match[1]);
    const minute = match[2] === undefined ? 0 : Number(match[2]);
    const second = match[3] === undefined ? undefined : Number(match[3]);
    const suffix = (match[4] ?? '').replace(/[.\s]/g, '');

    const isPm =
      suffix !== '' && pm.some((token) => token.startsWith(suffix) || suffix.startsWith(token));
    const isAm =
      suffix !== '' && am.some((token) => token.startsWith(suffix) || suffix.startsWith(token));
    if (suffix !== '' && !isPm && !isAm) return null;

    if (isPm || isAm) {
      if (hour < 1 || hour > 12) return null;
      if (isPm && hour !== 12) hour += 12;
      if (isAm && hour === 12) hour = 0;
    }

    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
    if (second !== undefined && (second < 0 || second > 59)) return null;
    return { hour, minute, ...(second === undefined ? {} : { second }) };
  }

  return { parse, placeholder: 'hh:mm' };
}

/** The locale's own am/pm markers, lower-cased, plus the ASCII ones every keyboard can produce. */
function meridiemStrings(locale: string): { am: string[]; pm: string[] } {
  const am = new Set(['am', 'a']);
  const pm = new Set(['pm', 'p']);
  try {
    const format = new Intl.DateTimeFormat(locale, {
      hour: 'numeric',
      hourCycle: 'h12',
      timeZone: 'UTC',
    });
    const read = (hour: number) =>
      format
        .formatToParts(new Date(Date.UTC(2026, 0, 1, hour)))
        .find((part) => part.type === 'dayPeriod')?.value;
    const morning = read(9);
    const evening = read(21);
    if (morning) am.add(morning.toLowerCase().replace(/[.\s]/g, ''));
    if (evening) pm.add(evening.toLowerCase().replace(/[.\s]/g, ''));
  } catch {
    // Keep the ASCII markers.
  }
  return { am: [...am], pm: [...pm] };
}
