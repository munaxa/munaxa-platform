'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { cn } from '../../lib/cn.js';
import { Check, ChevronsUpDown, X } from '../../../icons/index.js';
import { Popover, PopoverContent, PopoverTrigger } from '../overlays/popover.js';
import { Spinner } from '../feedback/spinner.js';
import { Tag } from '../primitives/tag.js';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from './command.js';
import { useFieldAria } from './field-context.js';
import { fieldBase } from './input.js';

export interface ComboboxOption {
  value: string;
  label: string;
  /** Secondary line — a code, an email, a department. Also searched. */
  description?: string;
  icon?: ReactNode;
  disabled?: boolean;
  /** Optional grouping heading. Options sharing a group render under one heading. */
  group?: string;
}

/** Labels every combobox-family control needs, so a product can translate all of them. */
export interface ComboboxLabels {
  placeholder?: string;
  searchPlaceholder?: string;
  empty?: string;
  loading?: string;
  clear?: string;
  /** Used by MultiSelect for each removable token: receives the option's label. */
  remove?: (label: string) => string;
}

const DEFAULT_LABELS: Required<Omit<ComboboxLabels, 'remove'>> & {
  remove: (label: string) => string;
} = {
  placeholder: 'Select…',
  searchPlaceholder: 'Search…',
  empty: 'No results.',
  loading: 'Loading…',
  clear: 'Clear selection',
  remove: (label) => `Remove ${label}`,
};

/**
 * Shared plumbing for the combobox family.
 *
 * `onSearch` is what makes async work: supplying it switches filtering off locally and hands the
 * query to the caller, so the same component serves a fixed list and a server-side search without
 * a second implementation. The debounce lives here rather than in each product.
 */
function useAsyncSearch(onSearch: ((query: string) => void) | undefined, delay: number) {
  const [query, setQuery] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!onSearch) return;
    timer.current = setTimeout(() => onSearch(query), delay);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [query, onSearch, delay]);

  return { query, setQuery };
}

/** Group options in the order their groups first appear, so the list order is stable. */
function groupOptions(options: ComboboxOption[]): Array<[string | undefined, ComboboxOption[]]> {
  const groups = new Map<string | undefined, ComboboxOption[]>();
  for (const option of options) {
    const existing = groups.get(option.group);
    if (existing) existing.push(option);
    else groups.set(option.group, [option]);
  }
  return [...groups.entries()];
}

export interface ComboboxProps {
  options: ComboboxOption[];
  /** Selected value. Empty string means nothing is selected. */
  value: string;
  onChange: (value: string) => void;
  labels?: ComboboxLabels;
  /** Hand filtering to the caller — for server-side search. Debounced. */
  onSearch?: (query: string) => void;
  searchDebounce?: number;
  loading?: boolean;
  /** Show a control that resets the selection. */
  clearable?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  /** Rendered under the list — "Create new…", "See all results". */
  footer?: ReactNode;
  className?: string;
  id?: string;
  'aria-label'?: string;
}

/**
 * Single-select from a searchable list.
 *
 * The trigger is a `combobox` button and the panel holds a `listbox`; focus stays in the search
 * input while the arrow keys move `aria-activedescendant` through the options, which is the APG
 * pattern and the reason a screen reader announces each option as you arrow past it.
 *
 * Inside a `Field` it inherits the id, `aria-describedby`, `aria-invalid`, `required`, `disabled`
 * and `readOnly` with nothing repeated at the call site.
 */
export function Combobox({
  options,
  value,
  onChange,
  labels,
  onSearch,
  searchDebounce = 250,
  loading = false,
  clearable = false,
  disabled,
  readOnly,
  footer,
  className,
  ...rest
}: ComboboxProps) {
  const text = { ...DEFAULT_LABELS, ...labels };
  const [open, setOpen] = useState(false);
  const { query, setQuery } = useAsyncSearch(onSearch, searchDebounce);
  const aria = useFieldAria({ ...rest, disabled, readOnly });
  const selected = useMemo(() => options.find((o) => o.value === value), [options, value]);
  const grouped = useMemo(() => groupOptions(options), [options]);

  // Read-only is not disabled: the value must stay reachable and copyable, so the trigger keeps
  // its place in the tab order and simply refuses to open.
  const locked = Boolean(aria.disabled) || Boolean(aria.readOnly);

  return (
    <Popover open={open} onOpenChange={locked ? () => {} : setOpen}>
      {/* The clear control is a sibling of the trigger, not a child: a button inside a button is
          invalid HTML and the inner one is not reachable by keyboard or by assistive technology. */}
      <div className={cn('relative', className)}>
        <PopoverTrigger
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          {...rest}
          {...aria}
          disabled={aria.disabled}
          className={cn(
            fieldBase,
            'flex h-9 items-center justify-between gap-2 text-start',
            !selected && 'text-muted-foreground',
            locked && 'cursor-not-allowed',
            clearable && selected && !locked && 'pe-14',
          )}
        >
          <span className="truncate">{selected?.label ?? text.placeholder}</span>
          <ChevronsUpDown className="size-3.5 shrink-0 opacity-50" aria-hidden="true" />
        </PopoverTrigger>

        {clearable && selected && !locked ? (
          <button
            type="button"
            aria-label={text.clear}
            onClick={() => onChange('')}
            className={cn(
              'absolute inset-y-0 end-7 flex items-center rounded-sm opacity-60',
              'hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            )}
          >
            <X className="size-3.5" aria-hidden="true" />
          </button>
        ) : null}
      </div>

      <PopoverContent
        aria-label={text.searchPlaceholder}
        align="start"
        className="w-(--radix-popover-trigger-width) p-0"
      >
        <Command shouldFilter={!onSearch}>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder={text.searchPlaceholder}
          />
          <CommandList>
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                <Spinner className="size-4" />
                {text.loading}
              </div>
            ) : (
              <>
                <CommandEmpty>{text.empty}</CommandEmpty>
                {grouped.map(([group, groupItems]) => (
                  <CommandGroup key={group ?? '__ungrouped'} heading={group}>
                    {groupItems.map((option) => (
                      <CommandItem
                        key={option.value}
                        value={`${option.label} ${option.description ?? ''}`}
                        {...(option.disabled === undefined ? {} : { disabled: option.disabled })}
                        onSelect={() => {
                          onChange(option.value);
                          setOpen(false);
                        }}
                      >
                        {option.icon}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">{option.label}</span>
                          {option.description ? (
                            <span className="block truncate text-xs text-muted-foreground">
                              {option.description}
                            </span>
                          ) : null}
                        </span>
                        {option.value === value ? (
                          <Check className="size-4 shrink-0" aria-hidden="true" />
                        ) : null}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ))}
              </>
            )}
          </CommandList>
          {footer ? <div className="border-t border-border p-1">{footer}</div> : null}
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export interface MultiSelectProps extends Omit<ComboboxProps, 'value' | 'onChange'> {
  value: string[];
  onChange: (value: string[]) => void;
  /** Cap the selection. The list disables once reached rather than silently ignoring clicks. */
  maxSelected?: number;
}

/**
 * Multi-select from a searchable list, with the selection shown as removable tokens.
 *
 * The panel stays open on select, because choosing several things one dismissal at a time is the
 * single most common complaint about multi-selects. Each token's remove control is a real button
 * with its own accessible name, so a selection can be undone without a pointer.
 */
export function MultiSelect({
  options,
  value,
  onChange,
  labels,
  onSearch,
  searchDebounce = 250,
  loading = false,
  maxSelected,
  disabled,
  readOnly,
  footer,
  className,
  ...rest
}: MultiSelectProps) {
  const text = { ...DEFAULT_LABELS, ...labels };
  const [open, setOpen] = useState(false);
  const { query, setQuery } = useAsyncSearch(onSearch, searchDebounce);
  const aria = useFieldAria({ ...rest, disabled, readOnly });
  const grouped = useMemo(() => groupOptions(options), [options]);
  const selected = useMemo(
    () =>
      value
        .map((v) => options.find((o) => o.value === v))
        .filter((o): o is ComboboxOption => Boolean(o)),
    [options, value],
  );

  const locked = Boolean(aria.disabled) || Boolean(aria.readOnly);
  const atLimit = maxSelected !== undefined && value.length >= maxSelected;

  const toggle = (optionValue: string) => {
    onChange(
      value.includes(optionValue)
        ? value.filter((v) => v !== optionValue)
        : [...value, optionValue],
    );
  };

  return (
    <Popover open={open} onOpenChange={locked ? () => {} : setOpen}>
      <PopoverTrigger
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        {...rest}
        {...aria}
        disabled={aria.disabled}
        className={cn(
          fieldBase,
          'flex min-h-9 flex-wrap items-center gap-1 py-1 text-start',
          locked && 'cursor-not-allowed',
          className,
        )}
      >
        {selected.length === 0 ? (
          <span className="truncate text-muted-foreground">{text.placeholder}</span>
        ) : (
          selected.map((option) => (
            <Tag
              key={option.value}
              size="sm"
              {...(locked
                ? {}
                : {
                    onRemove: () => toggle(option.value),
                    removeLabel: text.remove(option.label),
                  })}
            >
              {option.label}
            </Tag>
          ))
        )}
        <ChevronsUpDown className="ms-auto size-3.5 shrink-0 opacity-50" aria-hidden="true" />
      </PopoverTrigger>

      <PopoverContent
        aria-label={text.searchPlaceholder}
        align="start"
        className="w-(--radix-popover-trigger-width) p-0"
      >
        <Command shouldFilter={!onSearch}>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder={text.searchPlaceholder}
          />
          <CommandList>
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                <Spinner className="size-4" />
                {text.loading}
              </div>
            ) : (
              <>
                <CommandEmpty>{text.empty}</CommandEmpty>
                {grouped.map(([group, groupItems]) => (
                  <CommandGroup key={group ?? '__ungrouped'} heading={group}>
                    {groupItems.map((option) => {
                      const isSelected = value.includes(option.value);
                      return (
                        <CommandItem
                          key={option.value}
                          value={`${option.label} ${option.description ?? ''}`}
                          // At the limit, only deselection stays available.
                          disabled={Boolean(option.disabled) || (atLimit && !isSelected)}
                          onSelect={() => toggle(option.value)}
                        >
                          <span
                            aria-hidden="true"
                            className={cn(
                              'flex size-4 shrink-0 items-center justify-center rounded-sm border',
                              isSelected
                                ? 'border-primary bg-primary text-primary-foreground'
                                : 'border-input',
                            )}
                          >
                            {isSelected ? <Check className="size-3" /> : null}
                          </span>
                          {option.icon}
                          <span className="min-w-0 flex-1">
                            <span className="block truncate">{option.label}</span>
                            {option.description ? (
                              <span className="block truncate text-xs text-muted-foreground">
                                {option.description}
                              </span>
                            ) : null}
                          </span>
                          {/* The tick is decorative; selection has to reach AT as text. */}
                          <span className="sr-only">{isSelected ? 'Selected' : ''}</span>
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                ))}
              </>
            )}
          </CommandList>
          {footer ? <div className="border-t border-border p-1">{footer}</div> : null}
        </Command>
      </PopoverContent>
    </Popover>
  );
}
