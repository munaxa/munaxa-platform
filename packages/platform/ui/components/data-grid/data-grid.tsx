'use client';

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { cn } from '../../lib/cn.js';
import { ArrowDown, ArrowUp, ChevronsUpDown, Columns3, Search } from '../../../icons/index.js';
import { Checkbox } from '../forms/checkbox.js';
import { Input } from '../forms/input.js';
import { Skeleton } from '../feedback/skeleton.js';
import { EmptyState } from '../feedback/empty-state.js';
import { Pagination } from '../navigation/pagination.js';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../overlays/dropdown-menu.js';
import { useDataGrid, type DataGridApi } from './use-data-grid.js';
import { useVirtualRows } from './use-virtual-rows.js';
import type { CellValue, ColumnDef, DataGridLabels, DataGridMode, DataGridState } from './types.js';

const DEFAULT_LABELS: Required<DataGridLabels> = {
  search: 'Search',
  searchPlaceholder: 'Search…',
  columns: 'Columns',
  selectAll: 'Select all rows',
  selectRow: (label) => `Select ${label}`,
  sortedAscending: 'sorted ascending',
  sortedDescending: 'sorted descending',
  notSorted: 'not sorted',
  resizeColumn: (label) => `Resize ${label}`,
  rowCount: (count) => `${count} rows`,
  loading: 'Loading rows…',
  empty: 'Nothing to show',
  actions: 'Actions',
};

export type SelectionMode = 'none' | 'single' | 'multiple';

export interface DataGridProps<T> {
  rows: T[];
  columns: ColumnDef<T>[];
  getRowId: (row: T) => string;

  mode?: DataGridMode;
  /** Total rows behind a server-mode query. */
  rowCount?: number;
  defaultState?: Partial<DataGridState>;
  state?: DataGridState;
  onStateChange?: (state: DataGridState) => void;

  selectionMode?: SelectionMode;
  selectedIds?: string[];
  onSelectionChange?: (ids: string[]) => void;
  /** Accessible name for a row, used by its selection checkbox. */
  getRowLabel?: (row: T) => string;

  /** Fired by Enter on a row and by a double click — opening a record, usually. */
  onRowActivate?: (row: T) => void;
  /** Rendered in a trailing column. Compose `DropdownMenu` for a menu. */
  rowActions?: (row: T) => ReactNode;

  /**
   * Bounded height for the scrolling body, e.g. `'60vh'` or `480`.
   *
   * This is also the virtualization switch, because the two are the same decision: windowing needs
   * a viewport to window against, and a grid that grows to fit its content has nothing to hide.
   */
  height?: number | string;
  rowHeight?: number;

  paginated?: boolean;
  searchable?: boolean;
  columnMenu?: boolean;
  /** Extra controls in the toolbar — an export button, a saved-view picker. */
  toolbarActions?: ReactNode;

  loading?: boolean;
  emptyState?: ReactNode;
  /** Sorting collation locale. Defaults to the host's. */
  locale?: string;
  labels?: DataGridLabels;
  className?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
}

const ALIGN = { start: 'text-start', center: 'text-center', end: 'text-end' } as const;

/**
 * An enterprise data grid: large datasets, keyboard navigation, selection, resizing, column
 * visibility, sticky headers and server-side data.
 *
 * **Not a replacement for `Table`.** `Table` is the right answer for a dozen rows of static
 * content, and it stays. This is the one that windows a hundred thousand rows and has to be driven
 * from a keyboard. Keeping both means neither has to apologise for the other's cost.
 *
 * **Real table semantics.** A `<table role="grid">` with `aria-rowcount` and `aria-rowindex`,
 * rather than the div soup that grids usually become. ARIA has exactly this pair for virtualized
 * content: the count is the *whole* dataset, the index is the row's place within it, and a screen
 * reader announces "row 4,201 of 90,000" while only forty rows exist in the DOM.
 *
 * **Keyboard.** One tab stop into the grid, then arrows move a cell, Home/End the row, Ctrl+Home
 * and Ctrl+End the grid, PageUp/PageDown a viewport, Space selects a row, and Enter enters a cell's
 * control or activates the row. Moving to a row outside the rendered window scrolls it in first.
 *
 * **Client or server.** `mode="server"` turns off every bit of local sorting, searching and
 * slicing and reports state changes instead. The props are otherwise identical, so moving a table
 * onto a server query changes one word.
 */
export function DataGrid<T>({
  rows,
  columns,
  getRowId,
  mode = 'client',
  rowCount,
  defaultState,
  state,
  onStateChange,
  selectionMode = 'none',
  selectedIds,
  onSelectionChange,
  getRowLabel,
  onRowActivate,
  rowActions,
  height,
  rowHeight = 44,
  paginated = true,
  searchable = true,
  columnMenu = true,
  toolbarActions,
  loading = false,
  emptyState,
  locale,
  labels,
  className,
  ...rest
}: DataGridProps<T>) {
  const text = { ...DEFAULT_LABELS, ...labels };
  const api = useDataGrid<T>({
    rows,
    columns,
    getRowId,
    mode,
    paginated,
    ...(rowCount === undefined ? {} : { rowCount }),
    ...(defaultState === undefined ? {} : { defaultState }),
    ...(state === undefined ? {} : { state }),
    ...(onStateChange === undefined ? {} : { onStateChange }),
    ...(locale === undefined ? {} : { locale }),
  });

  const scrollRef = useRef<HTMLDivElement>(null);
  const generatedId = useId();
  const gridId = generatedId;

  const hasSelection = selectionMode !== 'none';
  const selected = useMemo(() => new Set(selectedIds ?? []), [selectedIds]);

  // Leading selection and trailing action columns are part of the grid coordinate space, so the
  // arrow keys reach them like any other cell. `leading` is the offset every data column sits at.
  const leading = hasSelection ? 1 : 0;
  const columnCount = api.visibleColumns.length + leading + (rowActions ? 1 : 0);

  const virtual = useVirtualRows({
    containerRef: scrollRef,
    rowCount: api.rows.length,
    rowHeight,
    enabled: height !== undefined,
  });

  // `-1` is the header row, so it takes part in the same roving tab stop.
  const [focus, setFocus] = useState<{ row: number; col: number }>({ row: -1, col: 0 });
  const focusPending = useRef(false);
  const gridRef = useRef<HTMLTableElement>(null);

  useEffect(() => {
    if (!focusPending.current) return;
    const target = gridRef.current?.querySelector<HTMLElement>('[data-cell][tabindex="0"]');
    // The target may not be rendered yet — a row scrolled into the window lands on the next
    // commit. Keeping the flag means focus is not dropped to the body in between.
    if (!target) return;
    focusPending.current = false;
    target.focus();
  });

  const moveFocus = useCallback(
    (row: number, col: number) => {
      const nextRow = Math.max(-1, Math.min(row, api.rows.length - 1));
      const nextCol = Math.max(0, Math.min(col, columnCount - 1));
      if (nextRow >= 0) virtual.scrollToRow(nextRow);
      setFocus({ row: nextRow, col: nextCol });
      focusPending.current = true;
    },
    [api.rows.length, columnCount, virtual],
  );

  function toggleRow(row: T, checked: boolean) {
    if (!onSelectionChange) return;
    const id = getRowId(row);
    if (selectionMode === 'single') {
      onSelectionChange(checked ? [id] : []);
      return;
    }
    onSelectionChange(
      checked ? [...(selectedIds ?? []), id] : (selectedIds ?? []).filter((value) => value !== id),
    );
  }

  const pageIds = api.rows.map(getRowId);
  const allSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const someSelected = pageIds.some((id) => selected.has(id));

  function onKeyDown(event: KeyboardEvent<HTMLTableElement>) {
    const { row, col } = focus;
    const viewportRows = Math.max(1, Math.floor(readViewport(scrollRef.current) / rowHeight) - 1);

    switch (event.key) {
      case 'ArrowRight':
        event.preventDefault();
        // Cell movement follows the writing direction, matching the order the columns are read in.
        moveFocus(row, col + (isRtl(gridRef.current) ? -1 : 1));
        return;
      case 'ArrowLeft':
        event.preventDefault();
        moveFocus(row, col + (isRtl(gridRef.current) ? 1 : -1));
        return;
      case 'ArrowDown':
        event.preventDefault();
        moveFocus(row + 1, col);
        return;
      case 'ArrowUp':
        event.preventDefault();
        moveFocus(row - 1, col);
        return;
      case 'Home':
        event.preventDefault();
        moveFocus(event.ctrlKey ? -1 : row, 0);
        return;
      case 'End':
        event.preventDefault();
        moveFocus(event.ctrlKey ? api.rows.length - 1 : row, columnCount - 1);
        return;
      case 'PageDown':
        event.preventDefault();
        moveFocus(row + viewportRows, col);
        return;
      case 'PageUp':
        event.preventDefault();
        moveFocus(row - viewportRows, col);
        return;
      case ' ': {
        if (row < 0 || !hasSelection) return;
        event.preventDefault();
        const target = api.rows[row];
        if (target) toggleRow(target, !selected.has(getRowId(target)));
        return;
      }
      case 'Enter': {
        // Enter reaches into the cell: a header's sort button, an action menu, a link. Only when
        // the cell holds nothing focusable does it fall through to activating the row.
        const cell = event.target as HTMLElement;
        const inner = cell.matches('[data-cell]')
          ? cell.querySelector<HTMLElement>('button, a[href], input, select, textarea')
          : null;
        if (inner) {
          event.preventDefault();
          inner.focus();
          return;
        }
        const target = row >= 0 ? api.rows[row] : undefined;
        if (target && onRowActivate) {
          event.preventDefault();
          onRowActivate(target);
        }
        return;
      }
      case 'Escape': {
        // Back out of a cell's control to the cell itself, so the arrows work again.
        const cell = (event.target as HTMLElement).closest<HTMLElement>('[data-cell]');
        if (cell && document.activeElement !== cell) {
          event.preventDefault();
          cell.focus();
        }
        return;
      }
      default:
    }
  }

  /**
   * Shared wiring for every cell in the roving tab stop.
   *
   * `role` is stated rather than inherited on purpose. A `<td>` inside `role="grid"` *should* map
   * to `gridcell` by context, but that mapping is one of the least reliably implemented parts of
   * the HTML-AAM across assistive technologies and tooling. Writing it down costs an attribute and
   * removes the ambiguity entirely.
   */
  const cellProps = (
    row: number,
    col: number,
    role: 'gridcell' | 'columnheader' | 'rowheader',
  ) => ({
    role,
    'data-cell': true,
    tabIndex: focus.row === row && focus.col === col ? 0 : -1,
    onFocus: () => setFocus({ row, col }),
    'aria-colindex': col + 1,
  });

  const showEmpty = !loading && api.rows.length === 0;

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {searchable || columnMenu || toolbarActions ? (
        <div className="flex flex-wrap items-center gap-2">
          {searchable ? (
            <div className="relative min-w-48 flex-1">
              <Search
                className="pointer-events-none absolute inset-y-0 start-2 my-auto size-4 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                type="search"
                aria-label={text.search}
                placeholder={text.searchPlaceholder}
                value={api.state.search}
                onChange={(event) => api.setState({ search: event.target.value, page: 1 })}
                className="ps-8"
              />
            </div>
          ) : null}
          {toolbarActions}
          {columnMenu ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                className={cn(
                  'inline-flex h-9 items-center gap-2 rounded-md border border-input px-3 text-sm',
                  'hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                )}
              >
                <Columns3 className="size-4" aria-hidden="true" />
                {text.columns}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>{text.columns}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {columns
                  .filter((column) => !column.alwaysVisible)
                  .map((column) => (
                    <DropdownMenuCheckboxItem
                      key={column.id}
                      checked={!api.state.hiddenColumns.includes(column.id)}
                      onCheckedChange={(checked) => api.toggleColumn(column.id, checked)}
                    >
                      {column.headerLabel ?? column.header}
                    </DropdownMenuCheckboxItem>
                  ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      ) : null}

      <div
        ref={scrollRef}
        className="relative overflow-auto rounded-xl border border-border"
        style={height === undefined ? undefined : { height, maxHeight: height }}
      >
        <table
          ref={gridRef}
          role="grid"
          // The counts describe the dataset, not the DOM. That is exactly what lets a screen
          // reader say "row 4,201 of 90,000" over a forty-row window.
          aria-rowcount={api.filteredCount + 1}
          aria-colcount={columnCount}
          aria-busy={loading || undefined}
          className="w-full table-fixed border-collapse text-sm"
          onKeyDown={onKeyDown}
          {...(rest['aria-label'] === undefined ? {} : { 'aria-label': rest['aria-label'] })}
          {...(rest['aria-labelledby'] === undefined
            ? {}
            : { 'aria-labelledby': rest['aria-labelledby'] })}
        >
          <colgroup>
            {hasSelection ? <col style={{ width: 44 }} /> : null}
            {api.visibleColumns.map((column) => {
              const width = api.state.columnWidths[column.id] ?? column.width;
              return <col key={column.id} {...(width === undefined ? {} : { style: { width } })} />;
            })}
            {rowActions ? <col style={{ width: 56 }} /> : null}
          </colgroup>

          <thead className="sticky top-0 z-sticky bg-muted">
            <tr aria-rowindex={1}>
              {hasSelection ? (
                <th scope="col" className="p-0" {...cellProps(-1, 0, 'columnheader')}>
                  {selectionMode === 'multiple' ? (
                    <span className="flex h-11 items-center justify-center">
                      <Checkbox
                        aria-label={text.selectAll}
                        checked={allSelected}
                        indeterminate={!allSelected && someSelected}
                        onChange={(event) =>
                          onSelectionChange?.(
                            event.target.checked
                              ? [...new Set([...(selectedIds ?? []), ...pageIds])]
                              : (selectedIds ?? []).filter((id) => !pageIds.includes(id)),
                          )
                        }
                      />
                    </span>
                  ) : null}
                </th>
              ) : null}

              {api.visibleColumns.map((column, index) => (
                <HeaderCell
                  key={column.id}
                  column={column}
                  api={api}
                  text={text}
                  gridId={gridId}
                  cellProps={cellProps(-1, index + leading, 'columnheader')}
                />
              ))}

              {rowActions ? (
                <th
                  scope="col"
                  className="px-2 text-end"
                  {...cellProps(-1, columnCount - 1, 'columnheader')}
                >
                  <span className="sr-only">{text.actions}</span>
                </th>
              ) : null}
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <SkeletonRows columns={columnCount} rows={Math.min(8, api.state.pageSize)} />
            ) : showEmpty ? (
              <tr>
                <td colSpan={columnCount} className="p-0">
                  {emptyState ?? <EmptyState title={text.empty} />}
                </td>
              </tr>
            ) : (
              <>
                {virtual.paddingTop > 0 ? (
                  <tr aria-hidden="true" style={{ height: virtual.paddingTop }} />
                ) : null}

                {api.rows.slice(virtual.start, virtual.end).map((row, offset) => {
                  const index = virtual.start + offset;
                  const id = getRowId(row);
                  const isSelected = selected.has(id);
                  const label = getRowLabel?.(row) ?? id;

                  return (
                    <tr
                      key={id}
                      // Absolute position in the dataset: the header is row 1, the first page's
                      // first row is 2, and page three starts wherever it actually starts.
                      aria-rowindex={(api.state.page - 1) * api.state.pageSize + index + 2}
                      {...(hasSelection ? { 'aria-selected': isSelected } : {})}
                      style={{ height: rowHeight }}
                      onDoubleClick={() => onRowActivate?.(row)}
                      className={cn(
                        'border-t border-border transition-colors',
                        isSelected ? 'bg-primary/5' : 'hover:bg-muted/50',
                      )}
                    >
                      {hasSelection ? (
                        <td className="p-0 text-center" {...cellProps(index, 0, 'gridcell')}>
                          <span className="flex h-full items-center justify-center">
                            <Checkbox
                              aria-label={text.selectRow(label)}
                              checked={isSelected}
                              onChange={(event) => toggleRow(row, event.target.checked)}
                            />
                          </span>
                        </td>
                      ) : null}

                      {api.visibleColumns.map((column, columnIndex) => {
                        const content = column.cell
                          ? column.cell(row)
                          : renderValue(column.value?.(row));
                        const props = {
                          className: cn(
                            'truncate px-3 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                            ALIGN[column.align ?? 'start'],
                            column.rowHeader && 'font-medium',
                          ),
                          ...cellProps(
                            index,
                            columnIndex + leading,
                            column.rowHeader ? 'rowheader' : 'gridcell',
                          ),
                        };
                        return column.rowHeader ? (
                          <th key={column.id} scope="row" {...props}>
                            {content}
                          </th>
                        ) : (
                          <td key={column.id} {...props}>
                            {content}
                          </td>
                        );
                      })}

                      {rowActions ? (
                        <td
                          className="px-2 text-end outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                          {...cellProps(index, columnCount - 1, 'gridcell')}
                        >
                          {rowActions(row)}
                        </td>
                      ) : null}
                    </tr>
                  );
                })}

                {virtual.paddingBottom > 0 ? (
                  <tr aria-hidden="true" style={{ height: virtual.paddingBottom }} />
                ) : null}
              </>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        {/*
          The count is a live region because it is the only feedback a non-sighted user gets that
          a search narrowed the grid: the rows simply stop existing, silently, otherwise.
        */}
        <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
          {loading ? text.loading : text.rowCount(api.filteredCount)}
        </p>
        {paginated ? (
          <Pagination
            page={api.state.page}
            pageCount={api.pageCount}
            onPageChange={(page) => api.setState({ page })}
            className="w-auto gap-4"
          />
        ) : null}
      </div>
    </div>
  );
}

function HeaderCell<T>({
  column,
  api,
  text,
  gridId,
  cellProps,
}: {
  column: ColumnDef<T>;
  api: DataGridApi<T>;
  text: Required<DataGridLabels>;
  gridId: string;
  cellProps: Record<string, unknown>;
}) {
  const label =
    column.headerLabel ?? (typeof column.header === 'string' ? column.header : column.id);
  const sorted = api.state.sort?.columnId === column.id ? api.state.sort.direction : null;
  const sortable = column.sortable && Boolean(column.value);
  const SortIcon = sorted === 'asc' ? ArrowUp : sorted === 'desc' ? ArrowDown : ChevronsUpDown;

  return (
    <th
      scope="col"
      // The resizer points `aria-controls` here, so the id must exist on something.
      id={`${gridId}-${column.id}`}
      // `aria-sort` is what an assistive technology reads; the arrow is decoration for everyone
      // else. Only the sorted column may carry it, so it is omitted rather than set to "none".
      {...(sorted ? { 'aria-sort': sorted === 'asc' ? 'ascending' : 'descending' } : {})}
      className={cn(
        'relative h-11 px-3 text-start align-middle font-medium text-foreground',
        'outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
        ALIGN[column.align ?? 'start'],
      )}
      {...cellProps}
    >
      {sortable ? (
        <button
          type="button"
          onClick={() => api.toggleSort(column.id)}
          className="inline-flex items-center gap-1 rounded-sm hover:text-primary-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="truncate">{column.header}</span>
          <SortIcon className="size-3.5 shrink-0 opacity-60" aria-hidden="true" />
          <span className="sr-only">
            {sorted === 'asc'
              ? text.sortedAscending
              : sorted === 'desc'
                ? text.sortedDescending
                : text.notSorted}
          </span>
        </button>
      ) : (
        <span className="truncate">{column.header}</span>
      )}

      {column.resizable ? (
        <ColumnResizer
          columnId={column.id}
          label={text.resizeColumn(label)}
          minWidth={column.minWidth ?? 64}
          width={api.state.columnWidths[column.id] ?? column.width}
          onResize={api.setColumnWidth}
          gridId={gridId}
        />
      ) : null}
    </th>
  );
}

/**
 * The drag handle between two columns.
 *
 * It is a `separator` with a value and arrow keys, not a bare div with a pointer listener, for the
 * same reason the split-pane divider is: resizing a column is the sort of thing that quietly
 * becomes mouse-only, and then a keyboard user cannot read a truncated column at all.
 */
function ColumnResizer({
  columnId,
  label,
  minWidth,
  width,
  onResize,
  gridId,
}: {
  columnId: string;
  label: string;
  minWidth: number;
  width: number | undefined;
  onResize: (columnId: string, width: number) => void;
  gridId: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  const currentWidth = useCallback(
    () => width ?? ref.current?.closest('th')?.getBoundingClientRect().width ?? minWidth,
    [width, minWidth],
  );

  return (
    <span
      ref={ref}
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-controls={`${gridId}-${columnId}`}
      aria-valuenow={Math.round(currentWidth())}
      aria-valuemin={minWidth}
      tabIndex={0}
      onKeyDown={(event) => {
        const step = event.shiftKey ? 32 : 8;
        if (event.key === 'ArrowLeft') {
          event.preventDefault();
          onResize(columnId, Math.max(minWidth, currentWidth() - step));
        } else if (event.key === 'ArrowRight') {
          event.preventDefault();
          onResize(columnId, currentWidth() + step);
        }
      }}
      onPointerDown={(event) => {
        event.preventDefault();
        const startX = event.clientX;
        const startWidth = currentWidth();
        const target = event.currentTarget;
        target.setPointerCapture(event.pointerId);

        const onMove = (move: PointerEvent) => {
          const delta = move.clientX - startX;
          onResize(columnId, Math.max(minWidth, startWidth + delta));
        };
        const onUp = () => {
          target.releasePointerCapture(event.pointerId);
          target.removeEventListener('pointermove', onMove);
          target.removeEventListener('pointerup', onUp);
        };
        target.addEventListener('pointermove', onMove);
        target.addEventListener('pointerup', onUp);
      }}
      className={cn(
        'absolute inset-y-0 end-0 w-1 cursor-col-resize touch-none bg-transparent',
        'hover:bg-primary/40 focus-visible:bg-primary focus-visible:outline-none',
      )}
    />
  );
}

function SkeletonRows({ columns, rows }: { columns: number; rows: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, row) => (
        <tr key={row} className="border-t border-border">
          {Array.from({ length: columns }, (_, column) => (
            <td key={column} className="px-3 py-3">
              <Skeleton className="h-4 w-full" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

function renderValue(value: CellValue): ReactNode {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return value;
}

function isRtl(element: Element | null): boolean {
  if (!element || typeof getComputedStyle === 'undefined') return false;
  return getComputedStyle(element).direction === 'rtl';
}

function readViewport(element: HTMLElement | null): number {
  return element?.clientHeight ?? 0;
}
