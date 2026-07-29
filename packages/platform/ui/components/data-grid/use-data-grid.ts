'use client';

import { useCallback, useMemo, useState } from 'react';
import type { CellValue, ColumnDef, DataGridMode, DataGridState, SortDescriptor } from './types.js';

/**
 * The grid's brain, with no DOM in it.
 *
 * Splitting the state and the derivation out of the component is what makes the public API
 * survivable. A product can drive `useDataGrid` on its own — to build a saved-views feature, to
 * mirror the state into the URL, to render the same data as cards on a phone — and the component
 * becomes one consumer of the hook rather than the only way in.
 *
 * It is also the seam between client and server mode. In `'client'` mode this hook does the
 * sorting, searching and slicing; in `'server'` mode it does none of it and simply reports the
 * state so the caller can put it in a query. Nothing in the component below knows which it is.
 */

export const DEFAULT_STATE: DataGridState = {
  sort: null,
  search: '',
  page: 1,
  pageSize: 25,
  hiddenColumns: [],
  columnWidths: {},
};

export interface UseDataGridOptions<T> {
  rows: T[];
  columns: ColumnDef<T>[];
  getRowId: (row: T) => string;
  mode?: DataGridMode;
  /** Total rows behind a server-mode query. Ignored in client mode. */
  rowCount?: number;
  /** Uncontrolled starting point. */
  defaultState?: Partial<DataGridState>;
  /** Controlled state. Supplying it makes every change go through `onStateChange`. */
  state?: DataGridState;
  onStateChange?: (state: DataGridState) => void;
  /** Turn paging off entirely — for a virtualized grid showing everything at once. */
  paginated?: boolean;
}

export interface DataGridApi<T> {
  state: DataGridState;
  setState: (next: Partial<DataGridState>) => void;
  /** Columns in render order, with hidden ones removed. */
  visibleColumns: ColumnDef<T>[];
  /** The rows to render — filtered, sorted and paged in client mode; untouched in server mode. */
  rows: T[];
  /** Rows matching the search, before paging. The count a product shows the user. */
  filteredCount: number;
  pageCount: number;
  toggleSort: (columnId: string) => void;
  toggleColumn: (columnId: string, visible: boolean) => void;
  setColumnWidth: (columnId: string, width: number) => void;
  getRowId: (row: T) => string;
}

/** Case- and accent-insensitive contains, so `Hadad` finds `Haddād`. */
function matches(value: CellValue, query: string): boolean {
  if (value === null || value === undefined) return false;
  return normalise(String(value)).includes(query);
}

function normalise(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

function isEmpty(value: CellValue): boolean {
  return value === null || value === undefined || value === '';
}

/**
 * Compare two non-empty cell values.
 *
 * Numbers compare numerically and strings compare with `Intl.Collator`, because `<` on strings
 * sorts by code point: it puts `Z` before `a`, and it puts `Émile` after `Zoë`. A directory of
 * people sorted that way is visibly wrong to anyone whose name has an accent in it.
 *
 * Empty cells are handled by the caller rather than here, and that is not tidiness: they must sort
 * last in *both* directions, so the rule has to be applied before the ascending/descending sign is,
 * or reversing the sort would bring every blank row to the top.
 */
function makeComparator(locale: string | undefined) {
  const collator = new Intl.Collator(locale, { numeric: true, sensitivity: 'base' });
  return (a: CellValue, b: CellValue): number => {
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);
    return collator.compare(String(a), String(b));
  };
}

export function useDataGrid<T>({
  rows,
  columns,
  getRowId,
  mode = 'client',
  rowCount,
  defaultState,
  state: controlled,
  onStateChange,
  paginated = true,
  locale,
}: UseDataGridOptions<T> & { locale?: string }): DataGridApi<T> {
  const [uncontrolled, setUncontrolled] = useState<DataGridState>(() => ({
    ...DEFAULT_STATE,
    // A column hidden by default seeds the state; after that it is the user's to change.
    hiddenColumns: columns.filter((column) => column.defaultHidden).map((column) => column.id),
    ...defaultState,
  }));

  const state = controlled ?? uncontrolled;

  const setState = useCallback(
    (patch: Partial<DataGridState>) => {
      const next = { ...state, ...patch };
      if (!controlled) setUncontrolled(next);
      onStateChange?.(next);
    },
    [state, controlled, onStateChange],
  );

  const visibleColumns = useMemo(
    () => columns.filter((column) => !state.hiddenColumns.includes(column.id)),
    [columns, state.hiddenColumns],
  );

  const compare = useMemo(() => makeComparator(locale), [locale]);

  const filtered = useMemo(() => {
    if (mode === 'server' || !state.search.trim()) return rows;
    const query = normalise(state.search.trim());
    const searchable = columns.filter((column) => column.value && column.searchable !== false);
    if (searchable.length === 0) return rows;
    return rows.filter((row) => searchable.some((column) => matches(column.value?.(row), query)));
  }, [rows, columns, state.search, mode]);

  const sorted = useMemo(() => {
    if (mode === 'server' || !state.sort) return filtered;
    const column = columns.find((candidate) => candidate.id === state.sort?.columnId);
    if (!column?.value) return filtered;
    const direction = state.sort.direction === 'asc' ? 1 : -1;
    const read = column.value;
    // Copied before sorting: `Array.prototype.sort` mutates, and these rows belong to the caller.
    return [...filtered].sort((a, b) => {
      const left = read(a);
      const right = read(b);
      const leftEmpty = isEmpty(left);
      const rightEmpty = isEmpty(right);
      // A blank is not the smallest value, it is an absent one — it belongs at the bottom whether
      // the column is ascending or descending, so the sign is never applied to it.
      if (leftEmpty || rightEmpty) return leftEmpty === rightEmpty ? 0 : leftEmpty ? 1 : -1;
      return compare(left, right) * direction;
    });
  }, [filtered, columns, state.sort, mode, compare]);

  const filteredCount = mode === 'server' ? (rowCount ?? rows.length) : sorted.length;
  const pageCount = paginated ? Math.max(1, Math.ceil(filteredCount / state.pageSize)) : 1;

  const paged = useMemo(() => {
    if (mode === 'server' || !paginated) return sorted;
    const start = (state.page - 1) * state.pageSize;
    return sorted.slice(start, start + state.pageSize);
  }, [sorted, state.page, state.pageSize, mode, paginated]);

  const toggleSort = useCallback(
    (columnId: string) => {
      const current = state.sort;
      // Third press clears the sort rather than cycling back to ascending: "no order" is a state
      // the user asked for by pressing again, and hiding it makes the original order unreachable.
      const next: SortDescriptor | null =
        current?.columnId !== columnId
          ? { columnId, direction: 'asc' }
          : current.direction === 'asc'
            ? { columnId, direction: 'desc' }
            : null;
      setState({ sort: next, page: 1 });
    },
    [state.sort, setState],
  );

  const toggleColumn = useCallback(
    (columnId: string, visible: boolean) => {
      setState({
        hiddenColumns: visible
          ? state.hiddenColumns.filter((id) => id !== columnId)
          : [...state.hiddenColumns, columnId],
      });
    },
    [state.hiddenColumns, setState],
  );

  const setColumnWidth = useCallback(
    (columnId: string, width: number) => {
      setState({ columnWidths: { ...state.columnWidths, [columnId]: Math.round(width) } });
    },
    [state.columnWidths, setState],
  );

  return {
    state,
    setState,
    visibleColumns,
    rows: paged,
    filteredCount,
    pageCount,
    toggleSort,
    toggleColumn,
    setColumnWidth,
    getRowId,
  };
}
