'use client';

import { useMemo, type ReactNode } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type ScreenReaderInstructions,
} from '@dnd-kit/core';
import { restrictToWindowEdges } from '@dnd-kit/modifiers';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';

/**
 * The platform's one drag-and-drop foundation.
 *
 * **Why a library, and why this one.** Dragging looks like a mouse-move handler and is not.
 * Getting it right means pointer capture that survives a scroll, collision detection that behaves
 * when containers overlap, auto-scrolling near an edge, a touch activation delay that does not
 * fight the browser's own scrolling, *and* a complete keyboard equivalent — because a board a
 * keyboard user cannot reorder is a board they cannot use. That is the same calculation that put
 * Radix under the overlays and `cmdk` under the command palette: adopt the hard interaction, own
 * the semantics and the styling.
 *
 * **What the platform adds on top.** dnd-kit ships no announcements by default, so a screen-reader
 * user hears nothing at all through a drag. Every board in every product would otherwise write its
 * own — differently, or more likely not at all. Supplying them here means an accessible drag is
 * the path of least resistance rather than a thing somebody remembers.
 *
 * **What it deliberately does not do.** It never decides whether a move is *allowed*. A card that
 * cannot leave a column, a column that is full, an approval that cannot skip a step — those are
 * business rules, and they live in the product, which simply declines to update its state.
 */

export interface DragDropLabels {
  /** Announced when a drag begins. */
  onDragStart?: (id: string) => string;
  /** Announced as the item passes over a new position. */
  onDragOver?: (id: string, over: string | null) => string;
  /** Announced on drop. */
  onDragEnd?: (id: string, over: string | null) => string;
  onDragCancel?: (id: string) => string;
  /** Read once when a draggable receives focus. */
  instructions?: string;
}

const DEFAULT_LABELS: Required<DragDropLabels> = {
  onDragStart: (id) => `Picked up ${id}.`,
  onDragOver: (id, over) =>
    over ? `${id} is over ${over}.` : `${id} is no longer over a drop target.`,
  onDragEnd: (id, over) => (over ? `${id} was dropped on ${over}.` : `${id} was dropped.`),
  onDragCancel: (id) => `Moving ${id} was cancelled.`,
  instructions:
    'Press Space or Enter to pick up. Use the arrow keys to move, Space or Enter to drop, ' +
    'and Escape to cancel.',
};

export interface DragDropProviderProps {
  children: ReactNode;
  onDragStart?: (event: DragStartEvent) => void;
  onDragOver?: (event: DragOverEvent) => void;
  onDragEnd?: (event: DragEndEvent) => void;
  onDragCancel?: () => void;
  /** What is rendered under the cursor while dragging. */
  overlay?: ReactNode;
  /**
   * Human-readable name for an id, used in the announcements. Without it a screen reader hears
   * the raw id, which is a database key.
   */
  describeItem?: (id: string) => string;
  labels?: DragDropLabels;
}

/**
 * Sensors shared by every draggable surface in the platform.
 *
 * The eight-pixel activation distance is the setting that decides whether a card can also be
 * *clicked*: without it every click starts a drag and opening a record from a board becomes
 * impossible. The touch delay does the same job for a finger, leaving a short press to scroll.
 */
export function useDragSensors() {
  return useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
}

/** Live-region text for the whole drag lifecycle, in the caller's own words. */
export function useDragAnnouncements(
  describeItem: ((id: string) => string) | undefined,
  labels: DragDropLabels | undefined,
): { announcements: Announcements; screenReaderInstructions: ScreenReaderInstructions } {
  return useMemo(() => {
    const text = { ...DEFAULT_LABELS, ...labels };
    const name = (id: string | number | undefined) =>
      id === undefined ? '' : (describeItem?.(String(id)) ?? String(id));

    return {
      announcements: {
        onDragStart: ({ active }) => text.onDragStart(name(active.id)),
        onDragOver: ({ active, over }) =>
          text.onDragOver(name(active.id), over ? name(over.id) : null),
        onDragEnd: ({ active, over }) =>
          text.onDragEnd(name(active.id), over ? name(over.id) : null),
        onDragCancel: ({ active }) => text.onDragCancel(name(active.id)),
      },
      screenReaderInstructions: { draggable: text.instructions },
    };
  }, [describeItem, labels]);
}

/**
 * Wraps a draggable region.
 *
 * `closestCorners` rather than the default `rectIntersection`: a card being dragged between two
 * columns frequently overlaps neither rectangle, and corner distance is the collision strategy that
 * behaves for sortable lists inside containers.
 */
export function DragDropProvider({
  children,
  onDragStart,
  onDragOver,
  onDragEnd,
  onDragCancel,
  describeItem,
  labels,
}: DragDropProviderProps) {
  const sensors = useDragSensors();
  const { announcements, screenReaderInstructions } = useDragAnnouncements(describeItem, labels);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      modifiers={[restrictToWindowEdges]}
      accessibility={{ announcements, screenReaderInstructions }}
      {...(onDragStart === undefined ? {} : { onDragStart })}
      {...(onDragOver === undefined ? {} : { onDragOver })}
      {...(onDragEnd === undefined ? {} : { onDragEnd })}
      {...(onDragCancel === undefined ? {} : { onDragCancel })}
    >
      {children}
    </DndContext>
  );
}

export { DragOverlay } from '@dnd-kit/core';
export type { DragEndEvent, DragOverEvent, DragStartEvent } from '@dnd-kit/core';
