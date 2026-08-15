import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './dropdown-menu.js';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from './context-menu.js';

/**
 * Phase 8.22 — an open menu must not hide the application.
 *
 * Radix's menu `Root` defaults to `modal`, and both menus re-exported it bare. A modal menu marks
 * every other element `aria-hidden="true"`, so opening one removed the entire page from the
 * accessibility tree — while the popup itself stayed `role="menu"` with no `aria-modal` to declare
 * that anything modal was happening. Measured in Munaxa Docs: **56 of 56 open menus, on every
 * route**, each reporting axe's `aria-hidden-focus`, with 25 focusable elements inside the hidden
 * subtree.
 *
 * The comparison that settles which side is wrong is in this same library: `Dialog` sets
 * `aria-modal="true"` and leaves the page alone. The menus were claiming more than the dialogue.
 *
 * These tests assert the *contract*, not the absence of one attribute: the menu must still open,
 * still close on Escape, still return focus to its trigger, and a consumer must still be able to
 * ask for modal behaviour explicitly. A test that only checked "nothing is aria-hidden" would pass
 * just as happily against a menu that had stopped opening at all.
 */

const OUTSIDE = (
  <>
    <a href="/elsewhere">A link outside</a>
    <button type="button">A button outside</button>
  </>
);

/** Every `aria-hidden` subtree that still contains something focusable — axe's rule, in one line. */
function hiddenFocusables(): number {
  return [...document.querySelectorAll('[aria-hidden="true"]')].reduce(
    (total, element) =>
      total +
      element.querySelectorAll(
        'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])',
      ).length,
    0,
  );
}

function Menu({ modal }: { modal?: boolean } = {}) {
  return (
    <div>
      {OUTSIDE}
      <DropdownMenu {...(modal === undefined ? {} : { modal })}>
        <DropdownMenuTrigger>Open</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>One</DropdownMenuItem>
          <DropdownMenuItem>Two</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

describe('a dropdown menu', () => {
  it('opens, so nothing below is asserting against a menu that never appeared', async () => {
    render(<Menu />);
    await userEvent.click(screen.getByText('Open'));
    await waitFor(() => {
      expect(screen.getByRole('menu')).toBeInTheDocument();
    });
    expect(screen.getAllByRole('menuitem')).toHaveLength(2);
  });

  it('leaves the rest of the page in the accessibility tree', async () => {
    render(<Menu />);
    await userEvent.click(screen.getByText('Open'));
    await waitFor(() => {
      expect(screen.getByRole('menu')).toBeInTheDocument();
    });

    expect(
      hiddenFocusables(),
      'an open menu must not hide focusable page content — this is `aria-hidden-focus`',
    ).toBe(0);
  });

  it('closes on Escape and gives focus back to its trigger', async () => {
    render(<Menu />);
    const trigger = screen.getByText('Open');
    await userEvent.click(trigger);
    await waitFor(() => {
      expect(screen.getByRole('menu')).toBeInTheDocument();
    });

    await userEvent.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('menu')).toBeNull();
    });
    expect(document.activeElement).toBe(trigger);
  });

  it('still lets a consumer ask for the modal behaviour explicitly', async () => {
    render(<Menu modal />);
    await userEvent.click(screen.getByText('Open'));
    await waitFor(() => {
      expect(screen.getByRole('menu')).toBeInTheDocument();
    });

    expect(
      hiddenFocusables(),
      'the prop is unchanged — only its default is, so this must still hide the page',
    ).toBeGreaterThan(0);
  });
});

describe('a context menu', () => {
  function Context() {
    return (
      <div>
        {OUTSIDE}
        <ContextMenu>
          <ContextMenuTrigger>Right click me</ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem>One</ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      </div>
    );
  }

  it('opens on the secondary button', async () => {
    render(<Context />);
    await userEvent.pointer({ keys: '[MouseRight]', target: screen.getByText('Right click me') });
    await waitFor(() => {
      expect(screen.getByRole('menu')).toBeInTheDocument();
    });
  });

  it('leaves the rest of the page in the accessibility tree', async () => {
    render(<Context />);
    await userEvent.pointer({ keys: '[MouseRight]', target: screen.getByText('Right click me') });
    await waitFor(() => {
      expect(screen.getByRole('menu')).toBeInTheDocument();
    });

    expect(hiddenFocusables()).toBe(0);
  });
});
