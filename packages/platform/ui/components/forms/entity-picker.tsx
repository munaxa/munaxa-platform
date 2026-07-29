'use client';

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { cn } from '../../lib/cn.js';
import { Input } from './input.js';

export interface PickerOption {
  id: string;
  label: string;
  sublabel?: string;
}

/**
 * Searchable entity picker (ARIA combobox) backed by a list API. Loads options once; while options
 * are available it offers type-to-filter selection with full keyboard support (↑/↓ to move, Enter to
 * select, Esc to close) and screen-reader semantics (combobox + listbox/option, aria-activedescendant).
 * If the list can't be loaded (e.g. the signed-in role lacks the list permission), it gracefully
 * falls back to a plain ID input so the flow still works. Returns the selected entity id via `onChange`.
 */
export function EntityPicker({
  value,
  onChange,
  load,
  placeholder = 'Search…',
  noMatchesLabel = 'No matches.',
}: {
  value: string;
  onChange: (id: string) => void;
  load: () => Promise<PickerOption[]>;
  placeholder?: string;
  noMatchesLabel?: string;
}) {
  const [options, setOptions] = useState<PickerOption[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listId = useId();

  useEffect(() => {
    let active = true;
    load()
      .then((opts) => active && setOptions(opts))
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, [load]);

  const selected = useMemo(() => options?.find((o) => o.id === value) ?? null, [options, value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = options ?? [];
    if (!q) return list.slice(0, 50);
    return list
      .filter((o) => `${o.label} ${o.sublabel ?? ''}`.toLowerCase().includes(q))
      .slice(0, 50);
  }, [options, query]);

  function choose(id: string) {
    onChange(id);
    setQuery('');
    setOpen(false);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) setOpen(true);
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      if (open && filtered[activeIndex]) {
        e.preventDefault();
        choose(filtered[activeIndex].id);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  // Fallback: manual id entry when the list isn't available.
  if (failed) {
    return (
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="Paste ID" />
    );
  }

  const display = open ? query : (selected?.label ?? query);
  const activeId =
    open && filtered[activeIndex] ? `${listId}-opt-${filtered[activeIndex].id}` : undefined;

  return (
    <div className="relative">
      <Input
        type="search"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={activeId}
        value={display}
        placeholder={options ? placeholder : 'Loading…'}
        onChange={(e) => {
          setQuery(e.target.value);
          setActiveIndex(0);
          setOpen(true);
        }}
        onFocus={() => {
          setQuery('');
          setActiveIndex(0);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => {
          blurTimer.current = setTimeout(() => setOpen(false), 120);
        }}
      />
      {open && options ? (
        // A listbox must own its options directly: `role="listbox"` replaces a `<ul>`'s implicit
        // list role, which orphans any `<li>` inside it, and an option may not contain a control.
        // Options are therefore plain elements — keyboard focus stays on the input and moves
        // through `aria-activedescendant`, which is the APG combobox pattern.
        <div
          id={listId}
          role="listbox"
          className="absolute z-dropdown mt-1 max-h-64 w-full overflow-auto rounded-lg border border-border bg-card p-1 shadow-card"
          onMouseDown={() => blurTimer.current && clearTimeout(blurTimer.current)}
        >
          {filtered.map((o, i) => (
            <div
              key={o.id}
              id={`${listId}-opt-${o.id}`}
              role="option"
              aria-selected={o.id === value}
              onClick={() => choose(o.id)}
              onMouseEnter={() => setActiveIndex(i)}
              className={cn(
                'flex w-full cursor-pointer flex-col items-start rounded-md px-2 py-1.5 text-start text-sm',
                i === activeIndex
                  ? 'bg-secondary/80 text-foreground'
                  : o.id === value
                    ? 'bg-secondary/50 text-foreground'
                    : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground',
              )}
            >
              <span>{o.label}</span>
              {o.sublabel ? (
                <span className="font-mono text-[10px] text-muted-foreground/70">{o.sublabel}</span>
              ) : null}
            </div>
          ))}
          {filtered.length === 0 ? (
            <div className="px-2 py-1.5 text-sm text-muted-foreground">{noMatchesLabel}</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
