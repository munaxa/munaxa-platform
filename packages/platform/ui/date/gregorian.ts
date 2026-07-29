import type { CalendarAdapter, CalendarDate } from './types.js';

/**
 * The default calendar: proleptic Gregorian, implemented on day numbers rather than on `Date`.
 *
 * `Date` is avoided for arithmetic on purpose. `new Date(y, m, d)` is a local-midnight instant, so
 * every operation on it is exposed to the host timezone and to DST: add 24 hours across a spring
 * transition and you land on the same calendar day, add a month near a boundary and you can move a
 * day. The conversions below are Howard Hinnant's `days_from_civil` / `civil_from_days` — exact
 * integer arithmetic over the proleptic Gregorian calendar, valid for any year, with no instant
 * involved. `Date` appears only in `today()`, where an instant is genuinely what we start from.
 */

/** Days since 1970-01-01 for a proleptic Gregorian date. Exact for all years. */
export function daysFromCivil(year: number, month: number, day: number): number {
  const y = year - (month <= 2 ? 1 : 0);
  const era = Math.floor(y / 400);
  const yoe = y - era * 400; // [0, 399]
  const doy = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1; // [0, 365]
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy; // [0, 146096]
  return era * 146097 + doe - 719468;
}

/** Inverse of {@link daysFromCivil}. */
export function civilFromDays(days: number): CalendarDate {
  const z = days + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097; // [0, 146096]
  const yoe = Math.floor(
    (doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365,
  );
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153); // [0, 11]
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1; // [1, 31]
  const month = mp + (mp < 10 ? 3 : -9); // [1, 12]
  return { year: y + (month <= 2 ? 1 : 0), month, day };
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

const MONTH_LENGTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function pad(value: number, width: number): string {
  return String(Math.abs(value)).padStart(width, '0');
}

/**
 * Read today's calendar date in an IANA zone.
 *
 * The parts are pulled through `Intl` rather than from `getFullYear()` so that a caller who names a
 * zone gets that zone's date, not the host's. A school in Amman reporting "today" from a browser
 * set to UTC must still see Amman's today.
 */
function todayIn(timeZone: string | undefined): CalendarDate {
  const now = new Date();
  if (!timeZone) {
    return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
  }
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    era: 'short',
  }).formatToParts(now);
  const find = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? NaN);
  const bc = parts.find((part) => part.type === 'era')?.value?.startsWith('B');
  const year = find('year');
  return { year: bc ? 1 - year : year, month: find('month'), day: find('day') };
}

const ISO_PATTERN = /^(-?\d{4,6})-(\d{2})-(\d{2})$/;

export const gregorianAdapter: CalendarAdapter = {
  id: 'gregory',
  intlCalendar: 'gregory',

  fromISO(iso) {
    const match = ISO_PATTERN.exec(iso.slice(0, 10));
    if (!match) throw new RangeError(`Not an ISO date: ${iso}`);
    return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  },

  toISO(date) {
    // The wire format *is* Gregorian, so this adapter needs no conversion — only rendering. Six
    // digits with an explicit sign outside the four-digit range keeps the string round-trippable.
    const year =
      date.year < 0
        ? `-${pad(date.year, 6)}`
        : date.year > 9999
          ? pad(date.year, 6)
          : pad(date.year, 4);
    return `${year}-${pad(date.month, 2)}-${pad(date.day, 2)}`;
  },

  today(timeZone) {
    return todayIn(timeZone);
  },

  daysInMonth(year, month) {
    if (month < 1 || month > 12) return 0;
    if (month === 2 && isLeapYear(year)) return 29;
    return MONTH_LENGTHS[month - 1] ?? 0;
  },

  monthsInYear() {
    return 12;
  },

  addMonths(date, amount) {
    const total = date.year * 12 + (date.month - 1) + amount;
    const year = Math.floor(total / 12);
    const month = total - year * 12 + 1;
    // Clamp rather than overflow: 31 January plus one month is the end of February, not 3 March.
    return { year, month, day: Math.min(date.day, gregorianAdapter.daysInMonth(year, month)) };
  },

  addYears(date, amount) {
    const year = date.year + amount;
    return {
      year,
      month: date.month,
      day: Math.min(date.day, gregorianAdapter.daysInMonth(year, date.month)),
    };
  },

  isValid(date) {
    return (
      Number.isInteger(date.year) &&
      Number.isInteger(date.month) &&
      Number.isInteger(date.day) &&
      date.month >= 1 &&
      date.month <= 12 &&
      date.day >= 1 &&
      date.day <= gregorianAdapter.daysInMonth(date.year, date.month)
    );
  },
};
