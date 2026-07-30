import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Popover, PopoverContent, PopoverTrigger } from './popover.js';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './dropdown-menu.js';
import { Tooltip } from '../feedback/tooltip.js';
import { Button } from '../primitives/button.js';
import { expectNoA11yViolations } from '../../../test/setup.js';

describe('Popover', () => {
  const setup = () =>
    render(
      <Popover>
        <PopoverTrigger asChild>
          <Button>Filters</Button>
        </PopoverTrigger>
        <PopoverContent aria-label="Filters">
          <label htmlFor="q">Query</label>
          <input id="q" />
        </PopoverContent>
      </Popover>,
    );

  it('is closed until the trigger is used, and says so', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Filters' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens on click and marks the trigger expanded', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('button', { name: 'Filters' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Filters' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('opens from the keyboard', async () => {
    const user = userEvent.setup();
    setup();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Filters' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('closes on Escape and returns focus to the trigger', async () => {
    const user = userEvent.setup();
    setup();
    const trigger = screen.getByRole('button', { name: 'Filters' });
    await user.click(trigger);
    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it('has no accessibility violations when open', async () => {
    const user = userEvent.setup();
    const { baseElement } = setup();
    await user.click(screen.getByRole('button', { name: 'Filters' }));
    await screen.findByRole('dialog');
    await expectNoA11yViolations(baseElement, { radixOverlay: true });
  });
});

describe('DropdownMenu', () => {
  const onEdit = vi.fn();
  const onDelete = vi.fn();

  const setup = () => {
    onEdit.mockClear();
    onDelete.mockClear();
    return render(
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button>Actions</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel>Record</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onEdit}>Edit</DropdownMenuItem>
          <DropdownMenuCheckboxItem checked>Pinned</DropdownMenuCheckboxItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem destructive onSelect={onDelete}>
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
  };

  it('exposes menu semantics and advertises the popup', async () => {
    const user = userEvent.setup();
    setup();
    const trigger = screen.getByRole('button', { name: 'Actions' });
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    await user.click(trigger);
    expect(await screen.findByRole('menu')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.getByRole('menuitemcheckbox', { name: 'Pinned' })).toBeChecked();
  });

  it('opens with the keyboard and focuses the first item', async () => {
    const user = userEvent.setup();
    setup();
    await user.tab();
    await user.keyboard('{Enter}');
    await screen.findByRole('menu');
    await waitFor(() => expect(screen.getByRole('menuitem', { name: 'Edit' })).toHaveFocus());
  });

  it('moves between items with the arrow keys', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('button', { name: 'Actions' }));
    await screen.findByRole('menu');
    // A pointer-opened menu leaves focus on the content, so the first arrow lands on item one.
    await user.keyboard('{ArrowDown}');
    await waitFor(() => expect(screen.getByRole('menuitem', { name: 'Edit' })).toHaveFocus());
    await user.keyboard('{ArrowDown}');
    await waitFor(() =>
      expect(screen.getByRole('menuitemcheckbox', { name: 'Pinned' })).toHaveFocus(),
    );
  });

  it('selects with Enter and closes', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('button', { name: 'Actions' }));
    await screen.findByRole('menu');
    await user.keyboard('{ArrowDown}');
    await waitFor(() => expect(screen.getByRole('menuitem', { name: 'Edit' })).toHaveFocus());
    await user.keyboard('{Enter}');
    await waitFor(() => expect(onEdit).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
  });

  it('supports typeahead', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('button', { name: 'Actions' }));
    await screen.findByRole('menu');
    await user.keyboard('del');
    await waitFor(() => expect(screen.getByRole('menuitem', { name: 'Delete' })).toHaveFocus());
  });

  it('closes on Escape without selecting', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('button', { name: 'Actions' }));
    await screen.findByRole('menu');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    expect(onEdit).not.toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('has no accessibility violations when open', async () => {
    const user = userEvent.setup();
    const { baseElement } = setup();
    await user.click(screen.getByRole('button', { name: 'Actions' }));
    await screen.findByRole('menu');
    await expectNoA11yViolations(baseElement, { radixOverlay: true });
  });
});

describe('Tooltip', () => {
  it('keeps its original API and describes the trigger itself, not a wrapper', async () => {
    const user = userEvent.setup();
    render(
      <Tooltip content="Grants read access to finance">
        <button type="button">finance:read</button>
      </Tooltip>,
    );
    const trigger = screen.getByRole('button', { name: 'finance:read' });
    // `asChild` means the trigger *is* the button, so the description lands where a screen reader
    // actually is rather than on a span around it.
    await user.hover(trigger);
    await waitFor(() =>
      expect(trigger).toHaveAccessibleDescription('Grants read access to finance'),
    );
  });

  it('opens on keyboard focus, and Escape closes it', async () => {
    const user = userEvent.setup();
    render(
      <Tooltip content="Hint">
        <button type="button">Trigger</button>
      </Tooltip>,
    );
    await user.tab();
    await waitFor(() => expect(screen.getAllByText('Hint').length).toBeGreaterThan(0));
    // The old hand-rolled version had no dismissal at all except moving the pointer.
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByText('Hint')).not.toBeInTheDocument());
  });

  it('has no accessibility violations while open', async () => {
    const user = userEvent.setup();
    const { baseElement } = render(
      <Tooltip content="Hint">
        <button type="button">Trigger</button>
      </Tooltip>,
    );
    await user.tab();
    await waitFor(() => expect(screen.getAllByText('Hint').length).toBeGreaterThan(0));
    await expectNoA11yViolations(baseElement, { radixOverlay: true });
  });
});
