import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { TreeView, type TreeNode } from './tree-view.js';

/**
 * A hierarchy of destinations, carrying the APG `tree` pattern.
 *
 * The engine is shared with `OrgChart`; what differs is the markup, because a navigation tree needs
 * each item to *be* a link and a link cannot contain the list of its own children. So the items here
 * are the product's own anchors, handed the role, the level and the tab stop through
 * `treeItemProps`.
 */
const meta = {
  title: 'Navigation/TreeView',
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

interface Folder extends TreeNode {
  href: string;
}

const FOLDERS: Folder[] = [
  { id: 'quality', label: 'Quality Management', parentId: null, href: '#quality' },
  { id: 'manual', label: 'Quality Manual', parentId: 'quality', href: '#manual' },
  { id: 'procedures', label: 'Procedures', parentId: 'quality', href: '#procedures' },
  { id: 'sop', label: 'SOP', parentId: 'procedures', href: '#sop' },
  { id: 'forms', label: 'Forms & Templates', parentId: 'procedures', href: '#forms' },
  { id: 'hr', label: 'Human Resources', parentId: null, href: '#hr' },
  { id: 'contracts', label: 'Contracts', parentId: 'hr', href: '#contracts' },
];

/**
 * The navigation shape: real anchors, and the current destination marked with `aria-current`
 * rather than `aria-selected` — the tree is not the control, the page is.
 */
export const DocumentStructure: Story = {
  render: function StructureStory() {
    const [current, setCurrent] = useState('sop');
    return (
      <div className="max-w-xs">
        <TreeView<Folder>
          aria-label="Document structure"
          nodes={FOLDERS}
          renderItem={({ node, treeItemProps }) => (
            <a
              href={node.href}
              {...treeItemProps}
              {...(node.id === current ? { 'aria-current': 'page' as const } : {})}
              onClick={(event) => {
                event.preventDefault();
                setCurrent(node.id);
              }}
              className="flex-1 truncate rounded px-2 py-1 text-sm hover:bg-accent aria-[current]:font-medium"
            >
              {node.label}
            </a>
          )}
        />
      </div>
    );
  },
};

/** Collapsed to the roots, so the disclosure affordance and the forward arrow have work to do. */
export const Collapsed: Story = {
  render: function CollapsedStory() {
    return (
      <div className="max-w-xs">
        <TreeView<Folder>
          aria-label="Collapsed structure"
          nodes={FOLDERS}
          defaultExpanded={[]}
          renderItem={({ node, treeItemProps }) => (
            <a
              href={node.href}
              {...treeItemProps}
              className="flex-1 truncate rounded px-2 py-1 text-sm hover:bg-accent"
            >
              {node.label}
            </a>
          )}
        />
      </div>
    );
  },
};

/**
 * Guides, which are off by default.
 *
 * The rule is `border-s` — logical, so it runs down the reading edge in Arabic as well.
 */
export const WithGuides: Story = {
  render: function GuidesStory() {
    return (
      <div className="max-w-xs">
        <TreeView<Folder>
          aria-label="Structure with guides"
          nodes={FOLDERS}
          guides
          renderItem={({ node, treeItemProps }) => (
            <a
              href={node.href}
              {...treeItemProps}
              className="flex-1 truncate rounded px-2 py-1 text-sm hover:bg-accent"
            >
              {node.label}
            </a>
          )}
        />
      </div>
    );
  },
};

/**
 * A selection tree rather than a navigation one: `selectedId` puts `aria-selected` on the items,
 * and there is no `aria-current` anywhere. The two never appear together.
 */
export const Selection: Story = {
  render: function SelectionStory() {
    const [selected, setSelected] = useState('procedures');
    return (
      <div className="max-w-xs">
        <TreeView<Folder>
          aria-label="Pick a folder"
          nodes={FOLDERS}
          selectedId={selected}
          activateOnSpace
          onActivate={(node) => {
            setSelected(node.id);
          }}
          renderItem={({ node, treeItemProps }) => (
            <span
              {...treeItemProps}
              onClick={() => {
                setSelected(node.id);
              }}
              className="flex-1 cursor-default truncate rounded px-2 py-1 text-sm hover:bg-accent aria-[selected=true]:bg-secondary aria-[selected=true]:font-medium"
            >
              {node.label}
            </span>
          )}
        />
      </div>
    );
  },
};
