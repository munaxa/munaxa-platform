'use client';

import { type ReactNode } from 'react';
import { cn } from '../../lib/cn.js';
import { ChevronDown, ChevronRight } from '../../../icons/index.js';
import { EmptyState } from '../feedback/empty-state.js';
import {
  buildBranches,
  useTreeNavigation,
  type TreeBranch,
  type TreeItemProps,
} from '../navigation/tree-view.js';

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

/**
 * Assemble a flat list into a forest.
 *
 * The implementation moved to `TreeView` with the rest of the tree engine; this is the same
 * function under the name products already import.
 */
export const buildTree = buildBranches;

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
 *
 * ---
 *
 * **That behaviour is `useTreeNavigation`'s now**, shared with `TreeView`. The two cannot share
 * markup — a chart draws its children *inside* the parent, which needs a nested list, while a
 * navigation tree needs each item to be an anchor, and an anchor cannot contain the list of its own
 * children. So the DOM here is unchanged and only the engine beneath it moved.
 *
 * `activateOnSpace` is set because this chart is a *selection* control rather than a set of links.
 * Space has always picked a node here, and `TreeView`'s Enter-only default would otherwise have
 * been a silent behaviour change to a released component.
 */
export function OrgChart<T extends OrgNode>({
  nodes,
  renderNode,
  defaultExpanded,
  expanded,
  onExpandedChange,
  selectedId,
  onSelect,
  orientation = 'vertical',
  labels,
  className,
  ...rest
}: OrgChartProps<T>) {
  const text = { ...DEFAULT_LABELS, ...labels };
  const tree = useTreeNavigation<T>({
    nodes,
    itemAttribute: 'data-node',
    activateOnSpace: true,
    ...(defaultExpanded === undefined ? {} : { defaultExpanded }),
    ...(expanded === undefined ? {} : { expanded }),
    ...(onExpandedChange === undefined ? {} : { onExpandedChange }),
    ...(onSelect === undefined ? {} : { onActivate: onSelect }),
  });

  if (nodes.length === 0) {
    return <EmptyState title={text.empty} {...(className === undefined ? {} : { className })} />;
  }

  return (
    <div className={cn('overflow-auto', className)}>
      <ul
        ref={tree.treeRef}
        role="tree"
        onKeyDown={tree.onKeyDown}
        {...(rest['aria-label'] === undefined ? {} : { 'aria-label': rest['aria-label'] })}
        className={cn('flex list-none', orientation === 'vertical' ? 'justify-center' : 'flex-col')}
      >
        {tree.roots.map((root, index) => (
          <Branch
            key={root.node.id}
            entry={root}
            index={index}
            siblingCount={tree.roots.length}
            expandedSet={tree.expandedSet}
            toggle={tree.toggle}
            itemPropsFor={tree.itemPropsFor}
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
  itemPropsFor,
  selectedId,
  onSelect,
  renderNode,
  orientation,
  text,
}: {
  entry: TreeBranch<T>;
  index: number;
  siblingCount: number;
  expandedSet: Set<string>;
  toggle: (id: string, open: boolean) => void;
  itemPropsFor: (
    entry: TreeBranch<T>,
    index: number,
    siblingCount: number,
    selectedId: string | undefined,
  ) => TreeItemProps;
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
    /*
      The treeitem **is** the focusable element now.

      It used to be two: `role="treeitem"` and the ARIA state on this `<li>`, with `tabindex` and the
      focus handler on the box inside it. A screen reader landing on that box was therefore told
      nothing about the level, the position or the expanded state, because those attributes sat on an
      element it never reached. The extraction puts them on one element, which is what the pattern
      asks for — and is why the focus ring moved up here with them.
    */
    <li
      {...itemPropsFor(entry, index, siblingCount, selectedId)}
      className={cn(
        'relative flex list-none',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
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
              title={isOpen ? text.collapse(node.label) : text.expand(node.label)}
              onClick={() => {
                toggle(node.id, !isOpen);
              }}
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
            onClick={() => onSelect?.(node)}
            className={cn(
              'min-w-40 cursor-default rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-xs',
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
              itemPropsFor={itemPropsFor}
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
