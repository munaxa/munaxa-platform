import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Page } from 'playwright';

import { type Harness, startHarness, stopHarness } from './harness.js';
import {
  arrowsMoveSelection,
  linksHaveTargets,
  openRendered,
  stateOf,
  tabThroughStory,
  typingEntersText,
} from './keyboard.js';
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
/** A theme page: thirty-five Tab stops, far past anything a four-landing cap could see. */
const MANY_STOPS = 'foundations-themes--munaxa-docs';
/** A form of text fields. */
const TYPING = 'forms-overview--states';
/** Links with real destinations. */
const LINKS = 'shell-menus--top-bar-menus';
/** The only story with a radio group. */
const RADIO = 'forms-overview--toggles';

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

  it('proof E — the walk visits every stop, and notices one falling out of the order', async () => {
    // Phase 8.9. The Phase 8.7 walk stopped after four landings, so a story whose later controls
    // left the tab order passed in silence. A large story is used deliberately: four is not enough
    // to notice anything here.
    await open(MANY_STOPS);
    const before = await tabThroughStory(page);
    expect(before.expected, 'this proof needs a story with many stops').toBeGreaterThan(8);
    expect(before.missed, 'every control must be reachable to begin with').toStrictEqual([]);
    expect(before.reached).toBe(before.expected);

    await open(MANY_STOPS);
    /*
     * Take one control — not the first — out of the tab order and leave everything else alone.
     *
     * The victim has to be a control the walk was actually entitled to reach. The first version of
     * this proof picked the seventh button on the page and landed on a *disabled* one, which was
     * already excluded from the expected stops: nothing changed, the walk still reached 35 of 35,
     * and the proof reported a working instrument as broken. The filter below is the one
     * `EXPECTED_STOPS` uses.
     */
    const removed = await page.evaluate(() => {
      const stops = [
        ...document.querySelectorAll<HTMLElement>(
          '#storybook-root a[href], #storybook-root button, #storybook-root input, #storybook-root select',
        ),
      ].filter(
        (el) =>
          !(el as HTMLButtonElement).disabled &&
          el.getAttribute('aria-disabled') !== 'true' &&
          el.getAttribute('tabindex') !== '-1' &&
          getComputedStyle(el).display !== 'none' &&
          getComputedStyle(el).visibility !== 'hidden',
      );
      const victim = stops[6] ?? stops.at(-1);
      if (victim === undefined) return null;
      victim.setAttribute('tabindex', '-1');
      return victim.textContent?.trim().slice(0, 30) ?? '(unnamed)';
    });
    expect(removed, 'the proof needs a reachable control to remove').not.toBe(null);

    const after = await tabThroughStory(page);
    expect(
      after.expected,
      'the removed control must leave the set of stops a person is entitled to reach',
    ).toBe(before.expected - 1);
    expect(
      after.reached,
      'removing a control must reduce what the walk reaches — a four-landing cap would not see this',
    ).toBe(before.reached - 1);
  }, 240_000);

  it('proof F — typing is reported from the field, and lost when the field refuses input', async () => {
    await open(TYPING);
    expect(await typingEntersText(page), 'the field must accept text to begin with').toBe(true);

    await open(TYPING);
    // Read-only rather than disabled: the field stays focusable and looks identical, so the proof
    // is about text arriving rather than about the control disappearing.
    await page.evaluate(() => {
      for (const el of document.querySelectorAll(
        '#storybook-root input, #storybook-root textarea',
      )) {
        (el as HTMLInputElement).readOnly = true;
      }
    });
    // The classifier no longer counts a read-only field, so the contract is asked directly.
    const field = page.locator('#storybook-root input, #storybook-root textarea').first();
    const before = await field.inputValue();
    await field.focus();
    await page.keyboard.type('kb');
    expect(await field.inputValue(), 'K8 must fire when typing changes nothing').toBe(before);
  }, 240_000);

  it('proof G — a link without an activation target is reported', async () => {
    await open(LINKS);
    expect(
      await linksHaveTargets(page),
      'the story must start with every link targeted',
    ).toStrictEqual([]);

    await open(LINKS);
    await page.evaluate(() => {
      document.querySelector('#storybook-root a')?.removeAttribute('href');
    });
    expect(
      (await linksHaveTargets(page)).length,
      'K9 must fire for a link the browser cannot activate',
    ).toBe(1);
  }, 240_000);

  it('proof H — radio selection is reported from the arrow key, and lost when it is swallowed', async () => {
    await open(RADIO);
    expect(await arrowsMoveSelection(page), 'arrows must move the selection to begin with').toBe(
      true,
    );

    await open(RADIO);
    await page.evaluate(() => {
      document.addEventListener(
        'keydown',
        (event) => {
          if (event.key.startsWith('Arrow')) event.preventDefault();
        },
        true,
      );
    });
    expect(
      await arrowsMoveSelection(page),
      'K3 must fire when the arrow key changes no selection',
    ).toBe(false);
  }, 240_000);
});
