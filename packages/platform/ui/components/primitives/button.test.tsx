import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button, buttonVariants } from './button.js';
import { expectNoA11yViolations } from '../../../test/setup.js';

describe('Button', () => {
  it('defaults to type="button" so it never submits a form by accident', () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('type', 'button');
  });

  it('honours an explicit type', () => {
    render(<Button type="submit">Save</Button>);
    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('type', 'submit');
  });

  it('forwards arbitrary element props and the ref', () => {
    const ref = vi.fn();
    render(
      <Button ref={ref} data-testid="cta" aria-describedby="hint">
        Go
      </Button>,
    );
    const button = screen.getByTestId('cta');
    expect(button).toHaveAttribute('aria-describedby', 'hint');
    expect(ref).toHaveBeenCalled();
  });

  it('merges className rather than replacing the variant classes', () => {
    render(<Button className="w-full">Wide</Button>);
    const button = screen.getByRole('button', { name: 'Wide' });
    expect(button.className).toContain('w-full');
    expect(button.className).toContain('bg-primary');
  });

  it('is operable by keyboard', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<Button onClick={onClick}>Press</Button>);
    await user.tab();
    expect(screen.getByRole('button', { name: 'Press' })).toHaveFocus();
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it('does not fire when disabled', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(
      <Button onClick={onClick} disabled>
        Press
      </Button>,
    );
    await user.click(screen.getByRole('button', { name: 'Press' }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('exposes an accessible name for an icon-only button', async () => {
    const { container } = render(
      <Button size="icon" aria-label="Add record">
        <svg aria-hidden="true" />
      </Button>,
    );
    expect(screen.getByRole('button', { name: 'Add record' })).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('has no accessibility violations across every variant', async () => {
    const { container } = render(
      <div>
        <Button variant="default">Default</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="outline">Outline</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="destructive">Destructive</Button>
        <Button disabled>Disabled</Button>
      </div>,
    );
    await expectNoA11yViolations(container);
  });

  describe('buttonVariants', () => {
    it('is usable on non-button elements and keeps the same classes', () => {
      render(
        <a href="/somewhere" className={buttonVariants('outline', 'lg')}>
          Link CTA
        </a>,
      );
      const link = screen.getByRole('link', { name: 'Link CTA' });
      expect(link.className).toContain('border-border');
      expect(link.className).toContain('h-10');
    });
  });
});
