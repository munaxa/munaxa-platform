import { type Page } from 'playwright';

import { MARK_TYPABLE } from './stories.js';

/**
 * The keyboard instrument — Phase 8.7.
 *
 * Kept apart from the suite that uses it so the test-proofs can drive the same code the matrix
 * runs. A proof that exercises a re-implementation proves nothing about the instrument.
 *
 * Two rules shape it:
 *
 *   - **The keyboard drives.** `element.focus()` proves an element is focusable, not that a person
 *     can reach it, so reachability is established by pressing Tab from the top of the document.
 *     Programmatic focus appears only where a control is already known reachable and the question
 *     has moved on to what a keypress does.
 *   - **Focus has to be visible.** `document.activeElement === el` is not evidence a keyboard user
 *     can see where they are, and neither is a computed box-shadow: a card that carries a resting
 *     shadow would report an indicator it never grew. The focused appearance is compared with the
 *     same element at rest.
 */

/**
 * How far Tab is pressed before a control is called unreachable.
 *
 * A floor rather than a limit: the walk now visits every stop a story renders, and the largest here
 * has sixty. The bound is derived from the story — twice its stops plus a margin — so it stays
 * generous for a small component and sufficient for a token reference page, and a fixed 40 can no
 * longer quietly truncate the biggest stories.
 */
export const MAX_TABS = 40;

const boundFor = (stops: number): number => Math.max(MAX_TABS, stops * 2 + 10);

export interface Walk {
  /** Controls belonging to the story that Tab actually reached. */
  readonly reached: number;
  /** Controls the story renders that a person is entitled to reach. */
  readonly expected: number;
  /** Whether any reached control was painted differently while focused. */
  readonly visible: boolean;
  /** Accessible names of the controls Tab never landed on. */
  readonly missed: readonly string[];
}

/**
 * What Tab is expected to visit — Phase 8.9.
 *
 * Phase 8.7 stopped the walk after four landings, which proved the order was real but could not
 * notice a twelfth control falling out of it. Everything the browser puts in the tab order counts,
 * and nothing else does:
 *
 *   - `tabindex="-1"` is excluded, because a roving composite deliberately owns **one** Tab stop.
 *     A `DataGrid` with forty cells is one stop, not forty, and demanding otherwise would report a
 *     correct component as broken — the K3 mistake this suite has already made once.
 *   - disabled and `aria-disabled` controls are excluded: WCAG exempts inactive controls.
 *   - hidden controls are excluded: a person cannot reach what is not rendered.
 *   - radios are counted as one per group, because that is how the browser's roving works.
 */
const EXPECTED_STOPS = `() => {
  const root = document.querySelector('#storybook-root');
  if (root === null) return [];
  const candidates = [...root.querySelectorAll('a[href], button, input, select, textarea, [tabindex]')];
  const seenRadioGroups = new Set();
  return candidates.filter((el) => {
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') return false;
    if (el.getAttribute('tabindex') === '-1') return false;
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    if (el.type === 'radio') {
      const group = el.name || '(unnamed)';
      if (seenRadioGroups.has(group)) return false;
      seenRadioGroups.add(group);
    }
    return true;
  });
}`;

/** Describe a control well enough that a report names it rather than counting it. */
const NAME_OF = `(el) =>
  (el.getAttribute('aria-label') ??
    el.getAttribute('placeholder') ??
    el.textContent?.trim().slice(0, 30) ??
    '') + ' <' + el.tagName.toLowerCase() + '>'`;

/**
 * Walk Tab from the document body and report which of the story's own controls received focus.
 *
 * Scoped to `#storybook-root` and portals: focus landing on Storybook's toolbar or an addon panel
 * is not the component being reachable, and counting it would turn chrome into a passing grade.
 */
export async function tabThroughStory(page: Page): Promise<Walk> {
  await page.evaluate(() => {
    document.body.setAttribute('tabindex', '-1');
    document.body.focus();
    (window as unknown as { __kb: string[] }).__kb = [];
    /*
     * What a focus indicator *is*, reduced to a string that can be compared before and after.
     *
     * Only marks that are actually painted count. `outline-color` resolves from `currentColor`,
     * so a component that merely changes its text colour on focus reports a different outline
     * while painting no outline at all — which is how the first version of this walk passed a
     * story whose rings had been stripped away entirely.
     */
    (window as unknown as { __kbSignature: (el: Element) => string }).__kbSignature = (el) => {
      const style = getComputedStyle(el);
      const outlined =
        style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) > 0
          ? `outline:${style.outlineStyle}/${style.outlineWidth}/${style.outlineColor}`
          : '';
      const shadowed =
        style.boxShadow !== 'none' && style.boxShadow !== '' ? `shadow:${style.boxShadow}` : '';
      return `${outlined}|${shadowed}`;
    };
  });

  // Mark the stops a person is entitled to reach, before walking, so the walk can be compared with
  // them rather than with a number someone chose.
  const expected = await page.evaluate<string[]>(`(${EXPECTED_STOPS})().map((el, index) => {
    el.setAttribute('data-kb-expected', String(index));
    return (${NAME_OF})(el);
  })`);

  let reached = 0;
  for (let step = 0; step < boundFor(expected.length); step += 1) {
    await page.keyboard.press('Tab');
    const landed = await page.evaluate((index: number) => {
      const active = document.activeElement;
      if (active === null || active === document.body) return false;
      const root = document.querySelector('#storybook-root');
      const portal = active.closest('[data-radix-popper-content-wrapper], [role="dialog"]');
      if ((root === null || !root.contains(active)) && portal === null) return false;
      if (active.hasAttribute('data-kb-step')) return false; // wrapped around
      active.setAttribute('data-kb-step', String(index));
      (window as unknown as { __kb: string[] }).__kb.push(
        (window as unknown as { __kbSignature: (el: Element) => string }).__kbSignature(active),
      );
      return true;
    }, reached);
    if (landed) reached += 1;
    // Every expected stop has been visited; pressing on would only re-walk the same ring.
    if (reached >= expected.length) break;
  }

  const missed = await page.evaluate<string[]>(
    `[...document.querySelectorAll('[data-kb-expected]:not([data-kb-step])')].map((${NAME_OF}))`,
  );

  if (reached === 0) return { reached: 0, expected: expected.length, visible: false, missed };

  const visible = await page.evaluate(() => {
    // Park focus on the body first: every element visited is then at rest and comparable.
    (document.activeElement as HTMLElement | null)?.blur();
    document.body.focus();
    const focused = (window as unknown as { __kb: string[] }).__kb;
    const signature = (window as unknown as { __kbSignature: (el: Element) => string })
      .__kbSignature;
    return [...document.querySelectorAll('[data-kb-step]')].some((el) => {
      const wasFocused = focused[Number(el.getAttribute('data-kb-step'))] ?? '|';
      // Something has to be painted, and it has to be something the element does not paint at
      // rest. Either half alone passes a control that is never marked as focused.
      return wasFocused !== '|' && wasFocused !== signature(el);
    });
  });
  return { reached, expected: expected.length, visible, missed };
}

/** Read a control's state, so an activation can be shown to have changed something. */
export async function stateOf(page: Page, selector: string): Promise<string | null> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (el === null) return null;
    return [
      el.getAttribute('aria-checked'),
      el.getAttribute('aria-selected'),
      el.getAttribute('aria-expanded'),
      el.getAttribute('data-state'),
      (el as HTMLInputElement).checked === undefined
        ? null
        : String((el as HTMLInputElement).checked),
    ].join('|');
  }, selector);
}

/** Describe what currently holds focus, closely enough to tell "it moved" from "it did not". */
async function focusMark(page: Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.activeElement;
    if (el === null) return 'none';
    return [
      el.tagName,
      el.getAttribute('role'),
      el.getAttribute('aria-selected'),
      el.getAttribute('data-state'),
      el.getAttribute('aria-colindex'),
      el.getAttribute('aria-rowindex'),
      el.textContent?.trim().slice(0, 40),
    ].join('|');
  });
}

/**
 * Roving focus: a composite owns one Tab stop and moves within itself on the arrow keys.
 *
 * Tab is deliberately not asserted per tab or per cell. A `tablist` that put every tab in the tab
 * order would be *wrong*, so testing it that way manufactures a defect where the component is
 * correct — the mistake Phase 8.3 made three times against a product that was right each time.
 */
export async function arrowsMove(page: Page, container: string, key: string): Promise<boolean> {
  await page.evaluate(() => {
    document.body.setAttribute('tabindex', '-1');
    document.body.focus();
  });

  /*
   * Entered by Tab rather than by `focus()`. Guessing which descendant holds the roving tab stop
   * gets it wrong: focusing a `<td>` that is not focusable leaves focus on the body and reports a
   * component that works perfectly as broken — which is what the first run of this check did to
   * every `Calendar` story.
   */
  let entered = false;
  for (let step = 0; step < MAX_TABS && !entered; step += 1) {
    await page.keyboard.press('Tab');
    entered = await page.evaluate(
      (sel) => document.querySelector(sel)?.contains(document.activeElement) === true,
      container,
    );
  }
  if (!entered) return false;

  const before = await focusMark(page);
  await page.keyboard.press(key);
  await page.waitForTimeout(120);
  return (await focusMark(page)) !== before;
}

/**
 * A trigger owes: Enter opens, Escape closes, and focus comes back. Reported as three separate
 * answers so a component that opens but strands focus is not confused with one that never opened.
 */
export async function openAndDismiss(
  page: Page,
  trigger: string,
  surface: string,
): Promise<{ opened: boolean; closed: boolean; restored: boolean }> {
  /*
   * Polled rather than slept on. An overlay animates open and closed, and a fixed wait long enough
   * for the slowest machine is wasted on every other combination while still being too short on
   * one of them — a single `Calendar` combination out of eight reported Escape as ignored under a
   * 220ms wait and passed in the other seven, which is a stopwatch result rather than a defect.
   */
  const settle = async (wanted: boolean): Promise<boolean> => {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const there = await page.evaluate((sel) => document.querySelector(sel) !== null, surface);
      if (there === wanted) return true;
      await page.waitForTimeout(100);
    }
    return false;
  };

  await page.locator(trigger).first().focus();
  await page.keyboard.press('Enter');
  const opened = await settle(true);
  if (!opened) return { opened: false, closed: false, restored: false };

  await page.keyboard.press('Escape');
  const closed = await settle(false);
  const restored = await page.evaluate(
    (sel) => document.activeElement === document.querySelector(sel),
    trigger,
  );
  return { opened, closed, restored };
}

/** Open a story in one brand and scheme and wait for it to render. */
export async function openRendered(
  page: Page,
  origin: string,
  id: string,
  brand: string,
  scheme: string,
): Promise<void> {
  await page.goto(`${origin}/iframe.html?id=${id}&globals=brand:${brand};scheme:${scheme}`, {
    waitUntil: 'load',
    timeout: 30_000,
  });
  await page.waitForFunction(
    () => (document.querySelector('#storybook-root')?.children.length ?? 0) > 0,
    undefined,
    { timeout: 15_000 },
  );
  await page.waitForTimeout(120);
}

/**
 * Typing — Phase 8.9's `input` contract.
 *
 * The field is the one the classifier counted, tagged in the page rather than re-selected here, so
 * the contract cannot end up typing into something the classifier never considered.
 */
export async function typingEntersText(page: Page): Promise<boolean> {
  const marked = await page.evaluate<boolean>(`(${MARK_TYPABLE})()`);
  if (!marked) return true; // nothing typable: nothing owed
  const field = page.locator('[data-kb-typable]').first();
  const before = await field.inputValue();
  await field.focus();
  await page.keyboard.type('kb');
  const after = await field.inputValue();
  return after !== before && after.includes('kb');
}

/**
 * Links — Phase 8.9's `link` contract.
 *
 * A link owes an activation target, not a synthetic keypress: `href` is what makes Enter work, what
 * the browser exposes to assistive technology, and what lets a person open it in a new tab. Driving
 * Enter instead would navigate the story away and prove less.
 */
export async function linksHaveTargets(page: Page): Promise<readonly string[]> {
  return await page.evaluate<string[]>(
    `[...document.querySelectorAll('#storybook-root a')]
       .filter((el) => {
         const style = getComputedStyle(el);
         if (style.display === 'none' || style.visibility === 'hidden') return false;
         return el.getAttribute('href') === null && el.getAttribute('role') !== 'button';
       })
       .map((${NAME_OF}))`,
  );
}

/**
 * Radio groups — Phase 8.9's `radio` contract.
 *
 * One Tab stop, and the arrows move the selection within it. Reached by Tab rather than by
 * `focus()`, for the reason the whole harness exists: reachability is a keyboard question.
 */
export async function arrowsMoveSelection(page: Page): Promise<boolean> {
  const selector = '#storybook-root input[type=radio], #storybook-root [role=radio]';
  const read = async (): Promise<string> =>
    page.evaluate(
      (sel) =>
        [...document.querySelectorAll(sel)]
          .map((el) => el.getAttribute('aria-checked') ?? String((el as HTMLInputElement).checked))
          .join(','),
      selector,
    );

  await page.evaluate(() => {
    document.body.setAttribute('tabindex', '-1');
    document.body.focus();
  });
  let inGroup = false;
  for (let step = 0; step < MAX_TABS && !inGroup; step += 1) {
    await page.keyboard.press('Tab');
    inGroup = await page.evaluate(
      (sel) => [...document.querySelectorAll(sel)].includes(document.activeElement as Element),
      selector,
    );
  }
  if (!inGroup) return false;

  const before = await read();
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(150);
  return (await read()) !== before;
}
