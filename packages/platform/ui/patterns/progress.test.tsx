import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { Progress, ReadinessRing } from './progress.js';
import { Stepper } from './stepper.js';
import { expectNoA11yViolations } from '../../test/setup.js';

/**
 * Phase 8.13 — the defect found by rendering components that had never been rendered.
 *
 * `Progress` had no story and nothing else composed it, so it was absent from all 800 brand ×
 * scheme combinations of the accessibility matrix. Its own doc comment claimed "Accessible
 * (role=progressbar)". What it emitted when `label` was omitted was
 *
 *     <div role="progressbar" aria-valuenow="40" aria-valuemin="0" aria-valuemax="100"
 *          aria-label={undefined}>
 *
 * — a progressbar with no accessible name, which axe reports as `aria-progressbar-name` and which a
 * screen reader announces as "progress bar, 40 percent" with nothing to say what is at forty
 * percent. `label` now defaults to `'Progress'`, the same shape as `Breadcrumb`'s `label` and
 * `InspectorLayout`'s `inspectorLabel`.
 *
 * `ReadinessRing` and `Stepper` are asserted alongside it because they were in the same uncovered
 * set and both turned out to be correct — a regression test that only guards the one thing that
 * was broken leaves the two that happened to be right just as unwatched as before.
 */

describe('Progress', () => {
  it('names the bar even when the caller passes no label', async () => {
    const { container } = render(<Progress value={40} />);

    const bar = screen.getByRole('progressbar');
    expect(
      bar.getAttribute('aria-label'),
      'a progressbar with no accessible name announces a percentage and nothing else',
    ).toBe('Progress');
    await expectNoA11yViolations(container);
  });

  it('lets the caller say what is progressing', () => {
    render(<Progress value={72} label="Storage used" />);
    expect(screen.getByRole('progressbar').getAttribute('aria-label')).toBe('Storage used');
  });

  it('reports the value it was given, clamped to the range', () => {
    const { rerender } = render(<Progress value={140} label="Over" />);
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('100');
    rerender(<Progress value={-20} label="Under" />);
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('0');
  });
});

describe('ReadinessRing', () => {
  it('names the gauge with its value and caption', async () => {
    const { container } = render(<ReadinessRing value={92} caption="Ready" />);
    expect(screen.getByRole('img').getAttribute('aria-label')).toBe('92% Ready');
    await expectNoA11yViolations(container);
  });
});

describe('Stepper', () => {
  const STEPS = [
    { key: 'scope', title: 'Scope' },
    { key: 'review', title: 'Review' },
    { key: 'confirm', title: 'Confirm' },
  ];

  it('marks the active step and names the list', async () => {
    const { container } = render(<Stepper current={1} steps={STEPS} />);

    expect(screen.getByRole('list').getAttribute('aria-label')).toBe('Progress');
    expect(
      container.querySelectorAll('[aria-current="step"]').length,
      'exactly one step is the current one',
    ).toBe(1);
    await expectNoA11yViolations(container);
  });
});
