'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { cn } from '../../lib/cn.js';
import { Clock } from '../../../icons/index.js';
import { Popover, PopoverAnchor, PopoverContent } from '../overlays/popover.js';
import { Input } from '../forms/input.js';
import { useFieldAria } from '../forms/field-context.js';
import { Command, CommandEmpty, CommandItem, CommandList } from '../forms/command.js';
import { DatePicker } from './date-picker.js';
import {
  timeOptions,
  timeToValue,
  useDateSystem,
  type CalendarAdapter,
  type HourCycle,
} from '../../date/index.js';

export interface TimePickerLabels {
  openList?: string;
  list?: string;
  invalid?: string;
  empty?: string;
}

const DEFAULT_LABELS: Required<TimePickerLabels> = {
  openList: 'Choose time',
  list: 'Times',
  invalid: 'Not a valid time.',
  empty: 'No times available.',
};

export interface TimePickerProps {
  /** Wire format — `HH:mm` on a 24-hour clock, whatever the display shows. */
  value: string;
  onChange: (value: string) => void;
  /** Minutes between the offered times. */
  step?: number;
  min?: string;
  max?: string;
  locale?: string;
  /** Override the locale's clock. A timetable is often 24-hour in a 12-hour locale. */
  hourCycle?: HourCycle;
  labels?: TimePickerLabels;
  disabled?: boolean;
  readOnly?: boolean;
  /** Mandatory field — passes through to the text input so native form validation is unchanged. */
  required?: boolean;
  className?: string;
  id?: string;
  'aria-label'?: string;
}

/**
 * A time field with a list of times attached.
 *
 * Typing wins here even more than it does for dates: the offered list is a compromise — a 15-minute
 * step cannot express 09:05 — so the field accepts anything the locale's time parser understands,
 * including `9`, `9:05`, `9 pm` and the locale's own meridiem in its own script. The list is a
 * convenience on top, not the only way in.
 *
 * The 12- or 24-hour display comes from the locale and can be overridden per field. It is
 * presentation only: the value emitted is always 24-hour `HH:mm`, so changing the display never
 * changes what a form submits.
 */
export function TimePicker({
  value,
  onChange,
  step = 30,
  min,
  max,
  locale,
  hourCycle,
  labels,
  disabled,
  readOnly,
  className,
  ...rest
}: TimePickerProps) {
  const text = { ...DEFAULT_LABELS, ...labels };
  const system = useDateSystem({
    locale,
    ...(hourCycle === undefined ? {} : { hourCycle }),
  });
  const { timeParser, timeFormatter } = system;

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const generatedId = useId();
  const aria = useFieldAria({ ...rest, disabled, readOnly });
  const errorId = `${aria.id ?? generatedId}-time-error`;
  const triggerRef = useRef<HTMLButtonElement>(null);

  const locked = Boolean(aria.disabled) || Boolean(aria.readOnly);
  const display = draft ?? (value ? timeFormatter.formatValue(value) : '');
  const invalid = draft !== null && draft.trim() !== '' && timeParser.parse(draft) === null;

  useEffect(() => {
    setDraft(null);
  }, [value]);

  const options = useMemo(
    () => timeOptions(step, min, max).map((time) => timeToValue(time)),
    [step, min, max],
  );

  function commit(input: string) {
    if (input.trim() === '') {
      setDraft(null);
      onChange('');
      return;
    }
    const parsed = timeParser.parse(input);
    if (parsed) {
      setDraft(null);
      onChange(timeToValue(parsed));
    }
  }

  return (
    <Popover open={open} onOpenChange={locked ? () => {} : setOpen}>
      <div className={cn('relative', className)}>
        <PopoverAnchor asChild>
          <Input
            type="text"
            autoComplete="off"
            placeholder={timeParser.placeholder}
            value={display}
            className="pe-9"
            {...rest}
            {...(disabled === undefined ? {} : { disabled })}
            {...(readOnly === undefined ? {} : { readOnly })}
            {
              // See `DatePicker`: `Input` already reads the enclosing `Field`, so only this
              // component's own error wiring is passed down.
              ...(invalid ? { 'aria-invalid': true as const, 'aria-describedby': errorId } : {})
            }
            onChange={(event) => setDraft(event.target.value)}
            onBlur={(event) => commit(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                commit(event.currentTarget.value);
              } else if (event.key === 'ArrowDown' && event.altKey && !locked) {
                event.preventDefault();
                setOpen(true);
              }
            }}
          />
        </PopoverAnchor>

        <button
          ref={triggerRef}
          type="button"
          aria-label={text.openList}
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
          <Clock className="size-4" aria-hidden="true" />
        </button>

        {invalid ? (
          <span id={errorId} role="alert" className="mt-1 block text-xs text-destructive">
            {text.invalid}
          </span>
        ) : null}
      </div>

      <PopoverContent
        aria-label={text.list}
        align="start"
        className="w-(--radix-popover-trigger-width) min-w-40 p-0"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          triggerRef.current?.focus();
        }}
      >
        {/* `Command` supplies the listbox semantics and the arrow-key handling the platform already
            uses everywhere else. No input: the field above *is* the search box. */}
        <Command loop>
          <CommandList className="max-h-56">
            <CommandEmpty>{text.empty}</CommandEmpty>
            {options.map((option) => (
              <CommandItem
                key={option}
                value={option}
                onSelect={() => {
                  setDraft(null);
                  onChange(option);
                  setOpen(false);
                }}
                className={cn(option === value && 'bg-secondary font-medium')}
              >
                {timeFormatter.formatValue(option)}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export interface DateTimePickerProps {
  /** Wire format — `YYYY-MM-DDTHH:mm`. Empty string means nothing is chosen. */
  value: string;
  onChange: (value: string) => void;
  step?: number;
  minDate?: string;
  maxDate?: string;
  locale?: string;
  adapter?: CalendarAdapter;
  timeZone?: string;
  hourCycle?: HourCycle;
  dateLabel?: string;
  timeLabel?: string;
  disabled?: boolean;
  readOnly?: boolean;
  /** Mandatory field. Applied to the date half — a datetime with no date is not a moment at all. */
  required?: boolean;
  className?: string;
  id?: string;
  'aria-label'?: string;
}

/**
 * A date and a time, as two controls rather than one.
 *
 * A combined field would have to parse "3 April 2026 half past nine" — every ambiguity of both
 * parsers at once, in one string, with no way to tell which half a correction belongs to. Two
 * controls each stay simple and each stay individually correctable, which is what people actually
 * do: fix the time without touching the date.
 *
 * The composition is the only thing here. Both halves are the platform's own pickers, so the
 * calendar, the locale, the parsers and the keyboard behaviour are all inherited rather than
 * restated — and a Hijri adapter reaches this component without it knowing about calendars at all.
 */
export function DateTimePicker({
  value,
  onChange,
  step = 15,
  minDate,
  maxDate,
  locale,
  adapter,
  timeZone,
  hourCycle,
  dateLabel = 'Date',
  timeLabel = 'Time',
  disabled,
  readOnly,
  required,
  className,
  ...rest
}: DateTimePickerProps) {
  const aria = useFieldAria({
    ...rest,
    disabled,
    readOnly,
    ...(required === undefined ? {} : { required }),
  });
  const [datePart, timePart] = splitDateTime(value);

  // A time on its own is not a moment, so it is held until a date arrives rather than emitted as a
  // malformed value the caller would have to defend against.
  const [pendingTime, setPendingTime] = useState('');
  const time = timePart || pendingTime;

  function emit(nextDate: string, nextTime: string) {
    if (!nextDate) {
      setPendingTime(nextTime);
      onChange('');
      return;
    }
    setPendingTime('');
    onChange(nextTime ? `${nextDate}T${nextTime}` : nextDate);
  }

  return (
    <div className={cn('flex flex-wrap items-start gap-2', className)}>
      <div className="w-40">
        <DatePicker
          aria-label={dateLabel}
          value={datePart}
          onChange={(next) => emit(next, time)}
          required={aria.required ?? false}
          disabled={aria.disabled ?? false}
          readOnly={aria.readOnly ?? false}
          {...(minDate === undefined ? {} : { min: minDate })}
          {...(maxDate === undefined ? {} : { max: maxDate })}
          {...(locale === undefined ? {} : { locale })}
          {...(adapter === undefined ? {} : { adapter })}
          {...(timeZone === undefined ? {} : { timeZone })}
        />
      </div>
      <div className="w-32">
        <TimePicker
          aria-label={timeLabel}
          value={time}
          onChange={(next) => emit(datePart, next)}
          step={step}
          {...(locale === undefined ? {} : { locale })}
          {...(hourCycle === undefined ? {} : { hourCycle })}
          disabled={aria.disabled ?? false}
          readOnly={aria.readOnly ?? false}
        />
      </div>
    </div>
  );
}

/** Split without `Date`: the string is already the two halves, joined by a `T`. */
function splitDateTime(value: string): [string, string] {
  const [date = '', rest = ''] = value.split('T');
  return [date, rest.slice(0, 5)];
}
