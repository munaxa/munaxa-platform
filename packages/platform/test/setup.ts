import { afterEach, expect } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { axe, toHaveNoViolations } from 'jest-axe';

expect.extend(toHaveNoViolations);

afterEach(cleanup);

/**
 * Run axe against a rendered container and assert it is clean.
 *
 * Colour-contrast is disabled here on purpose: happy-dom does not apply the stylesheet, so every
 * element resolves to transparent-on-transparent and axe would report a violation on markup that
 * is in fact fine. Contrast is enforced where it can actually be measured — the palette generator
 * computes `--primary-foreground` and `--primary-strong` from real WCAG ratios, and the a11y
 * addon checks rendered stories in Storybook.
 */
export async function expectNoA11yViolations(container: Element): Promise<void> {
  const results = await axe(container, {
    rules: { 'color-contrast': { enabled: false } },
  });
  expect(results).toHaveNoViolations();
}
