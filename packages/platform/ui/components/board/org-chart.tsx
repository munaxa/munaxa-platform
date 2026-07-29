'use client';

import { useCallback, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '../../lib/cn.js';
import { isRtlElement } from '../../lib/direction.js';
import { ChevronDown, ChevronRight } from '../../../icons/index.js';
import { EmptyState } from '../feedback/empty-state.js';

export interface OrgNode {
  id: string;
  /** Plain-text name — the accessible name for the node and what typeahead matches. */
  label: string;
  parentId?: string | null;
}

export interface OrgChartLabels {
  empty?: string;
  expand?: (label: string) => string;
  collapse?: (label: string) => string;
  reports?: (count: number) => string;
}

const DEFAULT_LABELS: Required<OrgChartLabels> = {
  empty: 'No people to show',
  expand: (label) => `Expand ${label}`,
  collapse: (label) => `Collapse ${label}`,
  reports: (count) => `${count} direct ${count === 1 ? 'report' : 'reports'}`,
};

export type OrgChartOrientation = 'vertical' | 'horizontal';

export interface OrgChartProps<T extends OrgNode> {
  /** Flat list. The tree is built from `parentId`, so a product can hand over a query result. */
  nodes: T[];
  renderNode?: (node: T, context: { depth: number; childCount: number }) => ReactNode;
  /** Uncontrolled starting expansion. Everything is expanded when omitted. */
  defaultExpanded?: string[];
  expanded?: string[];
  onExpandedChange?: (expanded: string[]) => void;
  selectedId?: string;
  onSelect?: (node: T) => void;
  /** `vertical` draws the classic top-down chart; `horizontal` runs left to right. */
  orientation?: OrgChartOrientation;
  labels?: OrgChartLabels;
  className?: string;
  'aria-label'?: string;
}

interface TreeNode<T extends OrgNode> {
  node: T;
  children: TreeNode<T>[];
  depth: number;
}

/**
 * A reporting hierarchy.
 *
 * **It is a tree, not a diagram of boxes.** The markup is a nested list carrying the APG `tree`
 * pattern — `role="tree"`, `role="treeitem"`, `aria-expanded`, `aria-level`, `aria-setsize`,
 * `aria-posinset` — and the connector lines are drawn in CSS on top of that. Org charts are
 * routinely shipped as absolutely-positioned divs or an SVG, which looks identical and is
 * completely opaque: a screen-reader user gets a pile of names with no indication of who reports to
 * whom, which is the *only* information the chart exists to convey.
 *
 * **Keyboard** is the APG tree: one tab stop, up and down move through visible nodes, right expands
 * or descends, left collapses or ascends, Home and End jump to the ends, and typing a letter jumps
 * to the next node starting with it. In a right-to-left layout the horizontal keys swap, because
 * they follow the direction the tree visibly grows.
 *
 * **A flat list in, a tree out.** Products hand over what their query returned; assembling it is
 * this component's job, not a transformation every caller writes.
 */
export function OrgChart<T extends OrgNode>({
  nodes,
  renderNode,
  defaultExpanded,
  expanded: controlled,
  onExpandedChange,
  selectedId,
  onSelect,
  orientation = 'vertical',
  labels,
  className,
  ...rest
}: OrgChartProps<T>) {
  const text = { ...DEFAULT_LABELS, ...labels };
  const treeRef = useRef<HTMLUListElement>(null);

  const roots = useMemo(() => buildTree(nodes), [nodes]);
  const allIds = useMemo(() => nodes.map((node) => node.id), [nodes]);

  const [uncontrolled, setUncontrolled] = useState<string[]>(defaultExpanded ?? allIds);
  const expanded = controlled ?? uncontrolled;
  const expandedSet = useMemo(() => new Set(expanded), [expanded]);

  const setExpanded = useCallback(
    (next: string[]) => {
      if (controlled === undefined) setUncontrolled(next);
      onExpandedChange?.(next);
    },
    [controlled, onExpandedChange],
  );

  const toggle = useCallback(
    (id: string, open: boolean) => {
      setExpanded(open ? [...expanded, id] : expanded.filter((value) => value !== id));
    },
    [expanded, setExpanded],
  );

  /** Nodes the user can actually see, in visual order — what the arrow keys walk. */
  const visible = useMemo(() => flatten(roots, expandedSet), [roots, expandedSet]);
  const [focusedId, setFocusedId] = useState<string | undefined>(() => visible[0]?.node.id);

  // The focused node may have been collapsed away or removed; fall back to the first visible one
  // rather than leaving the tree with no tab stop at all.
  const activeId = visible.some((entry) => entry.node.id === focusedId)
    ? focusedId
    : visible[0]?.node.id;

  const focusNode = useCallback((id: string | undefined) => {
    if (!id) return;
    setFocusedId(id);
    treeRef.current?.querySelector<HTMLElement>(`[data-node="${cssEscape(id)}"]`)?.focus();
  }, []);

  function onKeyDown(event: KeyboardEvent<HTMLUListElement>) {
    const index = visible.findIndex((entry) => entry.node.id === activeId);
    const current = visible[index];
    if (!current) return;

    const rtl = isRtlElement(treeRef.current);
    const forward = event.key === (rtl ? 'ArrowLeft' : 'ArrowRight');
    const backward = event.key === (rtl ? 'ArrowRight' : 'ArrowLeft');
    const hasChildren = current.children.length > 0;
    const isOpen = expandedSet.has(current.node.id);

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      focusNode(visible[Math.min(index + 1, visible.length - 1)]?.node.id);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      focusNode(visible[Math.max(index - 1, 0)]?.node.id);
    } else if (forward) {
      event.preventDefault();
      // Right opens a closed node, then steps into it — the APG behaviour, and the reason a tree
      // can be explored with one hand on the arrow keys.
      if (hasChildren && !isOpen) toggle(current.node.id, true);
      else if (hasChildren) focusNode(visible[index + 1]?.node.id);
    } else if (backward) {
      event.preventDefault();
      if (hasChildren && isOpen) toggle(current.node.id, false);
      else focusNode(current.node.parentId ?? undefined);
    } else if (event.key === 'Home') {
      event.preventDefault();
      focusNode(visible[0]?.node.id);
    } else if (event.key === 'End') {
      event.preventDefault();
      focusNode(visible[visible.length - 1]?.node.id);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect?.(current.node);
    } else if (event.key.length === 1 && /\S/.test(event.key)) {
      // Typeahead: search after the current node and wrap, so repeating a letter cycles.
      const letter = event.key.toLowerCase();
      const order = [...visible.slice(index + 1), ...visible.slice(0, index + 1)];
      const match = order.find((entry) => entry.node.label.toLowerCase().startsWith(letter));
      if (match) {
        event.preventDefault();
        focusNode(match.node.id);
      }
    }
  }

  if (nodes.length === 0) {
    return <EmptyState title={text.empty} {...(className === undefined ? {} : { className })} />;
  }

  return (
    <div className={cn('overflow-auto', className)}>
      <ul
        ref={treeRef}
        role="tree"
        onKeyDown={onKeyDown}
        {...(rest['aria-label'] === undefined ? {} : { 'aria-label': rest['aria-label'] })}
        className={cn('flex list-none', orientation === 'vertical' ? 'justify-center' : 'flex-col')}
      >
        {roots.map((root, index) => (
          <Branch
            key={root.node.id}
            entry={root}
            index={index}
            siblingCount={roots.length}
            expandedSet={expandedSet}
            toggle={toggle}
            activeId={activeId}
            onFocusNode={setFocusedId}
            {...(selectedId === undefined ? {} : { selectedId })}
            {...(onSelect === undefined ? {} : { onSelect })}
            {...(renderNode === undefined ? {} : { renderNode })}
            orientation={orientation}
            text={text}
          />
        ))}
      </ul>
    </div>
  );
}

function Branch<T extends OrgNode>({
  entry,
  index,
  siblingCount,
  expandedSet,
  toggle,
  activeId,
  onFocusNode,
  selectedId,
  onSelect,
  renderNode,
  orientation,
  text,
}: {
  entry: TreeNode<T>;
  index: number;
  siblingCount: number;
  expandedSet: Set<string>;
  toggle: (id: string, open: boolean) => void;
  activeId: string | undefined;
  onFocusNode: (id: string) => void;
  selectedId?: string;
  onSelect?: (node: T) => void;
  renderNode?: (node: T, context: { depth: number; childCount: number }) => ReactNode;
  orientation: OrgChartOrientation;
  text: Required<OrgChartLabels>;
}) {
  const { node, children, depth } = entry;
  const hasChildren = children.length > 0;
  const isOpen = expandedSet.has(node.id);
  const vertical = orientation === 'vertical';

  return (
    <li
      role="treeitem"
      // Named explicitly, not from its content. A treeitem's accessible name is computed from
      // everything inside it — which, for a branch, is its entire subtree: the chief executive
      // would be announced as their own name followed by every person in the company. The node's
      // own label is the only correct answer, which is why `OrgNode.label` is plain text.
      aria-label={node.label}
      aria-level={depth + 1}
      aria-setsize={siblingCount}
      aria-posinset={index + 1}
      {...(hasChildren ? { 'aria-expanded': isOpen } : {})}
      {...(selectedId === undefined ? {} : { 'aria-selected': selectedId === node.id })}
      className={cn(
        'relative flex list-none',
        vertical ? 'flex-col items-center px-2' : 'flex-col ps-4',
        // The connector into this node, drawn from the parent's rail.
        !vertical && depth > 0 && 'border-s border-border',
      )}
    >
      <div className={cn('flex items-center gap-1', vertical && 'flex-col')}>
        <div className="flex items-center gap-1">
          {hasChildren ? (
            <button
              type="button"
              tabIndex={-1}
              aria-hidden="true"
              // Hidden from assistive technology on purpose: `aria-expanded` on the treeitem is
              // already the accessible control, and exposing a second one would announce the same
              // state twice and put a stop inside a single-tab-stop widget.
              onClick={() => toggle(node.id, !isOpen)}
              className="rounded p-0.5 text-muted-foreground hover:bg-secondary"
            >
              {isOpen ? (
                <ChevronDown className="size-3.5" />
              ) : (
                <ChevronRight className="size-3.5 rtl:rotate-180" />
              )}
            </button>
          ) : (
            <span className="size-4" aria-hidden="true" />
          )}

          <div
            data-node={node.id}
            tabIndex={activeId === node.id ? 0 : -1}
            onFocus={() => onFocusNode(node.id)}
            onClick={() => onSelect?.(node)}
            className={cn(
              'min-w-40 cursor-default rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-xs',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              selectedId === node.id && 'border-primary ring-2 ring-primary/40',
            )}
          >
            {renderNode ? (
              renderNode(node, { depth, childCount: children.length })
            ) : (
              <>
                <span className="block truncate font-medium">{node.label}</span>
                {hasChildren ? (
                  <span className="block text-xs text-muted-foreground">
                    {text.reports(children.length)}
                  </span>
                ) : null}
              </>
            )}
          </div>
        </div>

        {/* The rail down to the children, in a vertical chart. */}
        {vertical && hasChildren && isOpen ? (
          <span aria-hidden="true" className="h-4 w-px bg-border" />
        ) : null}
      </div>

      {hasChildren && isOpen ? (
        <ul
          role="group"
          className={cn('flex list-none', vertical ? 'items-start pt-0' : 'flex-col')}
        >
          {children.map((child, childIndex) => (
            <Branch
              key={child.node.id}
              entry={child}
              index={childIndex}
              siblingCount={children.length}
              expandedSet={expandedSet}
              toggle={toggle}
              activeId={activeId}
              onFocusNode={onFocusNode}
              {...(selectedId === undefined ? {} : { selectedId })}
              {...(onSelect === undefined ? {} : { onSelect })}
              {...(renderNode === undefined ? {} : { renderNode })}
              orientation={orientation}
              text={text}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

/**
 * Assemble a flat list into a forest.
 *
 * Nodes whose parent is missing from the list become roots rather than disappearing: a query that
 * returns one department's people will not include their director, and silently dropping every one
 * of them would render an empty chart with no error to explain it.
 */
export function buildTree<T extends OrgNode>(nodes: T[]): TreeNode<T>[] {
  const byId = new Map<string, TreeNode<T>>(
    nodes.map((node) => [node.id, { node, children: [], depth: 0 }]),
  );
  const roots: TreeNode<T>[] = [];

  for (const node of nodes) {
    const entry = byId.get(node.id) as TreeNode<T>;
    const parent = node.parentId ? byId.get(node.parentId) : undefined;
    if (parent && parent !== entry) parent.children.push(entry);
    else roots.push(entry);
  }

  // Depth is assigned by walking, not by counting parents — a cycle in the data would otherwise
  // loop forever, and bad hierarchy data is common enough to defend against.
  const seen = new Set<string>();
  const walk = (entry: TreeNode<T>, depth: number) => {
    if (seen.has(entry.node.id)) return;
    seen.add(entry.node.id);
    entry.depth = depth;
    for (const child of entry.children) walk(child, depth + 1);
  };
  for (const root of roots) walk(root, 0);

  return roots;
}

/** Visible nodes in visual order — the sequence the up and down arrows walk. */
function flatten<T extends OrgNode>(roots: TreeNode<T>[], expanded: Set<string>): TreeNode<T>[] {
  const out: TreeNode<T>[] = [];
  const walk = (entries: TreeNode<T>[]) => {
    for (const entry of entries) {
      out.push(entry);
      if (expanded.has(entry.node.id)) walk(entry.children);
    }
  };
  walk(roots);
  return out;
}

/** `CSS.escape` is not in every runtime this renders in, and an id can contain anything. */
function cssEscape(value: string): string {
  return typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
    ? CSS.escape(value)
    : value.replace(/["\\]/g, '\\$&');
}
