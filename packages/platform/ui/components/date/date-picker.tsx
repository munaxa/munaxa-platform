'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { cn } from '../../lib/cn.js';
import { CalendarDays } from '../../../icons/index.js';
import { Popover, PopoverAnchor, PopoverContent } from '../overlays/popover.js';
import { Input, fieldBase } from '../forms/input.js';
import { useFieldAria } from '../forms/field-context.js';
import {
  useDateSystem,
  type CalendarAdapter,
  type DateRange,
  type Weekday,
} from '../../date/index.js';
import { Calendar, type CalendarLabels } from './calendar.js';

export interface DatePickerLabels extends CalendarLabels {
  /** Accessible name for the button that opens the calendar. */
  openCalendar?: string;
  /** Accessible name for the calendar dialog. */
  calendar?: string;
  /** Announced when what was typed is not a date. */
  invalid?: string;
  clear?: string;
}

const DEFAULT_LABELS = {
  openCalendar: 'Choose date',
  calendar: 'Calendar',
  invalid: 'Not a valid date.',
  clear: 'Clear date',
} satisfies Required<Omit<DatePickerLabels, keyof CalendarLabels>>;

interface PickerCommonProps {
  min?: string;
  max?: string;
  isDateDisabled?: (iso: string) => boolean;
  locale?: string;
  adapter?: CalendarAdapter;
  weekStartsOn?: Weekday;
  timeZone?: string;
  labels?: DatePickerLabels;
  showWeekNumbers?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  clearable?: boolean;
  className?: string;
  id?: string;
  'aria-label'?: string;
}

export interface DatePickerProps extends PickerCommonProps {
  /** Wire format — `YYYY-MM-DD`. Empty string means nothing is chosen. */
  value: string;
  onChange: (value: string) => void;
}

/**
 * A date field with a calendar attached.
 *
 * Both ways of entering a date are first-class, and that is the point. The text input is the fast
 * path — someone entering fifty dates from a form will type them, and being forced through a
 * calendar for each is the single most common complaint about date pickers. The calendar is the
 * browsing path, for when the answer is "the second Tuesday" rather than a number.
 *
 * Typing is parsed by the locale's own field order, so `3/4/2026` is April in Britain and March in
 * the United States without the component deciding for anyone. The value it emits is always the
 * ISO wire format, whatever calendar is being displayed.
 *
 * The input keeps whatever was typed until it parses. Rewriting the field on every keystroke — the
 * usual "helpful" behaviour — makes it impossible to correct a typo in the middle of a date.
 */
export function DatePicker({
  value,
  onChange,
  min,
  max,
  isDateDisabled,
  locale,
  adapter: adapterProp,
  weekStartsOn,
  timeZone,
  labels,
  showWeekNumbers,
  disabled,
  readOnly,
  clearable = false,
  className,
  ...rest
}: DatePickerProps) {
  const text = { ...DEFAULT_LABELS, ...labels };
  const system = useDateSystem({ locale, adapter: adapterProp, weekStartsOn, timeZone });
  const { adapter, parser, formatter } = system;

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const generatedId = useId();
  const aria = useFieldAria({ ...rest, disabled, readOnly });
  const errorId = `${aria.id ?? generatedId}-date-error`;
  const triggerRef = useRef<HTMLButtonElement>(null);

  const locked = Boolean(aria.disabled) || Boolean(aria.readOnly);
  const display = draft ?? (value ? formatter.formatISO(value, 'input') : '');
  const invalid = draft !== null && draft.trim() !== '' && parser.parse(draft) === null;

  // A value changed from outside — a form reset, a linked field — must replace a stale draft.
  useEffect(() => {
    setDraft(null);
  }, [value]);

  function commit(input: string) {
    if (input.trim() === '') {
      setDraft(null);
      onChange('');
      return;
    }
    const parsed = parser.parse(input);
    if (parsed) {
      setDraft(null);
      onChange(adapter.toISO(parsed));
    }
  }

  return (
    <Popover open={open} onOpenChange={locked ? () => {} : setOpen}>
      <div className={cn('relative', className)}>
        <PopoverAnchor asChild>
          <Input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder={parser.placeholder}
            value={display}
            className="pe-9"
            {...rest}
            {...(disabled === undefined ? {} : { disabled })}
            {...(readOnly === undefined ? {} : { readOnly })}
            {
              // `Input` does its own `Field` wiring, so the field's ids must not be handed back
              // down: they would arrive as an explicit prop and be concatenated onto themselves, and
              // the error would be announced twice. Only what this component adds goes through.
              ...(invalid ? { 'aria-invalid': true as const, 'aria-describedby': errorId } : {})
            }
            onChange={(event) => setDraft(event.target.value)}
            onBlur={(event) => commit(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                commit(event.currentTarget.value);
              } else if (event.key === 'ArrowDown' && event.altKey && !locked) {
                // Alt+Down is the platform convention for "open the associated list".
                event.preventDefault();
                setOpen(true);
              }
            }}
          />
        </PopoverAnchor>

        <button
          ref={triggerRef}
          type="button"
          aria-label={text.openCalendar}
          aria-haspopup="dialog"
          aria-expanded={open}
          disabled={aria.disabled ?? false}
          onClick={() => !locked && setOpen((previous) => !previous)}
          className={cn(
            'absolute inset-y-0 end-0 flex w-9 items-center justify-center rounded-e-md text-muted-foreground',
            'hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            locked && 'pointer-events-none opacity-50',
          )}
        >
          <CalendarDays className="size-4" aria-hidden="true" />
        </button>

        {clearable && value && !locked ? (
          <button
            type="button"
            aria-label={text.clear}
            onClick={() => {
              setDraft(null);
              onChange('');
            }}
            className="absolute inset-y-0 end-9 flex items-center text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            ✕
          </button>
        ) : null}

        {invalid ? (
          <span id={errorId} role="alert" className="mt-1 block text-xs text-destructive">
            {text.invalid}
          </span>
        ) : null}
      </div>

      <PopoverContent
        aria-label={text.calendar}
        align="start"
        className="w-auto p-3"
        onCloseAutoFocus={(event) => {
          // Radix would return focus to the anchor, which is the text input; the button the user
          // actually pressed is the less surprising place to land.
          event.preventDefault();
          triggerRef.current?.focus();
        }}
      >
        <Calendar
          autoFocus
          value={value || null}
          onChange={(next) => {
            onChange(next);
            setDraft(null);
            setOpen(false);
          }}
          {...pickerCalendarProps({
            min,
            max,
            isDateDisabled,
            locale,
            adapter: adapterProp,
            weekStartsOn,
            timeZone,
            labels,
            showWeekNumbers,
          })}
        />
      </PopoverContent>
    </Popover>
  );
}

export interface DateRangePickerProps extends PickerCommonProps {
  value: DateRange;
  onChange: (value: DateRange) => void;
  /** Separator drawn between the two fields. */
  separator?: string;
  startLabel?: string;
  endLabel?: string;
}

/**
 * Two date fields sharing one two-month calendar.
 *
 * One calendar rather than two: choosing a range in two separate pickers means opening a popover,
 * choosing, closing, opening another and choosing again — and nothing on screen ever shows the two
 * dates in relation to each other, which is the only thing a range actually means. Both endpoints
 * remain individually typeable, because a fixed quarter or academic term is faster to type than to
 * page to.
 */
export function DateRangePicker({
  value,
  onChange,
  min,
  max,
  isDateDisabled,
  locale,
  adapter: adapterProp,
  weekStartsOn,
  timeZone,
  labels,
  showWeekNumbers,
  disabled,
  readOnly,
  separator = '–',
  startLabel = 'Start date',
  endLabel = 'End date',
  className,
  ...rest
}: DateRangePickerProps) {
  const text = { ...DEFAULT_LABELS, ...labels };
  const system = useDateSystem({ locale, adapter: adapterProp, weekStartsOn, timeZone });
  const { adapter, parser, formatter } = system;

  const [open, setOpen] = useState(false);
  const aria = useFieldAria({ ...rest, disabled, readOnly });
  const locked = Boolean(aria.disabled) || Boolean(aria.readOnly);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const show = (iso: string | null) => (iso ? formatter.formatISO(iso, 'input') : '');

  function commit(end: 'start' | 'end', input: string) {
    const parsed = input.trim() === '' ? null : parser.parse(input);
    if (input.trim() !== '' && !parsed) return;
    onChange({ ...value, [end]: parsed ? adapter.toISO(parsed) : null });
  }

  return (
    <Popover open={open} onOpenChange={locked ? () => {} : setOpen}>
      <div
        className={cn(
          fieldBase,
          'flex h-9 items-center gap-1 py-0',
          'focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50',
          className,
        )}
      >
        <PopoverAnchor asChild>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            aria-label={startLabel}
            placeholder={parser.placeholder}
            defaultValue={show(value.start)}
            key={`start-${value.start ?? ''}`}
            disabled={aria.disabled ?? false}
            readOnly={aria.readOnly ?? false}
            onBlur={(event) => commit('start', event.target.value)}
            className="w-24 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </PopoverAnchor>
        <span aria-hidden="true" className="text-muted-foreground">
          {separator}
        </span>
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          aria-label={endLabel}
          placeholder={parser.placeholder}
          defaultValue={show(value.end)}
          key={`end-${value.end ?? ''}`}
          disabled={aria.disabled ?? false}
          readOnly={aria.readOnly ?? false}
          onBlur={(event) => commit('end', event.target.value)}
          className="w-24 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        <button
          ref={triggerRef}
          type="button"
          aria-label={text.openCalendar}
          aria-haspopup="dialog"
          aria-expanded={open}
          disabled={aria.disabled ?? false}
          onClick={() => !locked && setOpen((previous) => !previous)}
          className={cn(
            'ms-auto flex size-7 items-center justify-center rounded-md text-muted-foreground',
            'hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            locked && 'pointer-events-none opacity-50',
          )}
        >
          <CalendarDays className="size-4" aria-hidden="true" />
        </button>
      </div>

      <PopoverContent
        aria-label={text.calendar}
        align="start"
        className="w-auto p-3"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          triggerRef.current?.focus();
        }}
      >
        <Calendar
          autoFocus
          mode="range"
          numberOfMonths={2}
          value={value}
          onChange={(next) => {
            onChange(next);
            // Closing on the first click would make the second endpoint unreachable.
            if (next.end) setOpen(false);
          }}
          {...pickerCalendarProps({
            min,
            max,
            isDateDisabled,
            locale,
            adapter: adapterProp,
            weekStartsOn,
            timeZone,
            labels,
            showWeekNumbers,
          })}
        />
      </PopoverContent>
    </Popover>
  );
}

/**
 * Forward only the calendar's own concerns, and only when they were actually supplied.
 *
 * `exactOptionalPropertyTypes` is on, so `{ min: undefined }` is not the same as omitting `min` —
 * spreading conditionally is what keeps a prop the caller never passed from arriving as an explicit
 * `undefined` and overriding an enclosing `LocaleProvider`.
 */
function pickerCalendarProps(options: {
  min: string | undefined;
  max: string | undefined;
  isDateDisabled: ((iso: string) => boolean) | undefined;
  locale: string | undefined;
  adapter: CalendarAdapter | undefined;
  weekStartsOn: Weekday | undefined;
  timeZone: string | undefined;
  labels: DatePickerLabels | undefined;
  showWeekNumbers: boolean | undefined;
}) {
  return {
    ...(options.min === undefined ? {} : { min: options.min }),
    ...(options.max === undefined ? {} : { max: options.max }),
    ...(options.isDateDisabled === undefined ? {} : { isDateDisabled: options.isDateDisabled }),
    ...(options.locale === undefined ? {} : { locale: options.locale }),
    ...(options.adapter === undefined ? {} : { adapter: options.adapter }),
    ...(options.weekStartsOn === undefined ? {} : { weekStartsOn: options.weekStartsOn }),
    ...(options.timeZone === undefined ? {} : { timeZone: options.timeZone }),
    ...(options.labels === undefined ? {} : { labels: options.labels }),
    ...(options.showWeekNumbers === undefined ? {} : { showWeekNumbers: options.showWeekNumbers }),
  };
}
