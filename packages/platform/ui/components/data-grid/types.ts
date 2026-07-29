import type { ReactNode } from 'react';

/**
 * The vocabulary the grid is configured with.
 *
 * The shape of `ColumnDef` is the whole public contract, and it is deliberately declarative: a
 * column says *what it is*, never *how the grid should render itself*. That is what lets the
 * implementation underneath change — windowing strategy, DOM structure, how sorting is applied —
 * without a single call site moving.
 */

export type ColumnAlign = 'start' | 'center' | 'end';

/** A value a column can be sorted, searched or exported by. */
export type CellValue = string | number | boolean | null | undefined;

export interface ColumnDef<T> {
  /** Stable identifier. Used for sort state, visibility and widths — never the array index. */
  id: string;
  /** What the column heading shows. */
  header: ReactNode;
  /**
   * Accessible name for the heading when `header` is not plain text — an icon-only column.
   * Also what the column-visibility menu lists.
   */
  headerLabel?: string;
  /** How a cell renders. Defaults to the column's `value`. */
  cell?: (row: T) => ReactNode;
  /**
   * The sortable / searchable / exportable value.
   *
   * Separate from `cell` because what a cell *looks like* and what it *is* are different things:
   * a status column renders a coloured badge and sorts by the word behind it, and a currency
   * column renders `1.250 JOD` and must sort as `1250`.
   */
  value?: (row: T) => CellValue;
  sortable?: boolean;
  /** Include in the toolbar's search. Defaults to true for any column with a `value`. */
  searchable?: boolean;
  /** Starting width in pixels. Columns without one share the remaining space. */
  width?: number;
  minWidth?: number;
  resizable?: boolean;
  align?: ColumnAlign;
  /** Hidden until the user turns it on from the column menu. */
  defaultHidden?: boolean;
  /** Keep out of the column menu — a selection or actions column is not the user's to hide. */
  alwaysVisible?: boolean;
  /**
   * Marks the column that names the row, rendered as `<th scope="row">`.
   *
   * Without one, a screen reader moving down a column announces a bare value with nothing to
   * anchor it: "active", "active", "active". With one it announces "Amina Haddad, active". Exactly
   * one column should set it.
   */
  rowHeader?: boolean;
}

export interface SortDescriptor {
  columnId: string;
  direction: 'asc' | 'desc';
}

/**
 * Everything about the grid that a product might want to own, persist or put in a URL.
 *
 * It is one object rather than eight props because these travel together: a saved view, a
 * shareable link and a "reset filters" button each need all of it at once.
 */
export interface DataGridState {
  sort: SortDescriptor | null;
  search: string;
  /** 1-based. */
  page: number;
  pageSize: number;
  hiddenColumns: string[];
  /** Pixel widths the user has dragged, by column id. */
  columnWidths: Record<string, number>;
}

/**
 * Who does the work.
 *
 * `'client'` — the grid sorts, searches and paginates the rows it was handed.
 * `'server'` — the grid does none of that. It reports every state change and renders exactly the
 * rows given, with `rowCount` supplying the total it cannot see. Same component, same props; a
 * product moving a table from client to server changes one word.
 */
export type DataGridMode = 'client' | 'server';

export interface DataGridLabels {
  search?: string;
  searchPlaceholder?: string;
  columns?: string;
  selectAll?: string;
  selectRow?: (label: string) => string;
  sortedAscending?: string;
  sortedDescending?: string;
  notSorted?: string;
  resizeColumn?: (label: string) => string;
  rowCount?: (count: number) => string;
  loading?: string;
  empty?: string;
  actions?: string;
}
