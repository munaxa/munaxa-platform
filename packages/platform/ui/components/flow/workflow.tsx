'use client';

import { useId, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '../../lib/cn.js';
import { EmptyState } from '../feedback/empty-state.js';

export interface WorkflowNode {
  id: string;
  /** Plain-text name. The node's accessible name, and what typeahead matches. */
  label: string;
  /** The product's own node kind — `'approval'`, `'notify'`, `'branch'`. Platform never reads it. */
  type?: string;
  description?: string;
  /** Position on the canvas, in pixels. */
  x: number;
  y: number;
  tone?: 'default' | 'success' | 'warning' | 'danger';
}

export interface WorkflowEdge {
  id: string;
  from: string;
  to: string;
  label?: string;
}

export interface WorkflowLabels {
  canvas?: string;
  empty?: string;
  /** Describes a node's outgoing connections — the information the picture carries. */
  connections?: (from: string, to: string[]) => string;
  noConnections?: string;
  moveInstructions?: string;
  connectInstructions?: string;
}

const DEFAULT_LABELS: Required<WorkflowLabels> = {
  canvas: 'Workflow',
  empty: 'No steps yet',
  connections: (from, to) => `${from} leads to ${to.join(', ')}.`,
  noConnections: 'has no outgoing connections',
  moveInstructions:
    'Use the arrow keys to move between steps, and Shift with the arrow keys to reposition the ' +
    'selected step.',
  connectInstructions: 'Press Enter to select this step.',
};

const TONE = {
  default: 'border-border',
  success: 'border-success',
  warning: 'border-warning',
  danger: 'border-destructive',
} as const;

export interface WorkflowCanvasProps {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  /** Draw a node however the product wants. Default is the label plus its description. */
  renderNode?: (node: WorkflowNode) => ReactNode;
  /**
   * A node was repositioned. Omit it and the canvas is read-only.
   *
   * Position is the *only* thing the canvas will ever report about a node. It does not add, delete,
   * validate or connect — see the note on the component.
   */
  onNodeMove?: (id: string, x: number, y: number) => void;
  selectedId?: string;
  onSelect?: (node: WorkflowNode) => void;
  /** Pixels a Shift+arrow moves a node. */
  step?: number;
  nodeWidth?: number;
  labels?: WorkflowLabels;
  className?: string;
  'aria-label'?: string;
}

/**
 * A workflow diagram: steps on a canvas, with connections between them.
 *
 * **Presentation only, and the boundary is hard.** This component owns *layout and interaction* —
 * where a node sits, how it is selected, how the arrow keys move focus and position, how an edge is
 * drawn. It owns nothing else. It does not know what a step type means, cannot validate a workflow,
 * will not add or delete a node, and has no idea how any of it executes. Products define their node
 * types, their rules and their engine; the canvas draws whatever it is handed and reports where the
 * user put things.
 *
 * That is not squeamishness about scope. A workflow editor that knew about "approval steps" would
 * be an approval editor, and the next product's workflow — a document pipeline, an onboarding
 * sequence — would need a fork of it.
 *
 * **A diagram is not the content.** A canvas of absolutely-positioned boxes joined by SVG paths is
 * completely opaque: the *only* thing it communicates is which step leads to which, and that is
 * exactly what a picture cannot say. So the nodes are a real list in document order, each named and
 * each described by its outgoing connections — "Manager approval leads to Finance review, Reject" —
 * and the SVG carrying the lines is `aria-hidden`, because the lines are a redundant rendering of
 * information already in the text.
 *
 * **Keyboard.** One tab stop into the canvas, arrows move between steps in document order, Shift
 * with the arrows repositions the focused step, Enter selects. There is no drag-only path.
 */
export function WorkflowCanvas({
  nodes,
  edges,
  renderNode,
  onNodeMove,
  selectedId,
  onSelect,
  step = 16,
  nodeWidth = 176,
  labels,
  className,
  ...rest
}: WorkflowCanvasProps) {
  const text = { ...DEFAULT_LABELS, ...labels };
  const generatedId = useId();
  const [focusedIndex, setFocusedIndex] = useState(0);

  const byId = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);

  /** Outgoing targets per node — the sentence that replaces the picture. */
  const outgoing = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const edge of edges) {
      const target = byId.get(edge.to);
      if (!target) continue;
      map.set(edge.from, [...(map.get(edge.from) ?? []), target.label]);
    }
    return map;
  }, [edges, byId]);

  /** Canvas extent, padded so a node at the edge is not clipped. */
  const extent = useMemo(() => {
    let width = 0;
    let height = 0;
    for (const node of nodes) {
      width = Math.max(width, node.x + nodeWidth);
      height = Math.max(height, node.y + 96);
    }
    return { width: width + 32, height: height + 32 };
  }, [nodes, nodeWidth]);

  function onKeyDown(event: KeyboardEvent<HTMLUListElement>) {
    const node = nodes[focusedIndex];
    if (!node) return;

    const deltas: Record<string, [number, number]> = {
      ArrowRight: [step, 0],
      ArrowLeft: [-step, 0],
      ArrowDown: [0, step],
      ArrowUp: [0, -step],
    };
    const delta = deltas[event.key];

    if (event.shiftKey && delta && onNodeMove) {
      event.preventDefault();
      onNodeMove(node.id, Math.max(0, node.x + delta[0]), Math.max(0, node.y + delta[1]));
      return;
    }

    // Without Shift the arrows move *focus*, in document order rather than by geometry: a graph has
    // no reliable "the node to the right", and guessing produces a traversal that skips nodes.
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
      event.preventDefault();
      moveFocus(Math.min(focusedIndex + 1, nodes.length - 1));
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
      event.preventDefault();
      moveFocus(Math.max(focusedIndex - 1, 0));
    } else if (event.key === 'Home') {
      event.preventDefault();
      moveFocus(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      moveFocus(nodes.length - 1);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect?.(node);
    }
  }

  function moveFocus(index: number) {
    setFocusedIndex(index);
    const id = nodes[index]?.id;
    if (id) {
      document
        .querySelector<HTMLElement>(`[data-workflow-node="${generatedId}-${cssEscape(id)}"]`)
        ?.focus();
    }
  }

  if (nodes.length === 0) {
    return <EmptyState title={text.empty} {...(className === undefined ? {} : { className })} />;
  }

  return (
    <div className={cn('overflow-auto rounded-xl border border-border bg-muted/20', className)}>
      <div className="relative" style={{ width: extent.width, height: extent.height }}>
        {/*
          The lines are decoration. Every edge is already stated in the text of the node it leaves,
          so exposing the SVG would announce the same graph twice — once as prose and once as a
          heap of <path> elements with nothing to say.
        */}
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          width={extent.width}
          height={extent.height}
        >
          <defs>
            <marker
              id={`${generatedId}-arrow`}
              viewBox="0 0 8 8"
              refX="7"
              refY="4"
              markerWidth="6"
              markerHeight="6"
              orient="auto"
            >
              <path d="M0,0 L8,4 L0,8 Z" className="fill-border" />
            </marker>
          </defs>
          {edges.map((edge) => {
            const from = byId.get(edge.from);
            const to = byId.get(edge.to);
            if (!from || !to) return null;
            const x1 = from.x + nodeWidth / 2;
            const y1 = from.y + 72;
            const x2 = to.x + nodeWidth / 2;
            const y2 = to.y;
            const mid = (y1 + y2) / 2;
            return (
              <path
                key={edge.id}
                // A cubic curve through the vertical midpoint, so two edges leaving the same node
                // separate visibly instead of overlapping into one thick line.
                d={`M${x1},${y1} C${x1},${mid} ${x2},${mid} ${x2},${y2}`}
                fill="none"
                strokeWidth="1.5"
                className="stroke-border"
                markerEnd={`url(#${generatedId}-arrow)`}
              />
            );
          })}
        </svg>

        <ul
          role="list"
          onKeyDown={onKeyDown}
          {...(rest['aria-label'] === undefined ? {} : { 'aria-label': rest['aria-label'] })}
          className="absolute inset-0 list-none"
        >
          {nodes.map((node, index) => {
            const targets = outgoing.get(node.id) ?? [];
            const descriptionId = `${generatedId}-${node.id}-desc`;
            return (
              <li
                key={node.id}
                className="absolute"
                style={{ insetInlineStart: node.x, top: node.y, width: nodeWidth }}
              >
                <div
                  data-workflow-node={`${generatedId}-${node.id}`}
                  tabIndex={index === focusedIndex ? 0 : -1}
                  aria-describedby={descriptionId}
                  {...(selectedId === undefined ? {} : { 'aria-current': selectedId === node.id })}
                  onFocus={() => setFocusedIndex(index)}
                  onClick={() => onSelect?.(node)}
                  className={cn(
                    'flex min-h-16 cursor-default flex-col gap-0.5 rounded-lg border-2 bg-card p-3 shadow-sm',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    TONE[node.tone ?? 'default'],
                    selectedId === node.id && 'ring-2 ring-primary',
                  )}
                >
                  {renderNode ? (
                    renderNode(node)
                  ) : (
                    <>
                      <span className="truncate text-sm font-medium">{node.label}</span>
                      {node.description ? (
                        <span className="truncate text-xs text-muted-foreground">
                          {node.description}
                        </span>
                      ) : null}
                    </>
                  )}
                </div>

                {/* The edges, as text. This is the accessible equivalent of the drawn lines. */}
                <span id={descriptionId} className="sr-only">
                  {targets.length > 0
                    ? text.connections(node.label, targets)
                    : `${node.label} ${text.noConnections}.`}
                  {onNodeMove ? ` ${text.moveInstructions}` : ''}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function cssEscape(value: string): string {
  return typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
    ? CSS.escape(value)
    : value.replace(/["\\]/g, '\\$&');
}
