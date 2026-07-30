import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dialog } from './dialog.js';
import { Button } from '../primitives/button.js';
import { expectNoA11yViolations } from '../../../test/setup.js';

function Harness({ description }: { description?: string | undefined }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <Button onClick={() => setOpen(true)}>Open</Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Confirm action"
        {...(description === undefined ? {} : { description })}
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => setOpen(false)}>Confirm</Button>
          </>
        }
      >
        <input aria-label="Reason" />
      </Dialog>
    </div>
  );
}

describe('Dialog', () => {
  it('renders nothing while closed', () => {
    render(<Harness />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('is a modal labelled by its title', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Open' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleName('Confirm action');
  });

  it('is described by its description only when one is given', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<Harness description="This cannot be undone." />);
    await user.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByRole('dialog')).toHaveAccessibleDescription('This cannot be undone.');
    unmount();

    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByRole('dialog')).not.toHaveAttribute('aria-describedby');
  });

  it('moves focus into the panel on open', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Open' }));
    await waitFor(() => expect(screen.getByRole('dialog')).toHaveFocus());
  });

  it('restores focus to the trigger on close', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'Open' });
    await user.click(trigger);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Open' }));
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('closes on backdrop click but not on panel click', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Open' }));

    await user.click(screen.getByRole('dialog'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    // The outermost fixed layer is the click-catching backdrop.
    await user.click(screen.getByRole('dialog').parentElement as HTMLElement);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('locks body scroll while open and restores it on close', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(document.body.style.overflow).toBe('');
    await user.click(screen.getByRole('button', { name: 'Open' }));
    expect(document.body.style.overflow).toBe('hidden');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(document.body.style.overflow).toBe(''));
  });

  it('traps Tab inside the panel', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Open' }));

    const reason = screen.getByLabelText('Reason');
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    const confirm = screen.getByRole('button', { name: 'Confirm' });

    await user.tab();
    expect(reason).toHaveFocus();
    await user.tab();
    expect(cancel).toHaveFocus();
    await user.tab();
    expect(confirm).toHaveFocus();
    // Past the last control, focus wraps to the first rather than escaping to the page behind.
    await user.tab();
    expect(reason).toHaveFocus();
  });

  it('traps Shift+Tab backwards past the first control', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Open' }));

    await user.tab();
    expect(screen.getByLabelText('Reason')).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Confirm' })).toHaveFocus();
  });

  it('keeps typing in a field working when onClose identity changes each render', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Open' }));
    const reason = screen.getByLabelText('Reason');
    await user.click(reason);
    await user.keyboard('hello');
    expect(reason).toHaveValue('hello');
  });

  it('has no accessibility violations when open', async () => {
    const user = userEvent.setup();
    const { baseElement } = render(<Harness description="This cannot be undone." />);
    await user.click(screen.getByRole('button', { name: 'Open' }));
    await expectNoA11yViolations(baseElement);
  });

  it('calls onClose exactly once per dismissal', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<Dialog open onClose={onClose} title="T" />);
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
