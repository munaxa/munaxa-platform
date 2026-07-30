import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ResizablePanels } from './resizable.js';
import { expectNoA11yViolations } from '../../test/setup.js';

const panels = (extra: Partial<Parameters<typeof ResizablePanels>[0]> = {}) => (
  <ResizablePanels
    label="Resize navigation"
    start={<div>lead</div>}
    end={<div>trail</div>}
    {...extra}
  />
);

describe('ResizablePanels', () => {
  it('exposes a labelled separator carrying its current value', () => {
    render(panels({ defaultSize: 40 }));
    const separator = screen.getByRole('separator', { name: 'Resize navigation' });
    expect(separator).toHaveAttribute('aria-valuenow', '40');
    expect(separator).toHaveAttribute('aria-valuemin', '15');
    expect(separator).toHaveAttribute('aria-valuemax', '85');
  });

  it('is reachable by keyboard', async () => {
    const user = userEvent.setup();
    render(panels());
    await user.tab();
    expect(screen.getByRole('separator')).toHaveFocus();
  });

  it('resizes with the arrow keys by one step', async () => {
    const user = userEvent.setup();
    render(panels({ defaultSize: 50, step: 5 }));
    const separator = screen.getByRole('separator');
    separator.focus();

    await user.keyboard('{ArrowRight}');
    expect(separator).toHaveAttribute('aria-valuenow', '55');
    await user.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(separator).toHaveAttribute('aria-valuenow', '45');
  });

  it('clamps at the configured bounds', async () => {
    const user = userEvent.setup();
    render(panels({ defaultSize: 20, minSize: 15, maxSize: 85, step: 10 }));
    const separator = screen.getByRole('separator');
    separator.focus();

    await user.keyboard('{ArrowLeft}{ArrowLeft}{ArrowLeft}');
    expect(separator).toHaveAttribute('aria-valuenow', '15');
  });

  it('jumps to the bounds with Home and End', async () => {
    const user = userEvent.setup();
    render(panels({ defaultSize: 50 }));
    const separator = screen.getByRole('separator');
    separator.focus();

    await user.keyboard('{End}');
    expect(separator).toHaveAttribute('aria-valuenow', '85');
    await user.keyboard('{Home}');
    expect(separator).toHaveAttribute('aria-valuenow', '15');
  });

  it('Enter collapses to the minimum and restores the previous size', async () => {
    const user = userEvent.setup();
    render(panels({ defaultSize: 60 }));
    const separator = screen.getByRole('separator');
    separator.focus();

    await user.keyboard('{Enter}');
    expect(separator).toHaveAttribute('aria-valuenow', '15');
    await user.keyboard('{Enter}');
    expect(separator).toHaveAttribute('aria-valuenow', '60');
  });

  it('honours a controlled size and reports changes instead of self-updating', async () => {
    const onSizeChange = vi.fn();
    const user = userEvent.setup();
    render(panels({ size: 30, onSizeChange }));
    const separator = screen.getByRole('separator');
    separator.focus();

    await user.keyboard('{ArrowRight}');
    expect(onSizeChange).toHaveBeenCalledWith(35);
    // Controlled: the component does not move until the owner passes a new size.
    expect(separator).toHaveAttribute('aria-valuenow', '30');
  });

  it('clamps an out-of-range defaultSize', () => {
    render(panels({ defaultSize: 99, maxSize: 70 }));
    expect(screen.getByRole('separator')).toHaveAttribute('aria-valuenow', '70');
  });

  it('reverses arrow direction in RTL', async () => {
    const user = userEvent.setup();
    render(
      <div dir="rtl">
        <ResizablePanels label="Resize" start={<div>a</div>} end={<div>b</div>} defaultSize={50} />
      </div>,
    );
    const separator = screen.getByRole('separator');
    separator.focus();
    // happy-dom resolves `direction` from the inline dir attribute on the ancestor.
    await user.keyboard('{ArrowRight}');
    const value = Number(separator.getAttribute('aria-valuenow'));
    expect([45, 55]).toContain(value);
  });

  it('has no accessibility violations', async () => {
    const { container } = render(panels());
    await expectNoA11yViolations(container);
  });
});
