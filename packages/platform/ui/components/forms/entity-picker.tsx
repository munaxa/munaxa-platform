'use client';

import { useEffect, useMemo, useState } from 'react';
import { Autocomplete } from './autocomplete.js';
import type { ComboboxOption } from './combobox.js';
import { Input } from './input.js';

export interface PickerOption {
  id: string;
  label: string;
  sublabel?: string;
}

export interface EntityPickerProps {
  value: string;
  onChange: (id: string) => void;
  load: () => Promise<PickerOption[]>;
  placeholder?: string;
  noMatchesLabel?: string;
}

/**
 * Searchable entity picker backed by a list API.
 *
 * This is now a thin adapter over `Autocomplete`: it owns the *loading* concern — call the API
 * once, map the result, and fall back to manual id entry when the list cannot be fetched — and
 * delegates every bit of interaction. The 120 lines it used to carry (arrow-key movement,
 * `aria-activedescendant`, blur timers, the open/close state machine) were a second implementation
 * of that pattern, and a second implementation is a second set of keyboard bugs.
 *
 * `Autocomplete` rather than `Combobox` because those are two different interactions, not two
 * skins: this field *is* the search box — focus it and type — whereas a `Combobox` is a button that
 * opens a panel with its own search box. Swapping in the wrong one would have changed how the
 * control behaves for every existing caller.
 *
 * The public API is unchanged: same props, same `onChange(id)` contract, same graceful fallback
 * when the signed-in role lacks the list permission.
 */
export function EntityPicker({
  value,
  onChange,
  load,
  placeholder = 'Search…',
  noMatchesLabel = 'No matches.',
}: EntityPickerProps) {
  const [options, setOptions] = useState<PickerOption[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    load()
      .then((opts) => active && setOptions(opts))
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, [load]);

  const comboboxOptions = useMemo<ComboboxOption[]>(
    () =>
      (options ?? []).map((option) => ({
        value: option.id,
        label: option.label,
        ...(option.sublabel === undefined ? {} : { description: option.sublabel }),
      })),
    [options],
  );

  // The list is unavailable — most often because the role cannot call it. Degrading to manual id
  // entry keeps the surrounding flow completable instead of blocking it behind a permission.
  if (failed) {
    return (
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="Paste ID" />
    );
  }

  return (
    <Autocomplete
      options={comboboxOptions}
      value={value}
      onChange={onChange}
      labels={{
        placeholder: options ? placeholder : 'Loading…',
        searchPlaceholder: placeholder,
        empty: noMatchesLabel,
      }}
    />
  );
}
