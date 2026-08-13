import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Page } from 'playwright';

import { type Harness, startHarness, stopHarness } from './harness.js';
import { openRendered, stateOf, tabThroughStory } from './keyboard.js';
import { DETECT_KINDS, type Kind, readIndex } from './stories.js';

/**
 * Proofs that the Phase 8.7 keyboard instrument can fail — Phase 8.7.
 *
 * Phase 8.5 produced 305 spurious failures from an instrument that looked correct, and Phase 8.4's
 * axe scope read a 2.79:1 violation as clean. Silence from a measurement only means something once
 * the measurement has been shown to break when the thing it measures breaks, so each proof below
 * damages a rendered story in one specific way and requires the instrument to notice.
 */

const ROOT = join(process.cwd(), 'storybook-static');

/** A story with switches, checkboxes, radios and a button — the richest keyboard surface. */
const TOGGLES = 'forms-overview--toggles';
/** Buttons only: reachable, activatable, nothing else to confuse a proof. */
const BUTTONS = 'primitives-button--variants';
/** Badges: text and colour, no focusable control anywhere. */
const STATIC = 'primitives-badge--tones';

let harness: Harness | null = null;
let page: Page;

beforeAll(async () => {
  harness = await startHarness(ROOT);
  page = await harness.browser.newPage({ viewport: { width: 1280, height: 900 } });
}, 180_000);

afterAll(async () => {
  await stopHarness(harness);
});

async function open(id: string, scheme: 'light' | 'dark' = 'light'): Promise<void> {
  await openRendered(page, harness!.origin, id, 'docs', scheme);
}

async function kindsOf(): Promise<Kind[]> {
  return (await page.evaluate(`(${DETECT_KINDS})()`)) ?? [];
}

describe('the keyboard instrument can fail', () => {
  it('proof A — reachability is reported from Tab, and lost when Tab cannot reach', async () => {
    await open(BUTTONS);
    const before = await tabThroughStory(page);
    expect(before.reached, 'the control story must be reachable to begin with').toBeGreaterThan(0);

    await open(BUTTONS);
    // Take every control out of the tab order. The elements remain, are still focusable
    // programmatically, and still look identical — only the keyboard path is gone.
    await page.evaluate(() => {
      for (const el of document.querySelectorAll('#storybook-root button, #storybook-root a')) {
        el.setAttribute('tabindex', '-1');
      }
    });
    const after = await tabThroughStory(page);
    expect(after.reached, 'K1 must fire when nothing can be tabbed to').toBe(0);

    // …and the elements really were still focusable, so the proof is about reachability rather
    // than about having destroyed the story.
    const focusable = await page.evaluate(() => {
      const el = document.querySelector<HTMLElement>('#storybook-root button');
      el?.focus();
      return document.activeElement === el;
    });
    expect(focusable, 'element.focus() still works — which is exactly why it is not the test').toBe(
      true,
    );
  }, 180_000);

  it('proof B — activation is reported from the keypress, and lost when the key is swallowed', async () => {
    await open(TOGGLES);
    const sel = '[role="switch"], input[type="checkbox"]';
    const before = await stateOf(page, sel);
    await page.locator(sel).first().focus();
    await page.keyboard.press('Space');
    await page.waitForTimeout(120);
    expect(await stateOf(page, sel), 'Space must toggle the control to begin with').not.toBe(
      before,
    );

    await open(TOGGLES);
    await page.evaluate(() => {
      document.addEventListener(
        'keydown',
        (event) => {
          if (event.key === ' ') event.preventDefault();
        },
        true,
      );
    });
    const swallowed = await stateOf(page, sel);
    await page.locator(sel).first().focus();
    await page.keyboard.press('Space');
    await page.waitForTimeout(120);
    expect(await stateOf(page, sel), 'K2 must fire when Space changes nothing').toBe(swallowed);
  }, 180_000);

  it('proof C — focus visibility is reported from the paint, and lost when the ring is removed', async () => {
    for (const scheme of ['light', 'dark'] as const) {
      await open(BUTTONS, scheme);
      expect(
        (await tabThroughStory(page)).visible,
        `the focus ring must be visible in ${scheme} to begin with`,
      ).toBe(true);

      await open(BUTTONS, scheme);
      await page.addStyleTag({
        content:
          '*, *::before, *::after { outline: none !important; box-shadow: none !important; }',
      });
      const stripped = await tabThroughStory(page);
      expect(
        stripped.reached,
        'the controls are still reachable with the ring removed',
      ).toBeGreaterThan(0);
      expect(stripped.visible, `K6 must fire when nothing is painted on focus in ${scheme}`).toBe(
        false,
      );
    }
  }, 240_000);

  it('proof D — classification comes from the DOM, and covers the discovered inventory', async () => {
    await open(TOGGLES);
    const interactive = await kindsOf();
    expect(interactive, 'a story of toggles must classify as toggles').toEqual(
      expect.arrayContaining<Kind>(['switch', 'checkbox']),
    );

    await open(STATIC);
    expect(await kindsOf(), 'a story with no control must classify as nothing to drive').toEqual(
      [],
    );

    // Classification must not depend on the story's title: the same DOM under a different id is
    // still the same contract, which is what makes the matrix survive a rename.
    await open(BUTTONS);
    expect(await kindsOf()).toContain<Kind>('button');

    // A story whose controls are all disabled owes nothing: WCAG exempts inactive controls and a
    // correct disabled button is out of the tab order, so counting one would manufacture a K1.
    await open('primitives-button--disabled');
    expect(
      await kindsOf(),
      'disabled controls carry no keyboard contract and must not be classified as one',
    ).toEqual([]);

    const discovered = readIndex(ROOT);
    expect(
      discovered.eligible.length,
      'the proofs run against the same inventory the matrix does',
    ).toBe(discovered.total);
  }, 180_000);
});
