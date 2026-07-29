/**
 * The date engine: five layers, each replaceable, none of them a component.
 *
 * ```
 *   LocaleProvider          which locale, calendar, zone and hour cycle a product is in
 *        │
 *        ├── CalendarAdapter    the calendar system itself — Gregorian by default
 *        ├── DateParser         what the user typed → a date
 *        ├── DateFormatter      a date → what the user reads
 *        └── TimeFormatter      a wall-clock time → what the user reads
 * ```
 *
 * They are separate modules rather than one `date.ts` because they change for different reasons and
 * at different rates: adding a calendar touches only the adapter, accepting a new input format
 * touches only the parser, and a product overriding the hour cycle touches neither. A single
 * utility module would have every product's date concern in one file that nobody can safely edit.
 *
 * The contract that holds it together: **every value crossing a public API is an ISO-8601 Gregorian
 * string**. The calendar the user sees is presentation. That is what makes Hijri — or any other
 * calendar — additive rather than a breaking change.
 */

export type { CalendarAdapter, CalendarDate, TimeOfDay, Weekday, DateRange } from './types.js';

export { gregorianAdapter, daysFromCivil, civilFromDays, isLeapYear } from './gregorian.js';

export {
  toDayNumber,
  fromDayNumber,
  addDays,
  dayOfWeek,
  compareDates,
  isSameDay,
  isSameMonth,
  startOfMonth,
  endOfMonth,
  isWithin,
  clampDate,
  monthGrid,
  type CalendarCell,
  type CalendarWeek,
} from './calendar-math.js';

export {
  createDateParser,
  createTimeParser,
  resolveFieldOrder,
  foldDigits,
  type DateParser,
  type DateParserOptions,
  type TimeParser,
  type DateField,
  type DateFieldOrder,
} from './parser.js';

export {
  createDateFormatter,
  type DateFormatter,
  type DateFormatterOptions,
  type DateStyle,
} from './formatter.js';

export {
  createTimeFormatter,
  resolveHourCycle,
  timeToValue,
  valueToTime,
  timeOptions,
  type TimeFormatter,
  type TimeFormatterOptions,
  type TimeStyle,
  type HourCycle,
} from './time-formatter.js';

export {
  LocaleProvider,
  useLocaleContext,
  useDateSystem,
  isRtlLocale,
  resolveWeekStart,
  type LocaleProviderProps,
  type LocaleContextValue,
  type DateSystem,
  type DateSystemOverrides,
} from './locale-context.js';
