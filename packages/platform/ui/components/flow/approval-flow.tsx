'use client';

import { useId, useMemo, type ReactNode } from 'react';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '../../lib/cn.js';
import { Check, GripVertical, Minus, X } from '../../../icons/index.js';
import { Badge } from '../primitives/badge.js';
import { EmptyState } from '../feedback/empty-state.js';
import { DragDropProvider, type DragEndEvent } from '../board/dnd.js';

export type ApprovalStatus = 'pending' | 'active' | 'approved' | 'rejected' | 'skipped';

/** How many of a step's approvers have to act for the step to pass. */
export type ApprovalMode = 'all' | 'any';

export interface ApprovalStep {
  id: string;
  name: string;
  /** Who acts at this step. Rendered as-is — avatars, names, a role chip. */
  approvers?: ReactNode;
  mode?: ApprovalMode;
  /** When this step applies. Rendered as-is; the platform never evaluates it. */
  condition?: ReactNode;
  /** Runtime state. Only meaningful in `readOnly` mode. */
  status?: ApprovalStatus;
  /** Extra content — a due date, a comment count. */
  meta?: ReactNode;
}

export interface ApprovalFlowLabels {
  empty?: string;
  stepPosition?: (index: number, total: number) => string;
  modeAll?: string;
  modeAny?: string;
  reorder?: (name: string) => string;
  status?: (status: ApprovalStatus) => string;
}

const DEFAULT_LABELS: Required<ApprovalFlowLabels> = {
  empty: 'No approval steps',
  stepPosition: (index, total) => `Step ${index} of ${total}`,
  modeAll: 'All must approve',
  modeAny: 'Any one may approve',
  reorder: (name) => `Reorder ${name}`,
  status: (status) => status,
};

const STATUS_TONE = {
  pending: 'muted',
  active: 'default',
  approved: 'success',
  rejected: 'danger',
  skipped: 'muted',
} as const;

export interface ApprovalFlowProps {
  steps: ApprovalStep[];
  /**
   * Reports a reordered chain. Omit it and the steps cannot be moved.
   *
   * The flow does not apply the order itself — the product does, which is what makes a server
   * round-trip or a rejected reorder possible without this component knowing.
   */
  onReorder?: (stepIds: string[]) => void;
  /** Per-step controls in the designer — edit, remove, add a condition. */
  stepActions?: (step: ApprovalStep, index: number) => ReactNode;
  /** Rendered after the last step — an "Add step" button. */
  footer?: ReactNode;
  /**
   * Display mode. A designer edits the chain; read-only shows how far a live request has got, using
   * each step's `status`.
   */
  readOnly?: boolean;
  labels?: ApprovalFlowLabels;
  className?: string;
  'aria-label'?: string;
}

/**
 * A chain of approval steps — as a designer, and as a live progress view.
 *
 * **Why this is not `WorkflowCanvas` with a linear layout.** An approval chain is an *ordered list*:
 * step one, then step two, with a set of approvers at each. That is a fundamentally simpler model
 * than a graph, and forcing it through a node canvas would make the common case — "add a step after
 * this one", "move finance before legal" — a matter of dragging boxes and redrawing arrows to
 * express something a list expresses exactly. Two models, because there are genuinely two problems.
 *
 * **The same component designs the chain and shows its progress.** `readOnly` with a `status` on
 * each step is how a live request renders, and keeping it here rather than in a second component
 * means the shape a designer built is literally the shape a requester sees.
 *
 * **Generic on purpose.** `approvers` and `condition` are `ReactNode` — the platform renders them
 * and never reads them. What an approver *is*, when a condition is met, and whether a chain is valid
 * are the product's, and a component that modelled them would be an approval *engine* rather than
 * an editor for one.
 *
 * It is an ordered list with each step's position announced, and reordering has a real handle
 * button, so the chain is navigable and editable without a pointer.
 */
export function ApprovalFlow({
  steps,
  onReorder,
  stepActions,
  footer,
  readOnly = false,
  labels,
  className,
  ...rest
}: ApprovalFlowProps) {
  const text = { ...DEFAULT_LABELS, ...labels };
  const generatedId = useId();
  const ids = useMemo(() => steps.map((step) => step.id), [steps]);
  const sortable = Boolean(onReorder) && !readOnly;

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from === -1 || to === -1) return;
    const next = [...ids];
    next.splice(to, 0, ...next.splice(from, 1));
    onReorder?.(next);
  }

  if (steps.length === 0) {
    return <EmptyState title={text.empty} {...(className === undefined ? {} : { className })} />;
  }

  const list = (
    <ol className={cn('flex list-none flex-col', className)}>
      {steps.map((step, index) => (
        <Step
          key={step.id}
          step={step}
          index={index}
          total={steps.length}
          sortable={sortable}
          readOnly={readOnly}
          isLast={index === steps.length - 1}
          text={text}
          descriptionId={`${generatedId}-${step.id}`}
          {...(stepActions === undefined ? {} : { stepActions })}
        />
      ))}
      {footer ? <li className="ps-9 pt-2">{footer}</li> : null}
    </ol>
  );

  if (!sortable) {
    return (
      <div {...(rest['aria-label'] === undefined ? {} : { 'aria-label': rest['aria-label'] })}>
        {list}
      </div>
    );
  }

  return (
    <DragDropProvider
      onDragEnd={onDragEnd}
      describeItem={(id) => steps.find((step) => step.id === id)?.name ?? id}
    >
      <div {...(rest['aria-label'] === undefined ? {} : { 'aria-label': rest['aria-label'] })}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {list}
        </SortableContext>
      </div>
    </DragDropProvider>
  );
}

const STATUS_ICON = {
  approved: Check,
  rejected: X,
  skipped: Minus,
} as const;

function Step({
  step,
  index,
  total,
  sortable,
  readOnly,
  isLast,
  text,
  descriptionId,
  stepActions,
}: {
  step: ApprovalStep;
  index: number;
  total: number;
  sortable: boolean;
  readOnly: boolean;
  isLast: boolean;
  text: Required<ApprovalFlowLabels>;
  descriptionId: string;
  stepActions?: (step: ApprovalStep, index: number) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: step.id,
    disabled: !sortable,
  });

  const status = step.status ?? 'pending';
  const Icon =
    status === 'approved' || status === 'rejected' || status === 'skipped'
      ? STATUS_ICON[status]
      : null;

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      aria-describedby={descriptionId}
      className={cn('relative flex gap-3 pb-3', isDragging && 'opacity-40')}
    >
      {/* The rail joining the steps. Decoration — the ordered list already carries the sequence. */}
      {!isLast ? (
        <span
          aria-hidden="true"
          className="absolute start-3 top-7 bottom-0 w-px bg-border"
          style={{ insetInlineStart: sortable ? 34 : 11 }}
        />
      ) : null}

      {sortable ? (
        <button
          type="button"
          aria-label={text.reorder(step.name)}
          className={cn(
            'mt-1 size-6 shrink-0 cursor-grab touch-none rounded text-muted-foreground',
            'hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          )}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="mx-auto size-4" aria-hidden="true" />
        </button>
      ) : null}

      <span
        aria-hidden="true"
        className={cn(
          'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium',
          readOnly && status === 'approved' && 'border-success bg-success text-background',
          readOnly && status === 'rejected' && 'border-destructive bg-destructive text-background',
          readOnly && status === 'active' && 'border-primary bg-primary text-primary-foreground',
          (!readOnly || status === 'pending' || status === 'skipped') &&
            'border-border bg-background text-muted-foreground',
        )}
      >
        {Icon ? <Icon className="size-3.5" /> : index + 1}
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-1 rounded-lg border border-border bg-card p-3">
        <span className="flex flex-wrap items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{step.name}</span>
          {step.mode ? (
            <Badge tone="muted">{step.mode === 'all' ? text.modeAll : text.modeAny}</Badge>
          ) : null}
          {readOnly && step.status ? (
            <Badge tone={STATUS_TONE[status]}>{text.status(status)}</Badge>
          ) : null}
          {stepActions?.(step, index)}
        </span>
        {step.approvers ? <span className="text-sm">{step.approvers}</span> : null}
        {step.condition ? (
          <span className="text-xs text-muted-foreground">{step.condition}</span>
        ) : null}
        {step.meta}
      </div>

      {/*
        The position is announced rather than left to the visible number, because the number is in
        a decorative badge and an `<ol>` alone does not tell a screen reader "of five".
      */}
      <span id={descriptionId} className="sr-only">
        {text.stepPosition(index + 1, total)}
        {readOnly && step.status ? `, ${text.status(status)}` : ''}
      </span>
    </li>
  );
}
