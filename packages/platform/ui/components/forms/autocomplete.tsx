'use client';

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { cn } from '../../lib/cn.js';
import { Input } from './input.js';
import { useFieldAria } from './field-context.js';
import type { ComboboxLabels, ComboboxOption } from './combobox.js';

export interface AutocompleteProps {
  options: ComboboxOption[];
  /** Selected value. Empty string means nothing is selected. */
  value: string;
  onChange: (value: string) => void;
  labels?: ComboboxLabels;
  /** Hand filtering to the caller — for server-side search. Debounced. */
  onSearch?: (query: string) => void;
  searchDebounce?: number;
  loading?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  /**
   * Allow a value the list does not contain. The raw text is reported through `onChange` as the
   * user types, for "search or paste an id" flows.
   */
  allowCustomValue?: boolean;
  footer?: ReactNode;
  className?: string;
  id?: string;
  'aria-label'?: string;
}

const DEFAULTS = { placeholder: 'Search…', empty: 'No results.', loading: 'Loading…' };

/**
 * A text input that filters a list as you type — the APG "combobox with list autocomplete".
 *
 * This and `Combobox` are the two genuinely different selection interactions, and the difference
 * is not cosmetic. Here the field *is* the search box: focus lands on it, typing filters in place,
 * and the value can often be typed rather than chosen. `Combobox` is a button that opens a panel
 * with its own search box, which suits a long list the user browses rather than types.
 *
 * Focus never leaves the input. The arrow keys move `aria-activedescendant` across the listbox, so
 * a screen reader announces each option while the caret stays put — an implementation that moved
 * DOM focus into the list would break typing entirely.
 *
 * Inside a `Field` it inherits the id, description, validity and disabled/read-only state.
 */
export function Autocomplete({
  options,
  value,
  onChange,
  labels,
  onSearch,
  searchDebounce = 250,
  loading = false,
  disabled,
  readOnly,
  allowCustomValue = false,
  footer,
  className,
  ...rest
}: AutocompleteProps) {
  const text = { ...DEFAULTS, ...labels };
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generatedId = useId();
  const aria = useFieldAria({ ...rest, disabled, readOnly });
  const listId = `${aria.id ?? generatedId}-list`;

  const selected = useMemo(() => options.find((o) => o.value === value), [options, value]);

  // Local filtering unless the caller has taken it over.
  const filtered = useMemo(() => {
    if (onSearch) return options.slice(0, 50);
    const q = query.trim().toLowerCase();
    if (!q) return options.slice(0, 50);
    return options
      .filter((o) => `${o.label} ${o.description ?? ''}`.toLowerCase().includes(q))
      .slice(0, 50);
  }, [options, query, onSearch]);

  useEffect(() => {
    if (!onSearch) return;
    searchTimer.current = setTimeout(() => onSearch(query), searchDebounce);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [query, onSearch, searchDebounce]);

  function choose(optionValue: string) {
    onChange(optionValue);
    setQuery('');
    setOpen(false);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!open) setOpen(true);
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (event.key === 'Enter') {
      const option = filtered[activeIndex];
      if (open && option) {
        event.preventDefault();
        choose(option.value);
      }
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  }

  const display = open ? query : (selected?.label ?? query);
  const activeOption = open ? filtered[activeIndex] : undefined;

  return (
    <div className={cn('relative', className)}>
      <Input
        type="search"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        {...(activeOption
          ? { 'aria-activedescendant': `${listId}-opt-${activeOption.value}` }
          : {})}
        value={display}
        placeholder={text.placeholder}
        {...rest}
        {...aria}
        onChange={(event) => {
          setQuery(event.target.value);
          setActiveIndex(0);
          setOpen(true);
          if (allowCustomValue) onChange(event.target.value);
        }}
        onFocus={() => {
          if (aria.readOnly) return;
          setQuery('');
          setActiveIndex(0);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => {
          // Deferred so a pointer-down on an option is not cancelled by the blur that precedes it.
          blurTimer.current = setTimeout(() => setOpen(false), 120);
        }}
      />

      {open ? (
        // A listbox owns its options directly: `role="listbox"` replaces a `<ul>`'s implicit list
        // role, orphaning any `<li>` inside it, and an option may not contain a control.
        <div
          id={listId}
          role="listbox"
          className="absolute z-dropdown mt-1 max-h-64 w-full overflow-auto rounded-lg border border-border bg-card p-1 shadow-card"
          onMouseDown={() => blurTimer.current && clearTimeout(blurTimer.current)}
        >
          {loading ? (
            <div className="px-2 py-1.5 text-sm text-muted-foreground">{text.loading}</div>
          ) : (
            <>
              {filtered.map((option, index) => (
                <div
                  key={option.value}
                  id={`${listId}-opt-${option.value}`}
                  role="option"
                  aria-selected={option.value === value}
                  onClick={() => choose(option.value)}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={cn(
                    'flex w-full cursor-pointer flex-col items-start rounded-md px-2 py-1.5 text-start text-sm',
                    index === activeIndex
                      ? 'bg-secondary/80 text-foreground'
                      : option.value === value
                        ? 'bg-secondary/50 text-foreground'
                        : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground',
                  )}
                >
                  <span>{option.label}</span>
                  {option.description ? (
                    <span className="font-mono text-[10px] text-muted-foreground/70">
                      {option.description}
                    </span>
                  ) : null}
                </div>
              ))}
              {filtered.length === 0 ? (
                <div className="px-2 py-1.5 text-sm text-muted-foreground">{text.empty}</div>
              ) : null}
            </>
          )}
          {footer ? <div className="border-t border-border pt-1">{footer}</div> : null}
        </div>
      ) : null}
    </div>
  );
}
