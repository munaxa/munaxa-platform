/**
 * Enterprise workspace components — the surfaces where work is arranged rather than listed.
 *
 * They share one drag-and-drop foundation (`DragDropProvider`, on dnd-kit) so that keyboard
 * dragging and the live announcements are written once, and they compose the platform's existing
 * primitives rather than starting parallel implementations: `Gantt` draws its axis with the Phase 7
 * date engine, `Kanban` uses `Badge`, `EmptyState` and `Skeleton`, `OrgChart` is the APG tree.
 *
 * The boundary is the same one the rest of the platform keeps: these components own *arrangement
 * and interaction*. Whether a card may enter a column, whether a task may move, what a reporting
 * line means — those are business rules, and they stay in the product.
 */
export {
  DragDropProvider,
  DragOverlay,
  useDragSensors,
  useDragAnnouncements,
  type DragDropProviderProps,
  type DragDropLabels,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from './dnd.js';

export {
  Kanban,
  type KanbanProps,
  type KanbanColumn,
  type KanbanItem,
  type KanbanMove,
  type KanbanLabels,
} from './kanban.js';

export {
  Gantt,
  buildGanttAxis,
  type GanttProps,
  type GanttTask,
  type GanttChange,
  type GanttScale,
  type GanttLabels,
} from './gantt.js';

export {
  OrgChart,
  buildTree,
  type OrgChartProps,
  type OrgNode,
  type OrgChartLabels,
  type OrgChartOrientation,
} from './org-chart.js';
