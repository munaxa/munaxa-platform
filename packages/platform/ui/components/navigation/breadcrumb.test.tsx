import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { Breadcrumb } from './breadcrumb.js';
import { ScrollArea } from '../layout/separator.js';
import { expectNoA11yViolations } from '../../../test/setup.js';

/**
 * Phase 8.12 — the two component defects the widened axe ruleset found.
 *
 * Both were invisible to the accessibility matrix for six phases because it ran exactly one rule,
 * `color-contrast`. Both are about a person who cannot see the screen or cannot use a mouse, and
 * neither changes a pixel — which is precisely why only a machine was ever going to catch them.
 */

const TRAIL = [
  { label: 'Home', href: '/' },
  { label: 'Library', href: '/library' },
  { label: 'Contracts', href: '/library/contracts' },
  { label: 'Renewals', href: '/library/contracts/renewals' },
  { label: 'This one' },
];

describe('Breadcrumb', () => {
  it('announces that crumbs were collapsed', async () => {
    // `aria-label` used to sit on the ellipsis `<span>`. ARIA forbids naming a generic element, so
    // assistive technology dropped it and the collapsed crumbs announced nothing whatsoever.
    render(<Breadcrumb items={TRAIL} maxItems={4} />);

    expect(
      screen.getByText('Hidden levels'),
      'the collapsed crumbs must say so in text a screen reader can reach',
    ).toBeInTheDocument();
    await expectNoA11yViolations(document.body);
  });

  it('does not name a role-less element, which is what made the label disappear', () => {
    const { container } = render(<Breadcrumb items={TRAIL} maxItems={4} />);
    const named = [...container.querySelectorAll('span[aria-label]')].filter(
      (el) => el.getAttribute('role') === null,
    );
    expect(
      named.map((el) => el.getAttribute('aria-label')),
      'a span with no role cannot carry an accessible name',
    ).toStrictEqual([]);
  });

  it('keeps the whole trail when it is short enough to show', () => {
    render(<Breadcrumb items={TRAIL.slice(0, 3)} maxItems={4} />);
    expect(screen.queryByText('Hidden levels')).not.toBeInTheDocument();
    expect(screen.getByText('Library')).toBeInTheDocument();
  });
});

describe('ScrollArea', () => {
  it('gives the scrolling region a Tab stop', () => {
    const { container } = render(
      <ScrollArea style={{ height: 40 }}>
        <p style={{ height: 400 }}>Long enough to overflow, and nothing in it to focus.</p>
      </ScrollArea>,
    );

    const viewport = container.querySelector('[data-radix-scroll-area-viewport]');
    expect(viewport, 'the component must render a viewport').not.toBeNull();
    expect(
      viewport?.getAttribute('tabindex'),
      'a region that scrolls but cannot be focused is unreachable from the keyboard — WCAG 2.1.1',
    ).toBe('0');
  });
});
