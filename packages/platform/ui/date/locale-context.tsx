'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { CalendarAdapter, Weekday } from './types.js';
import { gregorianAdapter } from './gregorian.js';
import { createDateParser, createTimeParser, type DateParser, type TimeParser } from './parser.js';
import { createDateFormatter, type DateFormatter } from './formatter.js';
import {
  createTimeFormatter,
  resolveHourCycle,
  type HourCycle,
  type TimeFormatter,
} from './time-formatter.js';

/**
 * The top of the stack: one place a product says which locale, calendar and zone it is in, and
 * every date control below picks all of it up.
 *
 * This is the layer that keeps the others honest. A `Calendar` that took a `locale` prop, a
 * `hourCycle` prop and a `weekStartsOn` prop would push the same three values through every call
 * site in an application, and the first screen that forgot one would quietly render a different
 * week start from the screen next to it. Setting them once at the root is both less code and the
 * only way they stay consistent.
 *
 * There is no provider requirement. Outside one, every control resolves sensible defaults from the
 * host — exactly as it did before this layer existed — so adding it to an application is additive.
 */

export interface LocaleContextValue {
  /** BCP-47 tag, e.g. `en-GB`, `ar-JO`. */
  locale: string;
  /** Writing direction, used by the calendar so the arrow keys follow the text, not the array. */
  direction: 'ltr' | 'rtl';
  adapter: CalendarAdapter;
  /** `0` Sunday … `6` Saturday. */
  weekStartsOn: Weekday;
  /** IANA zone used to decide what "today" is. Host zone when undefined. */
  timeZone: string | undefined;
  hourCycle: HourCycle;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export interface LocaleProviderProps {
  locale?: string;
  /** Swap the calendar system. This is the whole extension point: Hijri is a different adapter. */
  calendar?: CalendarAdapter;
  weekStartsOn?: Weekday;
  timeZone?: string;
  hourCycle?: HourCycle;
  direction?: 'ltr' | 'rtl';
  children: ReactNode;
}

/** Locales whose scripts are written right-to-left, by language subtag. */
const RTL_LANGUAGES = new Set([
  'ar',
  'arc',
  'ckb',
  'dv',
  'fa',
  'he',
  'ku',
  'ps',
  'sd',
  'ug',
  'ur',
  'yi',
]);

export function isRtlLocale(locale: string): boolean {
  try {
    const info = new Intl.Locale(locale);
    // `getTextInfo` is the correct source and is not universally available yet, so the language
    // table below stands in for it rather than replacing it.
    const textInfo = (info as unknown as { textInfo?: { direction?: string } }).textInfo;
    if (textInfo?.direction) return textInfo.direction === 'rtl';
    return RTL_LANGUAGES.has(info.language);
  } catch {
    return RTL_LANGUAGES.has(locale.split('-')[0] ?? '');
  }
}

/**
 * Which day the week starts on in this locale.
 *
 * `Intl.Locale.prototype.getWeekInfo` is the right answer and ships in current engines; where it is
 * missing the fallback covers the three groups that matter — Saturday across most of the Arabic
 * -speaking world, Sunday in the Americas and parts of Asia, Monday elsewhere. Getting this wrong is
 * not cosmetic: a Jordanian school looking at a Monday-first grid has to re-read every row.
 */
export function resolveWeekStart(locale: string): Weekday {
  try {
    const info = new Intl.Locale(locale) as unknown as {
      getWeekInfo?: () => { firstDay: number };
      weekInfo?: { firstDay: number };
      region?: string;
      maximize(): { region?: string };
    };
    const week = info.getWeekInfo?.() ?? info.weekInfo;
    // CLDR numbers days 1 = Monday … 7 = Sunday; this codebase uses 0 = Sunday.
    if (week) return (week.firstDay % 7) as Weekday;

    const region = info.region ?? info.maximize().region;
    if (region && SATURDAY_REGIONS.has(region)) return 6;
    if (region && SUNDAY_REGIONS.has(region)) return 0;
    return 1;
  } catch {
    return 1;
  }
}

const SATURDAY_REGIONS = new Set([
  'AE',
  'AF',
  'BH',
  'DZ',
  'EG',
  'IQ',
  'IR',
  'JO',
  'KW',
  'LY',
  'OM',
  'QA',
  'SA',
  'SD',
  'SY',
  'YE',
]);
const SUNDAY_REGIONS = new Set([
  'AG',
  'AS',
  'BD',
  'BR',
  'BS',
  'BT',
  'BW',
  'BZ',
  'CA',
  'CO',
  'DO',
  'ET',
  'GT',
  'GU',
  'HK',
  'HN',
  'ID',
  'IL',
  'IN',
  'JM',
  'JP',
  'KE',
  'KH',
  'KR',
  'LA',
  'MH',
  'MM',
  'MO',
  'MT',
  'MX',
  'MZ',
  'NI',
  'NP',
  'PA',
  'PE',
  'PH',
  'PK',
  'PR',
  'PT',
  'PY',
  'SA',
  'SG',
  'SV',
  'TH',
  'TT',
  'TW',
  'UM',
  'US',
  'VE',
  'VI',
  'WS',
  'YE',
  'ZA',
  'ZW',
]);

/** The host's own locale, or `en-US` on a server where there is no host to ask. */
function hostLocale(): string {
  if (typeof navigator !== 'undefined' && navigator.language) return navigator.language;
  try {
    return new Intl.DateTimeFormat().resolvedOptions().locale;
  } catch {
    return 'en-US';
  }
}

export function LocaleProvider({
  locale,
  calendar = gregorianAdapter,
  weekStartsOn,
  timeZone,
  hourCycle,
  direction,
  children,
}: LocaleProviderProps) {
  const value = useMemo<LocaleContextValue>(() => {
    const resolved = locale ?? hostLocale();
    return {
      locale: resolved,
      direction: direction ?? (isRtlLocale(resolved) ? 'rtl' : 'ltr'),
      adapter: calendar,
      weekStartsOn: weekStartsOn ?? resolveWeekStart(resolved),
      timeZone,
      hourCycle: hourCycle ?? resolveHourCycle(resolved),
    };
  }, [locale, calendar, weekStartsOn, timeZone, hourCycle, direction]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

/** Read the enclosing provider, or `null`. Mirrors `useFieldContext`: absence is not an error. */
export function useLocaleContext(): LocaleContextValue | null {
  return useContext(LocaleContext);
}

/** Per-control overrides. Anything omitted comes from the provider, then from the host. */
export interface DateSystemOverrides {
  locale?: string | undefined;
  adapter?: CalendarAdapter | undefined;
  weekStartsOn?: Weekday | undefined;
  timeZone?: string | undefined;
  hourCycle?: HourCycle | undefined;
}

export interface DateSystem extends LocaleContextValue {
  parser: DateParser;
  timeParser: TimeParser;
  formatter: DateFormatter;
  timeFormatter: TimeFormatter;
}

/**
 * The assembled stack, memoised.
 *
 * Every date control calls this and nothing else — it is the single seam between the components and
 * the five layers underneath. The memo matters: an `Intl.DateTimeFormat` is expensive to build and
 * a calendar grid re-renders on every arrow key.
 */
export function useDateSystem(overrides: DateSystemOverrides = {}): DateSystem {
  const context = useLocaleContext();
  const locale = overrides.locale ?? context?.locale ?? hostLocale();
  const adapter = overrides.adapter ?? context?.adapter ?? gregorianAdapter;
  const timeZone = overrides.timeZone ?? context?.timeZone;
  const hourCycle = overrides.hourCycle ?? context?.hourCycle;
  const weekStartsOn = overrides.weekStartsOn ?? context?.weekStartsOn;
  const direction = context?.direction;

  return useMemo(() => {
    return {
      locale,
      direction: direction ?? (isRtlLocale(locale) ? 'rtl' : 'ltr'),
      adapter,
      weekStartsOn: weekStartsOn ?? resolveWeekStart(locale),
      timeZone,
      hourCycle: hourCycle ?? resolveHourCycle(locale),
      parser: createDateParser({ adapter, locale }),
      timeParser: createTimeParser(locale),
      formatter: createDateFormatter({ adapter, locale }),
      timeFormatter: createTimeFormatter({
        locale,
        ...(hourCycle === undefined ? {} : { hourCycle }),
      }),
    };
  }, [locale, adapter, weekStartsOn, timeZone, hourCycle, direction]);
}
