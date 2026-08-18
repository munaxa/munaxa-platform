import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TreeView, type TreeNode } from './tree-view.js';
import { LocaleProvider } from '../../date/index.js';
import { expectNoA11yViolations } from '../../../test/setup.js';

/**
 * The APG tree, as a set of destinations rather than a chart.
 *
 * The behaviour is `OrgChart`'s, extracted — so the tests that matter here are the ones the chart
 * could not have: that the item the product renders *is* the treeitem, that a link keeps its `href`
 * while carrying the role, and that `aria-selected` never appears beside a consumer's
 * `aria-current`. The keyboard and direction cases are repeated rather than assumed, because a
 * shared engine that regresses would regress silently in both consumers at once.
 */

interface Folder extends TreeNode {
  href: string;
}

const FOLDERS: Folder[] = [
  { id: 'q', label: 'Quality', parentId: null, href: '/q' },
  { id: 'p', label: 'Procedures', parentId: 'q', href: '/q/p' },
  { id: 's', label: 'SOP', parentId: 'p', href: '/q/p/s' },
  { id: 'f', label: 'Forms', parentId: 'q', href: '/q/f' },
  { id: 'h', label: 'Human Resources', parentId: null, href: '/h' },
];

function Tree(props: Partial<Parameters<typeof TreeView<Folder>>[0]> = {}) {
  return (
    <TreeView<Folder>
      aria-label="Document structure"
      nodes={FOLDERS}
      renderItem={({ node, treeItemProps }) => (
        <a href={node.href} {...treeItemProps}>
          {node.label}
        </a>
      )}
      {...props}
    />
  );
}

const item = (name: string) => screen.getByRole('treeitem', { name });

describe('TreeView structure', () => {
  it('is a tree whose items carry the hierarchy in ARIA', () => {
    render(<Tree />);
    expect(screen.getByRole('tree', { name: 'Document structure' })).toBeInTheDocument();

    const root = item('Quality');
    expect(root).toHaveAttribute('aria-level', '1');
    expect(root).toHaveAttribute('aria-setsize', '2');
    expect(root).toHaveAttribute('aria-posinset', '1');
    expect(root).toHaveAttribute('aria-expanded', 'true');

    const child = item('Procedures');
    expect(child).toHaveAttribute('aria-level', '2');
    expect(child).toHaveAttribute('aria-posinset', '1');
    expect(child).toHaveAttribute('aria-setsize', '2');

    // Three levels deep, which is the depth the hierarchy has to survive.
    expect(item('SOP')).toHaveAttribute('aria-level', '3');
  });

  it('names each item from its label, not from its rendered subtree', () => {
    render(<Tree />);
    expect(item('Quality')).toHaveAttribute('aria-label', 'Quality');
  });

  it('gives a leaf no aria-expanded', () => {
    render(<Tree />);
    expect(item('SOP')).not.toHaveAttribute('aria-expanded');
  });

  it('has no accessibility violations', async () => {
    const { container } = render(<Tree />);
    await expectNoA11yViolations(container);
  });
});

describe('the render seam', () => {
  it('puts the treeitem on the consumer element, keeping its href', () => {
    render(<Tree />);
    const link = item('Procedures');
    expect(link.tagName).toBe('A');
    expect(link).toHaveAttribute('href', '/q/p');
  });

  it('creates no second focusable wrapper around the item', () => {
    /*
     * The failure this guards against looks identical on screen: a `role="treeitem"` wrapper around
     * a focusable anchor gives two tab stops per row instead of the one the pattern promises. So the
     * assertion is that exactly one element in the whole tree is tabbable, and that it is the
     * treeitem itself rather than something containing it.
     */
    const { container } = render(<Tree />);
    const tabbable = container.querySelectorAll('[tabindex="0"]');
    expect(tabbable).toHaveLength(1);
    expect(tabbable[0]).toHaveAttribute('role', 'treeitem');

    for (const li of container.querySelectorAll('li')) {
      expect(li).toHaveAttribute('role', 'none');
    }
  });

  it('indents by depth with a logical property', () => {
    render(<Tree />);
    const rowOf = (name: string) => item(name).closest('li') as HTMLElement;
    expect(rowOf('Quality').style.paddingInlineStart).toBe('0rem');
    expect(rowOf('Procedures').style.paddingInlineStart).toBe('1rem');
    expect(rowOf('SOP').style.paddingInlineStart).toBe('2rem');
    // A left/right property here would measure the same in this test and indent from the wrong
    // edge in Arabic, so the assertion is on the logical one by name.
    expect(rowOf('SOP').style.paddingLeft).toBe('');
  });
});

describe('current and selected are not the same thing', () => {
  it('emits no aria-selected when selectedId is absent', () => {
    render(<Tree />);
    expect(item('Procedures')).not.toHaveAttribute('aria-selected');
  });

  it('emits aria-selected only when selectedId is given', () => {
    render(<Tree selectedId="p" />);
    expect(item('Procedures')).toHaveAttribute('aria-selected', 'true');
    expect(item('Quality')).toHaveAttribute('aria-selected', 'false');
  });

  it('never emits aria-current itself, leaving it to the navigation consumer', () => {
    const { container } = render(
      <TreeView<Folder>
        aria-label="Document structure"
        nodes={FOLDERS}
        renderItem={({ node, treeItemProps }) => (
          <a
            href={node.href}
            {...treeItemProps}
            {...(node.id === 'p' ? { 'aria-current': 'page' as const } : {})}
          >
            {node.label}
          </a>
        )}
      />,
    );
    // The consumer's own current marker survives untouched...
    expect(item('Procedures')).toHaveAttribute('aria-current', 'page');
    // ...and nothing in the tree carries both states at once.
    for (const node of container.querySelectorAll('[role="treeitem"]')) {
      expect(node.hasAttribute('aria-current') && node.hasAttribute('aria-selected')).toBe(false);
    }
  });
});

describe('expansion', () => {
  it('expands everything when nothing is said', () => {
    render(<Tree />);
    expect(item('SOP')).toBeInTheDocument();
  });

  it('honours defaultExpanded and updates itself', async () => {
    const user = userEvent.setup();
    render(<Tree defaultExpanded={['q']} />);
    expect(screen.queryByRole('treeitem', { name: 'SOP' })).not.toBeInTheDocument();

    await user.tab();
    await user.keyboard('{ArrowDown}{ArrowRight}');
    await waitFor(() => expect(screen.getByRole('treeitem', { name: 'SOP' })).toBeInTheDocument());
  });

  it('obeys a controlled expanded set and reports changes without moving on its own', async () => {
    const onExpandedChange = vi.fn();
    const user = userEvent.setup();
    render(<Tree expanded={['q']} onExpandedChange={onExpandedChange} />);

    await user.tab();
    await user.keyboard('{ArrowDown}{ArrowRight}');
    expect(onExpandedChange).toHaveBeenCalledWith(['q', 'p']);
    // Controlled means the parent decides: the tree did not expand itself.
    expect(screen.queryByRole('treeitem', { name: 'SOP' })).not.toBeInTheDocument();
  });

  it('collapses with the disclosure control', async () => {
    const user = userEvent.setup();
    render(<Tree />);
    await user.click(screen.getByTitle('Collapse Procedures'));
    await waitFor(() =>
      expect(screen.queryByRole('treeitem', { name: 'SOP' })).not.toBeInTheDocument(),
    );
  });
});

describe('keyboard', () => {
  it('walks the visible items with up and down', async () => {
    const user = userEvent.setup();
    render(<Tree />);
    await user.tab();
    await waitFor(() => expect(item('Quality')).toHaveFocus());
    await user.keyboard('{ArrowDown}');
    await waitFor(() => expect(item('Procedures')).toHaveFocus());
    await user.keyboard('{ArrowDown}');
    await waitFor(() => expect(item('SOP')).toHaveFocus());
    await user.keyboard('{ArrowUp}');
    await waitFor(() => expect(item('Procedures')).toHaveFocus());
  });

  it('collapses with the back arrow, then ascends to the parent', async () => {
    const user = userEvent.setup();
    render(<Tree />);
    await user.tab();
    await user.keyboard('{ArrowDown}');
    await waitFor(() => expect(item('Procedures')).toHaveFocus());

    await user.keyboard('{ArrowLeft}');
    await waitFor(() => expect(item('Procedures')).toHaveAttribute('aria-expanded', 'false'));

    // Already closed, so the same key now moves to the parent rather than doing nothing.
    await user.keyboard('{ArrowLeft}');
    await waitFor(() => expect(item('Quality')).toHaveFocus());
  });

  it('expands with the forward arrow, then descends', async () => {
    const user = userEvent.setup();
    render(<Tree defaultExpanded={[]} />);
    await user.tab();
    await user.keyboard('{ArrowRight}');
    await waitFor(() => expect(item('Quality')).toHaveAttribute('aria-expanded', 'true'));

    await user.keyboard('{ArrowRight}');
    await waitFor(() => expect(item('Procedures')).toHaveFocus());
  });

  it('jumps to the ends with Home and End', async () => {
    const user = userEvent.setup();
    render(<Tree />);
    await user.tab();
    await user.keyboard('{End}');
    await waitFor(() => expect(item('Human Resources')).toHaveFocus());
    await user.keyboard('{Home}');
    await waitFor(() => expect(item('Quality')).toHaveFocus());
  });

  it('jumps by first letter, and wraps when repeated', async () => {
    const user = userEvent.setup();
    render(<Tree />);
    await user.tab();
    await user.keyboard('s');
    await waitFor(() => expect(item('SOP')).toHaveFocus());
    // Only one item begins with "s", so pressing it again wraps back to the same one rather than
    // stopping at the end of the list.
    await user.keyboard('s');
    await waitFor(() => expect(item('SOP')).toHaveFocus());
  });

  it('activates with Enter', async () => {
    const onActivate = vi.fn();
    const user = userEvent.setup();
    render(<Tree onActivate={onActivate} />);
    await user.tab();
    await user.keyboard('{ArrowDown}{Enter}');
    expect(onActivate).toHaveBeenCalledWith(FOLDERS[1]);
  });

  it('does not activate with Space, because these items are links', async () => {
    /*
     * The one deliberate difference from `OrgChart`, which is a selection control and keeps Space
     * through `activateOnSpace`. On a link Space scrolls the page, and a tree that swallowed it
     * would take that away.
     */
    const onActivate = vi.fn();
    const user = userEvent.setup();
    render(<Tree onActivate={onActivate} />);
    await user.tab();
    await user.keyboard('{ArrowDown}[Space]');
    expect(onActivate).not.toHaveBeenCalled();
  });

  it('activates with Space when a selection tree asks for it', async () => {
    const onActivate = vi.fn();
    const user = userEvent.setup();
    render(<Tree onActivate={onActivate} activateOnSpace />);
    await user.tab();
    await user.keyboard('{ArrowDown}[Space]');
    expect(onActivate).toHaveBeenCalledWith(FOLDERS[1]);
  });
});

describe('right to left', () => {
  it('mirrors the horizontal keys', async () => {
    const user = userEvent.setup();
    render(
      <LocaleProvider locale="ar-JO" direction="rtl">
        <div dir="rtl">
          <Tree />
        </div>
      </LocaleProvider>,
    );
    await user.tab();
    await user.keyboard('{ArrowDown}');
    await waitFor(() => expect(item('Procedures')).toHaveFocus());

    // The tree grows leftwards here, so ArrowRight is the backward key and collapses.
    await user.keyboard('{ArrowRight}');
    await waitFor(() => expect(item('Procedures')).toHaveAttribute('aria-expanded', 'false'));

    await user.keyboard('{ArrowLeft}');
    await waitFor(() => expect(item('Procedures')).toHaveAttribute('aria-expanded', 'true'));
  });
});

describe('guides', () => {
  it('draws none by default', () => {
    const { container } = render(<Tree />);
    expect(container.querySelector('.border-s')).toBeNull();
  });

  it('draws a logical rule on indented rows when asked', () => {
    const { container } = render(<Tree guides />);
    const rowOf = (name: string) => item(name).closest('li') as HTMLElement;
    expect(rowOf('Procedures').className).toContain('border-s');
    // Roots have nothing to descend from.
    expect(rowOf('Quality').className).not.toContain('border-s');
    expect(container.querySelector('.border-l')).toBeNull();
  });
});
