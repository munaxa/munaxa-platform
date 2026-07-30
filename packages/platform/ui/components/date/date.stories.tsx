import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Calendar } from './calendar.js';
import { DatePicker, DateRangePicker } from './date-picker.js';
import { TimePicker, DateTimePicker } from './time-picker.js';
import { TokenInput } from '../forms/token-input.js';
import { Field } from '../forms/field.js';
import {
  LocaleProvider,
  createDateFormatter,
  gregorianAdapter,
  type CalendarAdapter,
  type DateRange,
} from '../../date/index.js';
import { Container } from '../../layouts/container.js';
import { Stack } from '../../layouts/stack.js';
import { Section } from '../../layouts/page.js';

const meta = {
  title: 'Date/Calendar & Date System',
  parameters: {
    docs: {
      description: {
        component:
          'A calendar and date stack built as five replaceable layers — `CalendarAdapter`, ' +
          '`DateParser`, `DateFormatter`, `TimeFormatter`, `LocaleProvider` — rather than one date ' +
          'utility.\n\n' +
          '**Every value crossing a public API is an ISO-8601 Gregorian string.** The calendar the ' +
          'user is looking at is presentation. That single rule is what makes an alternative ' +
          'calendar additive: swap the adapter and the rendering changes while the value the form ' +
          'submits does not.\n\n' +
          '**Typing is a first-class path.** Someone entering fifty dates from a paper form will ' +
          'type them, and the parser follows the *locale’s* field order, so `3/4/2026` is April ' +
          'in Britain and March in the United States without the component choosing for anyone.\n\n' +
          '**Keyboard:** arrows move a day, Home/End the week, PageUp/PageDown a month, ' +
          'Shift+PageUp/PageDown a year, Enter selects. Alt+ArrowDown opens a picker from its field.',
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Pickers: Story = {
  render: function Pickers() {
    const [date, setDate] = useState('2026-04-15');
    const [range, setRange] = useState<DateRange>({ start: '2026-04-10', end: '2026-04-24' });
    const [time, setTime] = useState('09:30');
    const [moment, setMoment] = useState('2026-04-15T09:30');

    return (
      <Container width="content" className="py-6">
        <Stack gap={6}>
          <Field label="Enrolment date" hint="Type it or choose it — both are supported.">
            <DatePicker value={date} onChange={setDate} clearable />
          </Field>
          <Field label="Term" hint="Both ends typeable; one two-month calendar for the shape.">
            <DateRangePicker value={range} onChange={setRange} />
          </Field>
          <Field label="Starts at" hint="The list is a convenience; 09:05 can still be typed.">
            <TimePicker value={time} onChange={setTime} step={30} />
          </Field>
          <Field label="Appointment">
            <DateTimePicker value={moment} onChange={setMoment} step={15} />
          </Field>
          <p className="font-mono text-xs text-muted-foreground">
            {JSON.stringify({ date, range, time, moment })}
          </p>
        </Stack>
      </Container>
    );
  },
};

/** Every state a product actually renders. */
export const States: Story = {
  render: function States() {
    return (
      <Container width="content" className="py-6">
        <Stack gap={6}>
          <Field label="Invalid" required error="Choose a date.">
            <DatePicker value="" onChange={() => {}} />
          </Field>
          <Field label="Disabled">
            <DatePicker value="2026-04-15" onChange={() => {}} disabled />
          </Field>
          <Field label="Read only" hint="Still readable and copyable — it just will not open.">
            <DatePicker value="2026-04-15" onChange={() => {}} readOnly />
          </Field>
          <Field label="Bounded" hint="Only the second week of April, and never the 17th.">
            <DatePicker
              value=""
              onChange={() => {}}
              min="2026-04-06"
              max="2026-04-17"
              isDateDisabled={(iso) => iso === '2026-04-17'}
            />
          </Field>
        </Stack>
      </Container>
    );
  },
};

/**
 * The same calendar under three locales. Nothing is configured per calendar beyond the locale
 * itself: the week start, the month names, the field order and the writing direction are all
 * resolved from it.
 */
export const Locales: Story = {
  render: function Locales() {
    const [value, setValue] = useState('2026-04-15');
    return (
      <Container width="wide" className="py-6">
        <Stack gap={8}>
          {(
            [
              ['en-GB', 'British — weeks start Monday, dates read dd/mm/yyyy'],
              ['en-US', 'American — weeks start Sunday, dates read mm/dd/yyyy'],
              ['ar-JO', 'Jordanian — weeks start Saturday, and the grid runs right to left'],
            ] as const
          ).map(([locale, description]) => (
            <LocaleProvider key={locale} locale={locale}>
              <Section title={locale} description={description}>
                <div dir={locale === 'ar-JO' ? 'rtl' : 'ltr'}>
                  <Stack gap={4}>
                    <Calendar aria-label={locale} value={value} onChange={setValue} />
                    <div className="max-w-64">
                      <DatePicker
                        aria-label={`${locale} field`}
                        value={value}
                        onChange={setValue}
                      />
                    </div>
                  </Stack>
                </div>
              </Section>
            </LocaleProvider>
          ))}
        </Stack>
      </Container>
    );
  },
};

/**
 * Range selection: two months, one focus, and a live band showing what the range *would* be while
 * the second endpoint is still being chosen.
 */
export const Range: Story = {
  render: function Range() {
    const [range, setRange] = useState<DateRange>({ start: '2026-04-08', end: null });
    return (
      <Container width="wide" className="py-6">
        <Stack gap={4}>
          <Calendar
            aria-label="Term dates"
            mode="range"
            numberOfMonths={2}
            showWeekNumbers
            value={range}
            onChange={setRange}
          />
          <p className="font-mono text-xs text-muted-foreground">{JSON.stringify(range)}</p>
        </Stack>
      </Container>
    );
  },
};

/**
 * Free-text tokens — a list the user writes rather than picks.
 *
 * Deliberately without a suggestion list: `MultiSelect` covers choosing several things from a fixed
 * list and `Autocomplete` with `allowCustomValue` covers searching one while still being able to
 * type something new. This is for the case where there is no list at all.
 */
export const Tokens: Story = {
  render: function Tokens() {
    const [recipients, setRecipients] = useState<string[]>(['head@school.example']);
    const [tags, setTags] = useState<string[]>(['urgent']);
    return (
      <Container width="content" className="py-6">
        <Stack gap={6}>
          <Field label="Recipients" hint="Enter or comma commits. Paste a whole list at once.">
            <TokenInput
              value={recipients}
              onChange={setRecipients}
              validate={(token) => (/^\S+@\S+\.\S+$/.test(token) ? token.toLowerCase() : null)}
              labels={{ placeholder: 'name@example.com' }}
            />
          </Field>
          <Field label="Tags" hint="Capped at four.">
            <TokenInput value={tags} onChange={setTags} maxTokens={4} />
          </Field>
        </Stack>
      </Container>
    );
  },
};

/**
 * **The extension point.** This calendar is driven by a hand-written adapter with thirteen months
 * of twenty-eight days — a calendar that does not exist, which is the point: nothing in `Calendar`,
 * `DatePicker` or the parser knows what a month is or how many there are. The values it reports are
 * still ordinary ISO dates.
 *
 * A Hijri adapter is the same shape and the same amount of work, and adding one requires no change
 * to any component.
 */
export const AlternativeCalendar: Story = {
  name: 'A different calendar system',
  render: function Alternative() {
    const [value, setValue] = useState('2026-04-15');
    return (
      <Container width="content" className="py-6">
        <Stack gap={4}>
          <Section
            title="Thirteen months of twenty-eight days"
            description="A fictional calendar, supplied as an adapter. No component was changed."
          >
            <Calendar
              aria-label="Fixed calendar"
              adapter={fixedCalendarAdapter}
              value={value}
              onChange={setValue}
            />
          </Section>
          <p className="font-mono text-xs text-muted-foreground">
            wire value: {value} · Gregorian:{' '}
            {createDateFormatter({ locale: 'en-GB' }).formatISO(value, 'long')}
          </p>
        </Stack>
      </Container>
    );
  },
};

/**
 * The International Fixed Calendar: thirteen 28-day months, plus a year-end day. Written against
 * the same `CalendarAdapter` interface a Hijri implementation would use.
 */
const fixedCalendarAdapter: CalendarAdapter = {
  id: 'fixed-13',
  // Names and formatting still come from `Intl`, via the Gregorian pivot.
  intlCalendar: 'gregory',

  fromISO(iso) {
    const g = gregorianAdapter.fromISO(iso);
    const dayOfYear = dayNumber(g) - dayNumber({ year: g.year, month: 1, day: 1 });
    // The last month absorbs the leftover day (two in a leap year), so the round-trip still holds.
    const month = Math.min(13, Math.floor(dayOfYear / 28) + 1);
    return { year: g.year, month, day: dayOfYear - (month - 1) * 28 + 1 };
  },

  toISO(date) {
    const start = dayNumber({ year: date.year, month: 1, day: 1 });
    return gregorianAdapter.toISO(civil(start + (date.month - 1) * 28 + (date.day - 1)));
  },

  today(timeZone) {
    return fixedCalendarAdapter.fromISO(gregorianAdapter.toISO(gregorianAdapter.today(timeZone)));
  },

  daysInMonth: (year, month) => (month === 13 ? (isLeap(year) ? 30 : 29) : 28),
  monthsInYear: () => 13,

  addMonths(date, amount) {
    const total = date.year * 13 + (date.month - 1) + amount;
    const year = Math.floor(total / 13);
    const month = total - year * 13 + 1;
    return { year, month, day: Math.min(date.day, fixedCalendarAdapter.daysInMonth(year, month)) };
  },

  addYears: (date, amount) => ({ ...date, year: date.year + amount }),

  isValid: (date) =>
    date.month >= 1 &&
    date.month <= 13 &&
    date.day >= 1 &&
    date.day <= fixedCalendarAdapter.daysInMonth(date.year, date.month),
};

function isLeap(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function dayNumber(date: { year: number; month: number; day: number }): number {
  return Math.round(Date.UTC(date.year, date.month - 1, date.day) / 86_400_000);
}

function civil(days: number): { year: number; month: number; day: number } {
  const date = new Date(days * 86_400_000);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}
