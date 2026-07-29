/**
 * Which way the text runs at a given element.
 *
 * Needed wherever the *horizontal* arrow keys move something: in a right-to-left layout ArrowLeft
 * means "forward", because a user's hand follows the direction the content visibly runs rather than
 * the order of an array. Getting it from the wrong place is why so many grids and trees are
 * unusable in Arabic while looking perfectly correct in a screenshot.
 *
 * The nearest `dir` attribute wins because that is what actually sets the direction in practice —
 * `<html dir="rtl">`, or a `dir` on the one panel that is mirrored. Computed style is the fallback
 * for the rarer case of `direction: rtl` applied purely from CSS, and it is checked second because
 * it is also the one that is unavailable outside a real browser.
 */
export function isRtlElement(element: Element | null | undefined): boolean {
  if (!element) return false;

  const scoped = element.closest('[dir]')?.getAttribute('dir')?.toLowerCase();
  if (scoped === 'rtl') return true;
  if (scoped === 'ltr') return false;

  if (typeof getComputedStyle === 'undefined') return false;
  return getComputedStyle(element).direction === 'rtl';
}

/** `1` when the arrow keys should move forward in document order, `-1` when they are mirrored. */
export function forwardStep(element: Element | null | undefined): 1 | -1 {
  return isRtlElement(element) ? -1 : 1;
}
