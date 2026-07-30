'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '../../lib/cn.js';
import { GripVertical } from '../../../icons/index.js';
import { Badge } from '../primitives/badge.js';
import { EmptyState } from '../feedback/empty-state.js';
import { Skeleton } from '../feedback/skeleton.js';
import {
  DragDropProvider,
  DragOverlay,
  type DragDropLabels,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from './dnd.js';

export interface KanbanColumn {
  id: string;
  title: ReactNode;
  /** Plain-text name, used in the drag announcements and the column's accessible name. */
  label?: string;
  /**
   * Work-in-progress limit. Shown next to the count and flagged when exceeded — it is *not*
   * enforced. Whether a card may land in a full column is a business rule, and the product
   * enforces it by declining the move.
   */
  limit?: number;
  /** Rendered under the heading — a filter, an "add card" button. */
  actions?: ReactNode;
}

export interface KanbanItem {
  id: string;
  columnId: string;
}

export interface KanbanMove {
  itemId: string;
  fromColumnId: string;
  toColumnId: string;
  /** Position within the destination column, 0-based. */
  toIndex: number;
}

export interface KanbanLabels extends DragDropLabels {
  empty?: string;
  cardCount?: (count: number, limit: number | undefined) => string;
  overLimit?: string;
  dragHandle?: (label: string) => string;
}

export interface KanbanProps<T extends KanbanItem> {
  columns: KanbanColumn[];
  items: T[];
  renderCard: (item: T) => ReactNode;
  /**
   * Where a card ended up. The board does not move it — the product updates its own state, which
   * is what makes an optimistic update, a server round-trip or a rejected move all possible without
   * the board knowing the difference.
   */
  onMove?: (move: KanbanMove) => void;
  /** Plain-text name for a card, for the drag announcements. Falls back to the id. */
  getItemLabel?: (item: T) => string;
  /** Turn dragging off entirely — a read-only board is a legitimate view. */
  readOnly?: boolean;
  loading?: boolean;
  labels?: KanbanLabels;
  className?: string;
  'aria-label'?: string;
}

const DEFAULT_LABELS = {
  empty: 'Nothing here',
  cardCount: (count: number, limit: number | undefined) =>
    limit === undefined ? `${count}` : `${count} / ${limit}`,
  overLimit: 'Over limit',
  dragHandle: (label: string) => `Move ${label}`,
} satisfies Required<Omit<KanbanLabels, keyof DragDropLabels>>;

/**
 * A board of columns with cards that move between them.
 *
 * **The board owns arrangement; the product owns meaning.** Nothing here knows what a card *is*,
 * what a column means, or whether a move is legal. `renderCard` draws whatever the product wants
 * and `onMove` reports what the user did — the product then updates its state, or does not. That
 * single boundary is what lets a WIP limit be advisory in one product and enforced in another,
 * without a `strictLimits` prop appearing here.
 *
 * **Keyboard.** Every card has a real drag handle button. Space or Enter picks up, the arrow keys
 * move between positions and across columns, Space or Enter drops, Escape cancels — and each step
 * is announced through a live region, because a drag that is silent is a drag that did not happen
 * as far as a screen-reader user can tell.
 *
 * **Column semantics.** Each column is a `<section>` with a real heading and its cards are a list,
 * so the board is navigable by heading and by list even when nothing is being dragged.
 */
export function Kanban<T extends KanbanItem>({
  columns,
  items,
  renderCard,
  onMove,
  getItemLabel,
  readOnly = false,
  loading = false,
  labels,
  className,
  ...rest
}: KanbanProps<T>) {
  const text = { ...DEFAULT_LABELS, ...labels };
  const [activeId, setActiveId] = useState<string | null>(null);
  /**
   * Where the card *appears* to be mid-drag.
   *
   * A card dragged into another column has to look like it is already there, but the props have
   * not changed — the product only hears about the move on drop. This holds the preview so the
   * board reads correctly during the drag without lying about the committed state.
   */
  const [preview, setPreview] = useState<{ itemId: string; columnId: string } | null>(null);

  const byColumn = useMemo(() => {
    const map = new Map<string, T[]>(columns.map((column) => [column.id, []]));
    for (const item of items) {
      const columnId = preview && preview.itemId === item.id ? preview.columnId : item.columnId;
      map.get(columnId)?.push(item);
    }
    return map;
  }, [columns, items, preview]);

  const label = (id: string) => {
    const item = items.find((candidate) => candidate.id === id);
    if (item) return getItemLabel?.(item) ?? item.id;
    const column = columns.find((candidate) => candidate.id === id);
    return column?.label ?? (typeof column?.title === 'string' ? column.title : id);
  };

  /** Which column a droppable id belongs to — it is either a column or a card inside one. */
  const columnOf = (id: string): string | undefined => {
    if (columns.some((column) => column.id === id)) return id;
    if (preview && preview.itemId === id) return preview.columnId;
    return items.find((item) => item.id === id)?.columnId;
  };

  function onDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function onDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;
    const target = columnOf(String(over.id));
    if (target) setPreview({ itemId: String(active.id), columnId: target });
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    const itemId = String(active.id);
    setActiveId(null);
    setPreview(null);
    if (!over) return;

    const item = items.find((candidate) => candidate.id === itemId);
    const toColumnId = columnOf(String(over.id));
    if (!item || !toColumnId) return;

    const destination = (byColumn.get(toColumnId) ?? []).filter(
      (candidate) => candidate.id !== itemId,
    );
    const overIndex = destination.findIndex((candidate) => candidate.id === String(over.id));
    // Dropping on the column itself, rather than on a card, means the end of the list.
    const toIndex = overIndex === -1 ? destination.length : overIndex;

    if (item.columnId === toColumnId && toIndex === destination.indexOf(item)) return;
    onMove?.({ itemId, fromColumnId: item.columnId, toColumnId, toIndex });
  }

  const active = activeId ? items.find((item) => item.id === activeId) : undefined;

  return (
    <DragDropProvider
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        setActiveId(null);
        setPreview(null);
      }}
      describeItem={label}
      {...(labels === undefined ? {} : { labels })}
    >
      <div
        className={cn('flex gap-4 overflow-x-auto pb-2', className)}
        {...(rest['aria-label'] === undefined ? {} : { 'aria-label': rest['aria-label'] })}
      >
        {columns.map((column) => (
          <Column
            key={column.id}
            column={column}
            items={byColumn.get(column.id) ?? []}
            renderCard={renderCard}
            getItemLabel={getItemLabel}
            readOnly={readOnly}
            loading={loading}
            text={text}
          />
        ))}
      </div>

      {/*
        The overlay is what follows the cursor. Rendering the card twice — once in place, once here
        — is what makes the drop position visible while the card is in the air.
      */}
      <DragOverlay>
        {active ? (
          <div className="rotate-2 cursor-grabbing rounded-lg border border-primary bg-card p-3 shadow-card">
            {renderCard(active)}
          </div>
        ) : null}
      </DragOverlay>
    </DragDropProvider>
  );
}

function Column<T extends KanbanItem>({
  column,
  items,
  renderCard,
  getItemLabel,
  readOnly,
  loading,
  text,
}: {
  column: KanbanColumn;
  items: T[];
  renderCard: (item: T) => ReactNode;
  getItemLabel: ((item: T) => string) | undefined;
  readOnly: boolean;
  loading: boolean;
  text: Required<Omit<KanbanLabels, keyof DragDropLabels>>;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  const headingId = `kanban-${column.id}`;
  const ids = useMemo(() => items.map((item) => item.id), [items]);
  const overLimit = column.limit !== undefined && items.length > column.limit;

  return (
    <section
      aria-labelledby={headingId}
      className="flex w-72 shrink-0 flex-col rounded-xl border border-border bg-muted/30"
    >
      <header className="flex items-center gap-2 px-3 py-2">
        <h3 id={headingId} className="min-w-0 flex-1 truncate text-sm font-semibold">
          {column.title}
        </h3>
        <Badge tone={overLimit ? 'danger' : 'muted'}>
          {text.cardCount(items.length, column.limit)}
          {overLimit ? <span className="sr-only"> — {text.overLimit}</span> : null}
        </Badge>
        {column.actions}
      </header>

      <div
        ref={setNodeRef}
        className={cn(
          'flex min-h-24 flex-1 flex-col gap-2 rounded-b-xl p-2 transition-colors',
          isOver && 'bg-primary/5 ring-2 ring-inset ring-primary/40',
        )}
      >
        {loading ? (
          <>
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </>
        ) : items.length === 0 ? (
          <EmptyState title={text.empty} className="border-none bg-transparent py-6" />
        ) : (
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            <ul className="flex flex-col gap-2">
              {items.map((item) => (
                <Card
                  key={item.id}
                  item={item}
                  label={getItemLabel?.(item) ?? item.id}
                  readOnly={readOnly}
                  text={text}
                >
                  {renderCard(item)}
                </Card>
              ))}
            </ul>
          </SortableContext>
        )}
      </div>
    </section>
  );
}

function Card({
  item,
  label,
  readOnly,
  text,
  children,
}: {
  item: KanbanItem;
  label: string;
  readOnly: boolean;
  text: Required<Omit<KanbanLabels, keyof DragDropLabels>>;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: readOnly,
  });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'group flex items-start gap-1 rounded-lg border border-border bg-card p-2 shadow-xs',
        // The original stays in the flow at low opacity so the list does not collapse under the
        // cursor; the overlay is what the user is actually moving.
        isDragging && 'opacity-40',
      )}
    >
      {readOnly ? null : (
        <button
          type="button"
          // A dedicated handle rather than a draggable card: the card is usually clickable too,
          // and a whole-card drag makes opening a record a coin toss. It is a real button, so the
          // keyboard sensor can pick it up.
          aria-label={text.dragHandle(label)}
          className={cn(
            'mt-0.5 shrink-0 cursor-grab touch-none rounded p-0.5 text-muted-foreground',
            'opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          )}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" aria-hidden="true" />
        </button>
      )}
      <div className="min-w-0 flex-1">{children}</div>
    </li>
  );
}
