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
export interface A11yOptions {
  /**
   * Relax the two rules a portalled Radix layer cannot satisfy. Both are properties of portalling,
   * not defects in the markup:
   *
   * - `aria-hidden-focus` — Radix brackets every portal with `<span data-radix-focus-guard
   *   tabindex="0" aria-hidden="true">` sentinels. That is how focus is kept from escaping into the
   *   page behind, and screen readers skip them.
   * - `region` — a page-structure rule requiring content to sit inside a landmark. A portal renders
   *   to `document.body` by design, so it is outside the page's landmark tree no matter how the
   *   trigger is wrapped.
   *
   * It is a per-call flag rather than a global setting because jest-axe forwards its options to
   * `axe.run` and never to the context, so a selector-scoped exclusion is not available. Keeping it
   * at the call site means the exemption stays visible instead of quietly covering markup we own.
   */
  radixOverlay?: boolean;
}

export async function expectNoA11yViolations(
  container: Element,
  options: A11yOptions = {},
): Promise<void> {
  const results = await axe(container, {
    rules: {
      'color-contrast': { enabled: false },
      ...(options.radixOverlay
        ? { 'aria-hidden-focus': { enabled: false }, region: { enabled: false } }
        : {}),
    },
  });
  expect(results).toHaveNoViolations();
}
