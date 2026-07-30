import type { TimeOfDay } from './types.js';

/**
 * Rendering a wall-clock time.
 *
 * A separate layer from the date formatter, and not only for tidiness: time carries a preference
 * the date does not — the hour cycle. Whether 19:00 shows as "7:00 PM" or "19:00" is a locale
 * default that a product frequently needs to override for a single screen (a timetable is usually
 * 24-hour even in a 12-hour locale), and burying that switch inside a combined date-time formatter
 * would mean overriding it changes the date too.
 *
 * `TimeOfDay.hour` is always 0–23 in the model. The hour cycle is presentation only, so switching it
 * never alters a stored value.
 */

export type HourCycle = 'h12' | 'h23';
export type TimeStyle = 'short' | 'medium';

export interface TimeFormatter {
  format(time: TimeOfDay, style?: TimeStyle): string;
  /** Format an `HH:mm` or `HH:mm:ss` wire value directly. */
  formatValue(value: string, style?: TimeStyle): string;
  /** Resolved cycle — what the locale asked for unless the caller overrode it. */
  readonly hourCycle: HourCycle;
}

export interface TimeFormatterOptions {
  locale?: string;
  /** Override the locale's own preference. */
  hourCycle?: HourCycle;
}

/** Ask the platform whether this locale writes 12- or 24-hour times. */
export function resolveHourCycle(locale: string): HourCycle {
  try {
    const resolved = new Intl.DateTimeFormat(locale, { hour: 'numeric' }).resolvedOptions();
    return resolved.hourCycle === 'h11' || resolved.hourCycle === 'h12' ? 'h12' : 'h23';
  } catch {
    return 'h23';
  }
}

/** The wire format for a time: `HH:mm`, or `HH:mm:ss` when seconds are meaningful. */
export function timeToValue(time: TimeOfDay): string {
  const base = `${String(time.hour).padStart(2, '0')}:${String(time.minute).padStart(2, '0')}`;
  return time.second === undefined ? base : `${base}:${String(time.second).padStart(2, '0')}`;
}

/** `null` rather than a thrown error, so a half-typed value in a controlled input is not fatal. */
export function valueToTime(value: string): TimeOfDay | null {
  const match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = match[3] === undefined ? undefined : Number(match[3]);
  if (hour > 23 || minute > 59 || (second !== undefined && second > 59)) return null;
  return { hour, minute, ...(second === undefined ? {} : { second }) };
}

export function createTimeFormatter({
  locale = 'en-US',
  hourCycle,
}: TimeFormatterOptions = {}): TimeFormatter {
  const cycle = hourCycle ?? resolveHourCycle(locale);
  const cache = new Map<TimeStyle, Intl.DateTimeFormat>();

  function formatter(style: TimeStyle): Intl.DateTimeFormat {
    let existing = cache.get(style);
    if (!existing) {
      existing = new Intl.DateTimeFormat(locale, {
        timeZone: 'UTC',
        hourCycle: cycle,
        // A leading zero belongs on a 24-hour clock and looks wrong on a 12-hour one: nobody
        // writes "09:05 PM". The minute is always two digits either way.
        hour: cycle === 'h12' ? 'numeric' : '2-digit',
        minute: '2-digit',
        ...(style === 'medium' ? { second: '2-digit' } : {}),
      });
      cache.set(style, existing);
    }
    return existing;
  }

  function format(time: TimeOfDay, style: TimeStyle = 'short'): string {
    // A fixed UTC day carries the wall-clock time into `Intl` without a zone ever being applied.
    const instant = new Date(Date.UTC(2026, 0, 1, time.hour, time.minute, time.second ?? 0));
    return formatter(style).format(instant);
  }

  return {
    format,
    formatValue(value, style) {
      const time = valueToTime(value);
      return time ? format(time, style) : value;
    },
    hourCycle: cycle,
  };
}

/**
 * Every time on a fixed grid, for a picker's list.
 *
 * Generated rather than typed out so `step` can be anything a product needs — 15 minutes for a
 * booking, 5 for a timetable, 60 for an opening hour.
 */
export function timeOptions(stepMinutes: number, min?: string, max?: string): TimeOfDay[] {
  const step = Math.max(1, Math.round(stepMinutes));
  const lower = min ? minutesOf(min) : 0;
  const upper = max ? minutesOf(max) : 24 * 60 - 1;
  const out: TimeOfDay[] = [];
  for (let minutes = Math.ceil(lower / step) * step; minutes <= upper; minutes += step) {
    out.push({ hour: Math.floor(minutes / 60), minute: minutes % 60 });
  }
  return out;
}

function minutesOf(value: string): number {
  const time = valueToTime(value);
  return time ? time.hour * 60 + time.minute : 0;
}
