import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Overline } from './overline.js';
import { expectNoA11yViolations } from '../../../test/setup.js';

describe('Overline', () => {
  it('renders as a span by default and as the heading it is asked to be', () => {
    const { rerender } = render(<Overline>Metadata</Overline>);
    expect(screen.getByText('Metadata').tagName).toBe('SPAN');
    rerender(<Overline as="h3">Metadata</Overline>);
    expect(screen.getByRole('heading', { level: 3, name: 'Metadata' })).toBeInTheDocument();
  });

  it('uses the muted token at full strength and drops spacing in RTL', () => {
    render(<Overline>Folders</Overline>);
    const label = screen.getByText('Folders');
    expect(label).toHaveClass('text-muted-foreground', 'uppercase', 'rtl:tracking-normal');
    expect([...label.classList].filter((c) => c.startsWith('text-muted-foreground/'))).toEqual([]);
  });

  it('has no violations', async () => {
    const { container } = render(<Overline as="h2">Recent activity</Overline>);
    await expectNoA11yViolations(container);
  });
});
