'use client';

import { useMemo, type ReactNode } from 'react';
import { cn } from '../../lib/cn.js';
import { File as FileIcon, Folder, LayoutGrid, List } from '../../../icons/index.js';
import {
  Breadcrumb,
  type BreadcrumbItem,
  type RenderBreadcrumbLink,
} from '../navigation/breadcrumb.js';
import { Checkbox } from '../forms/checkbox.js';
import { EmptyState } from '../feedback/empty-state.js';
import { Skeleton } from '../feedback/skeleton.js';
import { DataGrid } from '../data-grid/data-grid.js';
import type { ColumnDef } from '../data-grid/types.js';
import { Dropzone, formatFileSize, type DropzoneProps } from './dropzone.js';
import { useDateSystem } from '../../date/index.js';

export interface FileNode {
  id: string;
  name: string;
  kind: 'file' | 'folder';
  /** Bytes. Folders normally have none. */
  size?: number;
  /** ISO timestamp or date. Formatted through the platform's date system. */
  modifiedAt?: string;
  mimeType?: string;
  /** Anything the product wants back in its callbacks. */
  meta?: Record<string, unknown>;
}

export type FileManagerView = 'list' | 'grid';

export interface FileManagerLabels {
  name?: string;
  size?: string;
  modified?: string;
  kindFolder?: string;
  kindFile?: string;
  empty?: string;
  listView?: string;
  gridView?: string;
  breadcrumb?: string;
  selectItem?: (name: string) => string;
  itemCount?: (files: number, folders: number) => string;
}

const DEFAULT_LABELS: Required<FileManagerLabels> = {
  name: 'Name',
  size: 'Size',
  modified: 'Modified',
  kindFolder: 'Folder',
  kindFile: 'File',
  empty: 'This folder is empty',
  listView: 'List view',
  gridView: 'Grid view',
  breadcrumb: 'Folder path',
  selectItem: (name) => `Select ${name}`,
  itemCount: (files, folders) =>
    `${folders} ${folders === 1 ? 'folder' : 'folders'}, ${files} ${files === 1 ? 'file' : 'files'}`,
};

export interface FileManagerProps {
  /** The contents of the current folder. Only this folder — the manager never fetches. */
  items: FileNode[];
  /** Ancestors of the current folder, root first. The last entry is where the user is. */
  path: BreadcrumbItem[];
  /** A folder was opened. `null` means the root crumb. */
  onNavigate?: (item: FileNode) => void;
  /** A file was opened — double-click, or Enter on its row. */
  onOpen?: (item: FileNode) => void;
  renderBreadcrumbLink?: RenderBreadcrumbLink;

  selectedIds?: string[];
  onSelectionChange?: (ids: string[]) => void;

  view?: FileManagerView;
  onViewChange?: (view: FileManagerView) => void;

  /**
   * Upload. Supplying it shows a dropzone; omitting it makes the browser read-only.
   *
   * Storage-agnostic by construction: this receives `File` objects, and everything after that —
   * signing, chunking, progress, retries, where the bytes actually go — belongs to the product.
   */
  onUpload?: (files: File[]) => void;
  uploadOptions?: Omit<DropzoneProps, 'onFiles'>;

  /** Per-item controls — a menu, a download button. */
  itemActions?: (item: FileNode) => ReactNode;
  /** Toolbar controls — "New folder", "Delete selected". */
  toolbarActions?: ReactNode;

  loading?: boolean;
  emptyState?: ReactNode;
  locale?: string;
  labels?: FileManagerLabels;
  className?: string;
  'aria-label'?: string;
}

/**
 * A folder browser.
 *
 * **Storage-agnostic, and that is the whole design.** It fetches nothing, uploads nothing and knows
 * no URLs. It renders the folder it was handed and reports what the user did: `onNavigate`,
 * `onOpen`, `onUpload(files)`. A file manager that assumed one storage backend — S3, a signed URL,
 * a document API — would be unusable for the next product, so the boundary is drawn at raw `File`
 * objects and ids.
 *
 * **The list view is the platform's `DataGrid`.** Sorting by name, size and date, keyboard cell
 * navigation, selection and the sticky header already exist and are already tested; a second table
 * implementation inside a file browser would be a second set of the same bugs. The grid view is the
 * platform's `Grid`, and the path is the platform's `Breadcrumb`.
 *
 * **Folders sort before files** regardless of the active sort, because that is what every file
 * browser does and what makes a deep tree navigable.
 */
export function FileManager({
  items,
  path,
  onNavigate,
  onOpen,
  renderBreadcrumbLink,
  selectedIds,
  onSelectionChange,
  view = 'list',
  onViewChange,
  onUpload,
  uploadOptions,
  itemActions,
  toolbarActions,
  loading = false,
  emptyState,
  locale,
  labels,
  className,
  ...rest
}: FileManagerProps) {
  const text = { ...DEFAULT_LABELS, ...labels };
  const { formatter } = useDateSystem({ locale });

  /** Folders first, then whatever order the caller supplied. */
  const ordered = useMemo(
    () => [
      ...items.filter((item) => item.kind === 'folder'),
      ...items.filter((item) => item.kind !== 'folder'),
    ],
    [items],
  );

  const counts = useMemo(
    () => ({
      folders: items.filter((item) => item.kind === 'folder').length,
      files: items.filter((item) => item.kind !== 'folder').length,
    }),
    [items],
  );

  const activate = (item: FileNode) => {
    if (item.kind === 'folder') onNavigate?.(item);
    else onOpen?.(item);
  };

  const columns = useMemo<ColumnDef<FileNode>[]>(
    () => [
      {
        id: 'name',
        header: text.name,
        value: (item) => item.name,
        sortable: true,
        rowHeader: true,
        resizable: true,
        cell: (item) => (
          <span className="flex items-center gap-2">
            <Kind kind={item.kind} />
            <button
              type="button"
              onClick={() => activate(item)}
              className="truncate text-start hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {item.name}
            </button>
            <span className="sr-only">
              {item.kind === 'folder' ? text.kindFolder : text.kindFile}
            </span>
          </span>
        ),
      },
      {
        id: 'size',
        header: text.size,
        // Folders have no size; sorting by an absent value puts them together at the end.
        value: (item) => item.size ?? null,
        sortable: true,
        align: 'end',
        width: 110,
        cell: (item) => (item.size === undefined ? '—' : formatFileSize(item.size, locale)),
      },
      {
        id: 'modified',
        header: text.modified,
        value: (item) => item.modifiedAt ?? null,
        sortable: true,
        width: 160,
        cell: (item) =>
          item.modifiedAt === undefined
            ? '—'
            : formatter.formatISO(item.modifiedAt.slice(0, 10), 'medium'),
      },
    ],
    [text.name, text.size, text.modified, text.kindFolder, text.kindFile, formatter, locale],
  );

  const selected = useMemo(() => new Set(selectedIds ?? []), [selectedIds]);

  return (
    <div
      className={cn('flex flex-col gap-3', className)}
      {...(rest['aria-label'] === undefined ? {} : { 'aria-label': rest['aria-label'] })}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Breadcrumb
          items={path}
          className="min-w-0 flex-1"
          {...(renderBreadcrumbLink === undefined ? {} : { renderLink: renderBreadcrumbLink })}
          label={text.breadcrumb}
        />
        {toolbarActions}
        {onViewChange ? (
          <div role="group" aria-label={`${text.listView} / ${text.gridView}`} className="flex">
            <ViewButton
              active={view === 'list'}
              label={text.listView}
              onClick={() => onViewChange('list')}
              icon={<List className="size-4" aria-hidden="true" />}
              side="start"
            />
            <ViewButton
              active={view === 'grid'}
              label={text.gridView}
              onClick={() => onViewChange('grid')}
              icon={<LayoutGrid className="size-4" aria-hidden="true" />}
              side="end"
            />
          </div>
        ) : null}
      </div>

      {onUpload ? <Dropzone onFiles={onUpload} {...uploadOptions} /> : null}

      {view === 'list' ? (
        <DataGrid
          aria-label={rest['aria-label'] ?? text.name}
          rows={ordered}
          columns={columns}
          getRowId={(item) => item.id}
          getRowLabel={(item) => item.name}
          onRowActivate={activate}
          paginated={false}
          searchable={false}
          columnMenu={false}
          loading={loading}
          {...(emptyState === undefined ? {} : { emptyState })}
          labels={{
            empty: text.empty,
            rowCount: () => text.itemCount(counts.files, counts.folders),
          }}
          {...(onSelectionChange === undefined
            ? {}
            : {
                selectionMode: 'multiple' as const,
                selectedIds: selectedIds ?? [],
                onSelectionChange,
              })}
          {...(itemActions === undefined ? {} : { rowActions: itemActions })}
        />
      ) : (
        <GridView
          items={ordered}
          selected={selected}
          {...(onSelectionChange === undefined ? {} : { onSelectionChange })}
          selectedIds={selectedIds ?? []}
          onActivate={activate}
          {...(itemActions === undefined ? {} : { itemActions })}
          loading={loading}
          {...(emptyState === undefined ? {} : { emptyState })}
          text={text}
          locale={locale}
          counts={counts}
        />
      )}
    </div>
  );
}

function ViewButton({
  active,
  label,
  onClick,
  icon,
  side,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  icon: ReactNode;
  side: 'start' | 'end';
}) {
  return (
    <button
      type="button"
      // `aria-pressed` rather than a visual-only active state: a toggle that only looks pressed is
      // a toggle a screen-reader user cannot read the state of.
      aria-pressed={active}
      aria-label={label}
      onClick={onClick}
      className={cn(
        'flex size-9 items-center justify-center border border-input',
        side === 'start' ? 'rounded-s-md' : '-ms-px rounded-e-md',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-secondary/50',
      )}
    >
      {icon}
    </button>
  );
}

function Kind({ kind }: { kind: FileNode['kind'] }) {
  const Icon = kind === 'folder' ? Folder : FileIcon;
  return <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />;
}

function GridView({
  items,
  selected,
  selectedIds,
  onSelectionChange,
  onActivate,
  itemActions,
  loading,
  emptyState,
  text,
  locale,
  counts,
}: {
  items: FileNode[];
  selected: Set<string>;
  selectedIds: string[];
  onSelectionChange?: (ids: string[]) => void;
  onActivate: (item: FileNode) => void;
  itemActions?: (item: FileNode) => ReactNode;
  loading: boolean;
  emptyState?: ReactNode;
  text: Required<FileManagerLabels>;
  locale: string | undefined;
  counts: { files: number; folders: number };
}) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 10 }, (_, index) => (
          <Skeleton key={index} className="h-24 w-full" />
        ))}
      </div>
    );
  }
  if (items.length === 0) return <>{emptyState ?? <EmptyState title={text.empty} />}</>;

  return (
    <>
      {/* A list, not a grid of divs: the tiles are one set of things, and a screen reader should be
          told how many there are and where in the set each one is. */}
      <ul className="grid list-none grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {items.map((item) => (
          <li
            key={item.id}
            className={cn(
              'group relative flex flex-col gap-1 rounded-xl border border-border bg-card p-3',
              selected.has(item.id) && 'border-primary bg-primary/5',
            )}
          >
            <span className="flex items-start justify-between gap-1">
              {onSelectionChange ? (
                <Checkbox
                  aria-label={text.selectItem(item.name)}
                  checked={selected.has(item.id)}
                  onChange={(event) =>
                    onSelectionChange(
                      event.target.checked
                        ? [...selectedIds, item.id]
                        : selectedIds.filter((id) => id !== item.id),
                    )
                  }
                />
              ) : (
                <Kind kind={item.kind} />
              )}
              {itemActions?.(item)}
            </span>

            <button
              type="button"
              onClick={() => onActivate(item)}
              className="flex flex-col items-start gap-0.5 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="flex items-center gap-1.5">
                {onSelectionChange ? <Kind kind={item.kind} /> : null}
                <span className="truncate text-sm font-medium">{item.name}</span>
              </span>
              <span className="text-xs text-muted-foreground">
                {item.kind === 'folder'
                  ? text.kindFolder
                  : item.size === undefined
                    ? text.kindFile
                    : formatFileSize(item.size, locale)}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
        {text.itemCount(counts.files, counts.folders)}
      </p>
    </>
  );
}
