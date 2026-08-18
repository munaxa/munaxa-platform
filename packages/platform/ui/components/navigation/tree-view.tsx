'use client';

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type FocusEvent as ReactFocusEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { cn } from '../../lib/cn.js';
import { isRtlElement } from '../../lib/direction.js';
import { ChevronDown, ChevronRight } from '../../../icons/index.js';

/**
 * One node, as the product already has it.
 *
 * A flat list with `parentId` rather than nested children, because that is the shape a query
 * returns — a folder table, a reporting line, a category table. Assembling the hierarchy is this
 * module's job rather than a transformation every caller writes.
 */
export interface TreeNode {
  id: string;
  /**
   * Plain text, and the item's accessible name.
   *
   * Named explicitly rather than computed from the rendered content, because a treeitem's computed
   * name is everything inside it: in a nested tree that is the node *and its whole subtree*, so the
   * root of a company would be announced as its own name followed by every person in it.
   */
  label: string;
  parentId?: string | null;
}

/** A node with its children resolved — what `buildBranches` produces and the renderers walk. */
export interface TreeBranch<T extends TreeNode> {
  node: T;
  children: TreeBranch<T>[];
  depth: number;
}

/**
 * The props the consumer must place on the element that *is* the tree item.
 *
 * ## The contract, and why it matters
 *
 * These go on **one** element, and that element is the treeitem: it carries the role, the ARIA
 * state, the tab stop and the focus handler together. Splitting them — a `role="treeitem"` wrapper
 * around a focusable link, say — produces a widget that looks right and is not: two tab stops per
 * row instead of the one the pattern promises, and a screen reader announcing the focused element
 * without the level, position or expanded state that make a tree a tree.
 *
 * That is why `TreeView` renders a presentational `<li>` and hands these out rather than applying
 * them itself. A navigation tree needs its items to be real anchors — with an `href`, a middle
 * click, a context menu and a status-bar URL — and the only way an anchor can be a treeitem is to
 * be given the props directly:
 *
 * ```tsx
 * renderItem={({ node, treeItemProps }) => (
 *   <Link href={hrefFor(node)} {...treeItemProps}>{node.label}</Link>
 * )}
 * ```
 */
export interface TreeItemProps {
  role: 'treeitem';
  'aria-label': string;
  'aria-level': number;
  'aria-setsize': number;
  'aria-posinset': number;
  'aria-expanded'?: boolean;
  'aria-selected'?: boolean;
  tabIndex: 0 | -1;
  onFocus: (event: ReactFocusEvent<HTMLElement>) => void;
  /**
   * Identifies the item so the tree can move focus to it.
   *
   * The key is the renderer's — `data-tree-item` from `TreeView`, `data-node` from `OrgChart`,
   * which had that attribute before the extraction and keeps it. Typed as a `data-*` signature
   * rather than one fixed name so neither renderer has to lie about the other's.
   */
  [dataAttribute: `data-${string}`]: string | undefined;
}

export interface TreeItemContext<T extends TreeNode> {
  node: T;
  /** Zero at the roots. Already applied as indentation by `TreeView`. */
  depth: number;
  expanded: boolean;
  hasChildren: boolean;
  treeItemProps: TreeItemProps;
  /** Open or close this node. `TreeView` renders its own affordance; this is for a custom one. */
  toggle: () => void;
}

export interface TreeViewLabels {
  expand?: (label: string) => string;
  collapse?: (label: string) => string;
}

export interface TreeViewProps<T extends TreeNode> {
  nodes: T[];
  renderItem: (context: TreeItemContext<T>) => ReactNode;
  /** Uncontrolled starting expansion. Everything is expanded when omitted. */
  defaultExpanded?: string[];
  expanded?: string[];
  onExpandedChange?: (expanded: string[]) => void;
  /** Enter on the focused item. A navigation tree usually needs nothing here — the anchor is real. */
  onActivate?: (node: T) => void;
  /**
   * Marks one item `aria-selected`, for a tree that *is* a selection control.
   *
   * **Leave it unset for a navigation tree.** `aria-selected` and `aria-current` describe different
   * widgets: the first says "this is the value of this control", the second says "this is the page
   * you are on". A navigation tree wants the second, and its items are the consumer's own links —
   * so the consumer puts `aria-current` on them and this stays undefined. `TreeView` never emits
   * `aria-current`, and never emits `aria-selected` unless this prop is given, so the two cannot
   * both appear on one item through this API.
   */
  selectedId?: string;
  /** Rules from a parent down its children. Off by default. */
  guides?: boolean;
  /**
   * Space activates as well as Enter.
   *
   * Off by default, because a navigation tree's items are links and Space scrolls the page there.
   * On for a tree that is a selection control — which is what `OrgChart` is, and why it sets this.
   */
  activateOnSpace?: boolean;
  labels?: TreeViewLabels;
  className?: string;
  'aria-label': string;
}

const DEFAULT_LABELS: Required<TreeViewLabels> = {
  expand: (label) => `Expand ${label}`,
  collapse: (label) => `Collapse ${label}`,
};

/**
 * Assemble a flat list into a forest.
 *
 * Nodes whose parent is missing from the list become roots rather than disappearing: a query that
 * returns one department's people will not include their director, and silently dropping every one
 * of them would render an empty tree with no error to explain it.
 */
export function buildBranches<T extends TreeNode>(nodes: T[]): TreeBranch<T>[] {
  const byId = new Map<string, TreeBranch<T>>(
    nodes.map((node) => [node.id, { node, children: [], depth: 0 }]),
  );
  const roots: TreeBranch<T>[] = [];

  for (const node of nodes) {
    const entry = byId.get(node.id) as TreeBranch<T>;
    const parent = node.parentId ? byId.get(node.parentId) : undefined;
    if (parent && parent !== entry) parent.children.push(entry);
    else roots.push(entry);
  }

  // Depth is assigned by walking, not by counting parents — a cycle in the data would otherwise
  // loop forever, and bad hierarchy data is common enough to defend against.
  const seen = new Set<string>();
  const walk = (entry: TreeBranch<T>, depth: number) => {
    if (seen.has(entry.node.id)) return;
    seen.add(entry.node.id);
    entry.depth = depth;
    for (const child of entry.children) walk(child, depth + 1);
  };
  for (const root of roots) walk(root, 0);

  return roots;
}

/** Visible nodes in visual order — the sequence the up and down arrows walk. */
export function flattenVisible<T extends TreeNode>(
  roots: TreeBranch<T>[],
  expanded: Set<string>,
): TreeBranch<T>[] {
  const out: TreeBranch<T>[] = [];
  const walk = (entries: TreeBranch<T>[]) => {
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

export interface TreeNavigationOptions<T extends TreeNode> {
  nodes: T[];
  defaultExpanded?: string[];
  expanded?: string[];
  onExpandedChange?: (expanded: string[]) => void;
  onActivate?: (node: T) => void;
  selectedId?: string;
  activateOnSpace?: boolean;
  /** Attribute the focusable item carries, so the hook can move focus to it. */
  itemAttribute: string;
}

/**
 * The tree's behaviour, with no opinion about its markup — Phase 9 extraction.
 *
 * The APG tree pattern was implemented once, for `OrgChart`, and welded to a chart: nested boxes,
 * connector rails, an orientation, and "direct reports" in the labels. All of the *behaviour* in
 * there is generic — the expansion model, the visible-node walk, the keyboard, the direction
 * mirroring, the ARIA arithmetic — and none of it had a second home.
 *
 * It lives here now, and both renderers use it. They cannot share a DOM shape: a chart draws its
 * children **inside** the parent, so a nested list is the only structure that produces the layout,
 * while a navigation tree needs each item to *be* an anchor, and an anchor cannot contain the list
 * of its own children. Two shapes, one engine, rather than two engines.
 */
export function useTreeNavigation<T extends TreeNode>({
  nodes,
  defaultExpanded,
  expanded: controlled,
  onExpandedChange,
  onActivate,
  activateOnSpace = false,
  itemAttribute,
}: TreeNavigationOptions<T>) {
  const treeRef = useRef<HTMLUListElement>(null);

  const roots = useMemo(() => buildBranches(nodes), [nodes]);
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

  const visible = useMemo(() => flattenVisible(roots, expandedSet), [roots, expandedSet]);
  const [focusedId, setFocusedId] = useState<string | undefined>(() => visible[0]?.node.id);

  // The focused node may have been collapsed away or removed; fall back to the first visible one
  // rather than leaving the tree with no tab stop at all.
  const activeId = visible.some((entry) => entry.node.id === focusedId)
    ? focusedId
    : visible[0]?.node.id;

  const focusNode = useCallback(
    (id: string | undefined) => {
      if (!id) return;
      setFocusedId(id);
      treeRef.current?.querySelector<HTMLElement>(`[${itemAttribute}="${cssEscape(id)}"]`)?.focus();
    },
    [itemAttribute],
  );

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLUListElement>) => {
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
        // Forward opens a closed node, then steps into it — the APG behaviour, and the reason a
        // tree can be explored with one hand on the arrow keys.
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
      } else if (event.key === 'Enter' || (activateOnSpace && event.key === ' ')) {
        event.preventDefault();
        onActivate?.(current.node);
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
    },
    [activateOnSpace, activeId, expandedSet, focusNode, onActivate, toggle, visible],
  );

  /** The ARIA a single item carries. Identical whichever DOM shape renders it. */
  const itemPropsFor = useCallback(
    (
      entry: TreeBranch<T>,
      index: number,
      siblingCount: number,
      selectedId: string | undefined,
    ): TreeItemProps => {
      const hasChildren = entry.children.length > 0;
      return {
        role: 'treeitem',
        'aria-label': entry.node.label,
        'aria-level': entry.depth + 1,
        'aria-setsize': siblingCount,
        'aria-posinset': index + 1,
        ...(hasChildren ? { 'aria-expanded': expandedSet.has(entry.node.id) } : {}),
        ...(selectedId === undefined ? {} : { 'aria-selected': selectedId === entry.node.id }),
        tabIndex: activeId === entry.node.id ? 0 : -1,
        [itemAttribute]: entry.node.id,
        onFocus: (event: ReactFocusEvent<HTMLElement>) => {
          /*
           * Only when this item is itself the target.
           *
           * React's `onFocus` is `focusin`, which bubbles — and in a nested renderer the items *are*
           * ancestors of one another. Without this guard, focusing a leaf walks the event up through
           * every ancestor item and each one claims it, so the tree's idea of where the focus is ends
           * up on the outermost node and the arrow keys stop moving. It cost `OrgChart` four tests to
           * say so, which is exactly what they were for.
           */
          if (event.target === event.currentTarget) setFocusedId(entry.node.id);
        },
      };
    },
    [activeId, expandedSet, itemAttribute],
  );

  return { treeRef, roots, visible, expandedSet, activeId, toggle, onKeyDown, itemPropsFor };
}

/**
 * A hierarchy of destinations — the APG `tree` pattern, with the items supplied by the product.
 *
 * **Flat markup, hierarchy in ARIA.** Every visible item is a direct child of one `role="tree"`
 * list, and the level, the set size and the position in set carry the structure. The alternative —
 * nesting a `role="group"` list inside each parent item — is the shape a chart needs and the shape
 * a navigation tree cannot have, because the item must *be* the anchor and an anchor cannot contain
 * the list of its own children. `aria-level` is a first-class way to express depth precisely so
 * this case works.
 *
 * **The product renders the item; this renders the tree.** `renderItem` receives `treeItemProps`
 * and must spread them onto a single element — see `TreeItemProps` for why that matters. The
 * platform must not import a router, so a link is the product's to render, exactly as it is for
 * `SidebarNav` and `Breadcrumb`.
 *
 * **Keyboard** is the APG tree: one tab stop, up and down move through visible items, forward
 * expands or descends, backward collapses or ascends, Home and End jump to the ends, and typing a
 * letter jumps to the next item starting with it. In a right-to-left layout the horizontal keys
 * swap, because they follow the direction the tree visibly grows.
 */
export function TreeView<T extends TreeNode>({
  nodes,
  renderItem,
  defaultExpanded,
  expanded,
  onExpandedChange,
  onActivate,
  selectedId,
  guides = false,
  activateOnSpace = false,
  labels,
  className,
  ...rest
}: TreeViewProps<T>) {
  const text = { ...DEFAULT_LABELS, ...labels };
  const tree = useTreeNavigation<T>({
    nodes,
    itemAttribute: 'data-tree-item',
    activateOnSpace,
    ...(defaultExpanded === undefined ? {} : { defaultExpanded }),
    ...(expanded === undefined ? {} : { expanded }),
    ...(onExpandedChange === undefined ? {} : { onExpandedChange }),
    ...(onActivate === undefined ? {} : { onActivate }),
  });

  /** Which sibling run each visible item belongs to, for `aria-setsize` and `aria-posinset`. */
  const positions = useMemo(() => {
    const map = new Map<string, { index: number; siblingCount: number }>();
    const walk = (entries: TreeBranch<T>[]) => {
      entries.forEach((entry, index) => {
        map.set(entry.node.id, { index, siblingCount: entries.length });
        walk(entry.children);
      });
    };
    walk(tree.roots);
    return map;
  }, [tree.roots]);

  return (
    <ul
      ref={tree.treeRef}
      role="tree"
      onKeyDown={tree.onKeyDown}
      aria-label={rest['aria-label']}
      className={cn('flex list-none flex-col', className)}
    >
      {tree.visible.map((entry) => {
        const { node, depth, children } = entry;
        const hasChildren = children.length > 0;
        const isOpen = tree.expandedSet.has(node.id);
        const position = positions.get(node.id) ?? { index: 0, siblingCount: 1 };

        return (
          // Presentational: the treeitem is whatever `renderItem` returns, so this carries no role
          // of its own. Indentation and the optional guide live here rather than on the item, so a
          // consumer's element keeps whatever padding its own design gives it.
          <li
            key={node.id}
            role="none"
            className={cn(
              'flex items-center gap-1',
              guides && depth > 0 && 'border-s border-border',
            )}
            style={{ paddingInlineStart: `${String(depth)}rem` }}
          >
            {hasChildren ? (
              <button
                type="button"
                tabIndex={-1}
                aria-hidden="true"
                // Hidden from assistive technology on purpose: `aria-expanded` on the item is
                // already the accessible control, and exposing a second one would announce the same
                // state twice and put a stop inside a single-tab-stop widget.
                title={isOpen ? text.collapse(node.label) : text.expand(node.label)}
                onClick={() => {
                  tree.toggle(node.id, !isOpen);
                }}
                className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-secondary"
              >
                {isOpen ? (
                  <ChevronDown className="size-3.5" />
                ) : (
                  <ChevronRight className="size-3.5 rtl:rotate-180" />
                )}
              </button>
            ) : (
              <span className="size-4 shrink-0" aria-hidden="true" />
            )}

            {renderItem({
              node,
              depth,
              expanded: isOpen,
              hasChildren,
              treeItemProps: tree.itemPropsFor(
                entry,
                position.index,
                position.siblingCount,
                selectedId,
              ),
              toggle: () => {
                tree.toggle(node.id, !isOpen);
              },
            })}
          </li>
        );
      })}
    </ul>
  );
}
