import { describe, expect, it } from 'vitest';
import {
  addDays,
  civilFromDays,
  clampDate,
  compareDates,
  createDateFormatter,
  createDateParser,
  createTimeFormatter,
  createTimeParser,
  daysFromCivil,
  dayOfWeek,
  endOfMonth,
  foldDigits,
  gregorianAdapter as adapter,
  isLeapYear,
  isWithin,
  monthGrid,
  resolveFieldOrder,
  resolveWeekStart,
  timeOptions,
  timeToValue,
  valueToTime,
  isRtlLocale,
} from './index.js';

describe('gregorian adapter', () => {
  it('round-trips every day of a leap year through the day-number form', () => {
    let date = adapter.fromISO('2024-01-01');
    for (let index = 0; index < 366; index += 1) {
      expect(adapter.fromISO(adapter.toISO(date))).toEqual(date);
      expect(civilFromDays(daysFromCivil(date.year, date.month, date.day))).toEqual(date);
      date = addDays(adapter, date, 1);
    }
    // 366 days from 1 January 2024 lands on 1 January 2025 — the year was a leap year.
    expect(adapter.toISO(date)).toBe('2025-01-01');
  });

  it('knows leap years, including the century rule', () => {
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(1900)).toBe(false);
    expect(isLeapYear(2000)).toBe(true);
    expect(adapter.daysInMonth(2024, 2)).toBe(29);
    expect(adapter.daysInMonth(1900, 2)).toBe(28);
  });

  it('clamps the day when the target month is shorter instead of overflowing', () => {
    expect(adapter.addMonths({ year: 2026, month: 1, day: 31 }, 1)).toEqual({
      year: 2026,
      month: 2,
      day: 28,
    });
    expect(adapter.addYears({ year: 2024, month: 2, day: 29 }, 1)).toEqual({
      year: 2025,
      month: 2,
      day: 28,
    });
  });

  it('crosses a year boundary in both directions', () => {
    expect(adapter.addMonths({ year: 2026, month: 1, day: 15 }, -1)).toEqual({
      year: 2025,
      month: 12,
      day: 15,
    });
    expect(adapter.addMonths({ year: 2026, month: 12, day: 15 }, 2)).toEqual({
      year: 2027,
      month: 2,
      day: 15,
    });
  });

  it('rejects impossible dates', () => {
    expect(adapter.isValid({ year: 2026, month: 2, day: 30 })).toBe(false);
    expect(adapter.isValid({ year: 2026, month: 13, day: 1 })).toBe(false);
    expect(adapter.isValid({ year: 2026, month: 2, day: 28 })).toBe(true);
  });
});

describe('calendar math', () => {
  it('reports the weekday, including before the epoch', () => {
    expect(dayOfWeek(adapter, adapter.fromISO('1970-01-01'))).toBe(4); // a Thursday
    expect(dayOfWeek(adapter, adapter.fromISO('1969-12-31'))).toBe(3);
    expect(dayOfWeek(adapter, adapter.fromISO('2026-04-03'))).toBe(5); // a Friday
  });

  it('orders and bounds dates', () => {
    const a = adapter.fromISO('2026-04-01');
    const b = adapter.fromISO('2026-04-30');
    expect(compareDates(adapter, a, b)).toBeLessThan(0);
    expect(isWithin(adapter, adapter.fromISO('2026-04-15'), a, b)).toBe(true);
    expect(isWithin(adapter, adapter.fromISO('2026-05-01'), a, b)).toBe(false);
    expect(clampDate(adapter, adapter.fromISO('2026-05-01'), a, b)).toEqual(b);
    expect(endOfMonth(adapter, a)).toEqual({ year: 2026, month: 4, day: 30 });
  });

  describe('month grid', () => {
    it('is always six whole weeks, whatever the month', () => {
      for (let month = 1; month <= 12; month += 1) {
        const weeks = monthGrid(adapter, { year: 2026, month, day: 1 }, 1);
        expect(weeks).toHaveLength(6);
        expect(weeks.every((week) => week.days.length === 7)).toBe(true);
      }
    });

    it('starts each row on the requested weekday', () => {
      for (const start of [0, 1, 6] as const) {
        const weeks = monthGrid(adapter, { year: 2026, month: 4, day: 1 }, start);
        expect(weeks.every((week) => week.days[0]?.weekday === start)).toBe(true);
      }
    });

    it('marks the borrowed leading and trailing days as out of month', () => {
      // April 2026 begins on a Wednesday, so a Monday-first grid borrows 30 and 31 March.
      const weeks = monthGrid(adapter, { year: 2026, month: 4, day: 1 }, 1);
      const first = weeks[0]?.days ?? [];
      expect(first[0]?.iso).toBe('2026-03-30');
      expect(first[0]?.inMonth).toBe(false);
      expect(first[2]?.iso).toBe('2026-04-01');
      expect(first[2]?.inMonth).toBe(true);
    });

    it('numbers ISO weeks, including the year boundary', () => {
      // 1 January 2026 is a Thursday, so it belongs to week 1 of 2026.
      const weeks = monthGrid(adapter, { year: 2026, month: 1, day: 1 }, 1);
      expect(weeks[0]?.weekNumber).toBe(1);
      // 1 January 2027 is a Friday: that week is week 53 of 2026, not week 1 of 2027.
      const january2027 = monthGrid(adapter, { year: 2027, month: 1, day: 1 }, 1);
      expect(january2027[0]?.weekNumber).toBe(53);
    });
  });
});

describe('date parser', () => {
  it('follows the locale field order rather than assuming one', () => {
    expect(resolveFieldOrder('en-GB', 'gregory')).toEqual(['day', 'month', 'year']);
    expect(resolveFieldOrder('en-US', 'gregory')).toEqual(['month', 'day', 'year']);

    const british = createDateParser({ locale: 'en-GB' });
    const american = createDateParser({ locale: 'en-US' });
    expect(british.parse('3/4/2026')).toEqual({ year: 2026, month: 4, day: 3 });
    expect(american.parse('3/4/2026')).toEqual({ year: 2026, month: 3, day: 4 });
  });

  it('accepts the separators people actually type', () => {
    const parser = createDateParser({ locale: 'en-GB' });
    for (const input of ['3/4/2026', '03-04-2026', '3.4.2026', '3 4 2026']) {
      expect(parser.parse(input)).toEqual({ year: 2026, month: 4, day: 3 });
    }
  });

  it('accepts ISO in every locale, because a paste is always ISO', () => {
    for (const locale of ['en-GB', 'en-US', 'ar-JO']) {
      expect(createDateParser({ locale }).parse('2026-04-03')).toEqual({
        year: 2026,
        month: 4,
        day: 3,
      });
    }
  });

  it('reads Eastern Arabic digits', () => {
    expect(foldDigits('٣/٤/٢٠٢٦')).toBe('3/4/2026');
    expect(createDateParser({ locale: 'ar-JO' }).parse('٢٠٢٦-٠٤-٠٣')).toEqual({
      year: 2026,
      month: 4,
      day: 3,
    });
  });

  it('returns null rather than guessing at nonsense', () => {
    const parser = createDateParser({ locale: 'en-GB' });
    expect(parser.parse('')).toBeNull();
    expect(parser.parse('tomorrow')).toBeNull();
    expect(parser.parse('3/4')).toBeNull();
    expect(parser.parse('31/2/2026')).toBeNull(); // February has no 31st
  });

  it('expands a two-digit year inside a window around now', () => {
    const parsed = createDateParser({ locale: 'en-GB' }).parse('3/4/26');
    expect(parsed?.year).toBe(2026);
  });

  it('publishes a placeholder in its own field order', () => {
    expect(createDateParser({ locale: 'en-GB' }).placeholder).toBe('dd/mm/yyyy');
    expect(createDateParser({ locale: 'en-US' }).placeholder).toBe('mm/dd/yyyy');
  });
});

describe('date formatter', () => {
  const formatter = createDateFormatter({ locale: 'en-GB' });

  it('formats in each style', () => {
    const date = adapter.fromISO('2026-04-03');
    expect(formatter.format(date, 'long')).toContain('April');
    expect(formatter.format(date, 'full')).toContain('Friday');
    expect(formatter.formatMonth(date)).toBe('April 2026');
  });

  it('round-trips the input style through the parser', () => {
    for (const locale of ['en-GB', 'en-US', 'de-DE']) {
      const format = createDateFormatter({ locale });
      const parse = createDateParser({ locale });
      const date = adapter.fromISO('2026-04-03');
      expect(parse.parse(format.format(date, 'input'))).toEqual(date);
    }
  });

  it('does not let the host timezone shift the day', () => {
    // A naive `new Date('2026-04-03')` formatted in a negative-offset zone reports 2 April.
    expect(formatter.formatISO('2026-04-03', 'short')).toContain('3');
    expect(formatter.formatISO('2026-01-01', 'long')).toContain('2026');
  });

  it('names weekdays in Sunday-first order and months in calendar order', () => {
    expect(formatter.weekdayNames('long')[0]).toBe('Sunday');
    expect(formatter.weekdayNames('long')[6]).toBe('Saturday');
    expect(formatter.monthNames('long')).toHaveLength(12);
    expect(formatter.monthNames('long')[0]).toBe('January');
  });
});

describe('time', () => {
  it('parses the several ways a time is written', () => {
    const parser = createTimeParser('en-US');
    expect(parser.parse('9')).toEqual({ hour: 9, minute: 0 });
    expect(parser.parse('09:05')).toEqual({ hour: 9, minute: 5 });
    expect(parser.parse('9 pm')).toEqual({ hour: 21, minute: 0 });
    expect(parser.parse('9p')).toEqual({ hour: 21, minute: 0 });
    expect(parser.parse('12 am')).toEqual({ hour: 0, minute: 0 });
    expect(parser.parse('12 pm')).toEqual({ hour: 12, minute: 0 });
    expect(parser.parse('19:30')).toEqual({ hour: 19, minute: 30 });
  });

  it('rejects impossible and unreadable times', () => {
    const parser = createTimeParser('en-US');
    expect(parser.parse('25:00')).toBeNull();
    expect(parser.parse('9:75')).toBeNull();
    expect(parser.parse('13 pm')).toBeNull();
    expect(parser.parse('noon')).toBeNull();
  });

  it('keeps the wire format 24-hour whatever the display', () => {
    expect(timeToValue({ hour: 21, minute: 5 })).toBe('21:05');
    expect(valueToTime('21:05')).toEqual({ hour: 21, minute: 5 });
    expect(valueToTime('99:99')).toBeNull();

    expect(createTimeFormatter({ locale: 'en-US', hourCycle: 'h12' }).formatValue('21:05')).toMatch(
      /9:05/,
    );
    expect(createTimeFormatter({ locale: 'en-GB', hourCycle: 'h23' }).formatValue('21:05')).toBe(
      '21:05',
    );
  });

  it('generates a grid of times between bounds', () => {
    expect(timeOptions(60)).toHaveLength(24);
    const office = timeOptions(30, '09:00', '11:00');
    expect(office.map(timeToValue)).toEqual(['09:00', '09:30', '10:00', '10:30', '11:00']);
  });
});

describe('locale resolution', () => {
  it('knows which locales are written right to left', () => {
    expect(isRtlLocale('ar-JO')).toBe(true);
    expect(isRtlLocale('he-IL')).toBe(true);
    expect(isRtlLocale('en-GB')).toBe(false);
  });

  it('resolves the week start, in this codebase numbering', () => {
    // Whatever the engine reports, it must be a valid weekday and must differ between regions that
    // genuinely differ — a hard-coded Monday would fail the Jordanian case.
    const jordan = resolveWeekStart('ar-JO');
    const britain = resolveWeekStart('en-GB');
    const america = resolveWeekStart('en-US');
    for (const value of [jordan, britain, america]) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(6);
    }
    expect(britain).toBe(1);
    expect(america).toBe(0);
    expect(jordan).toBe(6);
  });
});
