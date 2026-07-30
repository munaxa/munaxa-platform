import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Pagination } from './pagination.js';
import { expectNoA11yViolations } from '../../../test/setup.js';

describe('Pagination', () => {
  it('renders nothing for a single page', () => {
    const { container } = render(<Pagination page={1} pageCount={1} onPageChange={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('is a labelled navigation landmark', () => {
    render(<Pagination page={2} pageCount={5} onPageChange={vi.fn()} />);
    expect(screen.getByRole('navigation', { name: 'Pagination' })).toBeInTheDocument();
  });

  it('disables Previous on the first page and Next on the last', () => {
    const { rerender } = render(<Pagination page={1} pageCount={3} onPageChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Previous/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Next/ })).toBeEnabled();

    rerender(<Pagination page={3} pageCount={3} onPageChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Previous/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Next/ })).toBeDisabled();
  });

  it('steps one page at a time in each direction', async () => {
    const onPageChange = vi.fn();
    const user = userEvent.setup();
    render(<Pagination page={2} pageCount={5} onPageChange={onPageChange} />);

    await user.click(screen.getByRole('button', { name: /Next/ }));
    expect(onPageChange).toHaveBeenLastCalledWith(3);

    await user.click(screen.getByRole('button', { name: /Previous/ }));
    expect(onPageChange).toHaveBeenLastCalledWith(1);
  });

  it('never calls onPageChange past either end', async () => {
    const onPageChange = vi.fn();
    const user = userEvent.setup();
    render(<Pagination page={1} pageCount={2} onPageChange={onPageChange} />);
    await user.click(screen.getByRole('button', { name: /Previous/ }));
    expect(onPageChange).not.toHaveBeenCalled();
  });

  it('accepts translated labels', () => {
    render(
      <Pagination
        page={2}
        pageCount={4}
        onPageChange={vi.fn()}
        labels={{ nav: 'ترقيم', previous: 'السابق', next: 'التالي', page: 'صفحة' }}
      />,
    );
    expect(screen.getByRole('navigation', { name: 'ترقيم' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /السابق/ })).toBeInTheDocument();
    expect(screen.getByText(/صفحة 2 \/ 4/)).toBeInTheDocument();
  });

  it('has no accessibility violations', async () => {
    const { container } = render(<Pagination page={2} pageCount={5} onPageChange={vi.fn()} />);
    await expectNoA11yViolations(container);
  });
});
