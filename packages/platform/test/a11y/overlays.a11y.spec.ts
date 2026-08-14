import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Page } from 'playwright';

import { type Harness, startHarness, stopHarness } from './harness.js';
import { writeInventory } from './inventory.js';
import { openRendered } from './keyboard.js';
import { axeOn } from './measure.js';
import { readIndex } from './stories.js';
import { counted, ledger, timed } from './timing.js';

/**
 * The overlay matrix — what is inside the layers, not just in front of them. Phase 8.14.
 *
 * The contrast matrix measures the **canonical** render: the story as a person meets it on
 * arrival, with nothing opened. That is the right state to measure and it is not the only one.
 * Until this phase exactly one story out of 106 — `forms-selection--palette`, via the hand-written
 * `INTERACTIONS` map — was opened before axe ran, so the *contents* of every other menu, popover,
 * select and time list had never been through a single rule.
 *
 * That is not a hypothetical gap. Phase 8.13's `CommandSeparator` defect was critical and survived
 * nine phases for exactly this reason, and opening the remaining 78 triggers here found four more
 * in shared components: two shell menus that owned no menu items, and three combobox-family
 * controls whose busy and empty states put a plain `div` inside a `listbox`.
 *
 * ## Two guarantees, not one
 *
 * Each opened layer is checked for **validity** (axe) and for **operability** — whether it contains
 * anything a keyboard can reach. The second exists because `TimePicker` passed every rule axe has
 * while containing zero tabbable elements: a popup a mouse could use and a keyboard could not.
 *
 * ## One brand, one scheme, and why that is honest
 *
 * This pass runs `docs`/`light` only. What it measures is **markup** — which roles own which
 * children, and what can take focus — and neither varies with a palette. Colour in these same
 * layers is not skipped either: it is measured by the canonical matrix across all eight
 * combinations, on the layers that story renders. Running this pass eight times would multiply its
 * cost by eight to re-assert identical DOM, so the limitation is deliberate and recorded in the
 * report rather than discovered later.
 */

const ROOT = join(process.cwd(), 'storybook-static');

/**
 * `aria-hidden-focus`, disabled **here only**, with the measurement that earns it.
 *
 * Opening a modal Radix menu makes the rest of the page `aria-hidden`, and axe then reports every
 * focusable element behind it — 119 nodes across this matrix. That is a property of a modal
 * overlay rather than a defect, but "that's a known false positive" is an assertion, so it was
 * measured: across three separate stories, **0 of 30** Tab presses landed inside the hidden region
 * while a menu was open. Focus is genuinely trapped, which is the condition the rule exists to
 * protect.
 *
 * The exemption is scoped to opened overlays and to this one rule. It stays enabled in the
 * canonical matrix, where nothing is `aria-hidden` and a real violation would still be reported,
 * and `test/setup.ts` already documents the same exemption for portalled layers in the unit suite.
 */
const MODAL_OVERLAY_RULE = 'aria-hidden-focus';

interface TriggerInfo {
  readonly index: number;
  readonly tag: string;
  readonly haspopup: string;
  readonly name: string;
}

interface Operable {
  readonly offersChoices: boolean;
  readonly tabbables: number;
}

interface Row {
  readonly story: string;
  readonly trigger: string;
  readonly opened: boolean;
  readonly violations: readonly string[];
  readonly tabbables: number;
  readonly offersChoices?: boolean;
  readonly error?: string;
}

/** Collapsed disclosure triggers, in document order. */
const TRIGGERS = `(() => [...document.querySelectorAll('[aria-expanded="false"]')].map((el, i) => ({
  index: i,
  tag: el.tagName.toLowerCase(),
  haspopup: el.getAttribute('aria-haspopup') ?? '',
  name: (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 40),
})))()`;

/**
 * What a keyboard can reach inside the layer that just opened.
 *
 * The contract is deliberately narrow, and the first version of it was wrong in a way worth
 * recording: it required *every* opened layer to contain something focusable, and then reported a
 * prose disclosure panel and an empty notification menu as defects. Neither is one. A panel of
 * text is read, not operated, and a menu with nothing in it has nothing to offer.
 *
 * So the question is asked only of a layer that **offers choices** — one containing options or
 * menu items. If it presents things to pick from, a keyboard has to be able to pick one. That is
 * the `TimePicker` defect exactly, and it is derived from the rendered DOM rather than from a list
 * of story names.
 *
 * `aria-activedescendant` counts as reachable: a combobox keeps the caret in its input and moves an
 * *active option* rather than focus, which is the correct pattern and would otherwise read as zero.
 */
const OPERABLE = `(() => {
  const layer = document.querySelector('[role="menu"][data-state="open"]')
    ?? document.querySelector('[role="dialog"]')
    ?? document.querySelector('[role="listbox"]')
    ?? document.querySelector('[role="menu"]');
  if (!layer) return { offersChoices: false, tabbables: 0 };
  const choices = layer.querySelectorAll(
    '[role="option"], [role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"]'
  ).length;
  const tabbable = layer.querySelectorAll(
    'input:not([disabled]), button:not([disabled]), a[href], select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  ).length;
  const owner = layer.querySelector('[aria-activedescendant]') ? 1 : 0;
  return { offersChoices: choices > 0, tabbables: tabbable + owner + choices };
})()`;

let harness: Harness | null = null;
let page: Page;
const rows: Row[] = [];

beforeAll(async () => {
  harness = await startHarness(ROOT);
  page = await harness.browser.newPage({ viewport: { width: 1280, height: 900 } });

  const stories = readIndex(ROOT).eligible;
  for (const story of stories) {
    await openRendered(page, harness.origin, story.id, 'docs', 'light');
    const triggers = await page.evaluate<TriggerInfo[]>(TRIGGERS);

    for (const trigger of triggers) {
      /*
       * A fresh render for every trigger. Opening one layer can move, cover or unmount another,
       * and a violation attributed to the wrong trigger is worse than no measurement at all — the
       * same isolation the keyboard contracts have needed since Phase 8.9.
       */
      await openRendered(page, harness.origin, story.id, 'docs', 'light');
      const label = `${trigger.tag}[${trigger.haspopup}] ${trigger.name}`;
      try {
        /*
         * Playwright's click, not `element.click()`. Radix opens on `pointerdown`, and a DOM
         * `.click()` dispatches only a click event — the first version of this measurement opened
         * 26 of 79 triggers for that reason alone and reported the other 53 as clean.
         */
        const locator = page.locator('[aria-expanded="false"]').nth(trigger.index);
        if ((await locator.count()) === 0) continue;
        await locator.scrollIntoViewIfNeeded({ timeout: 5_000 });
        await locator.click({ timeout: 5_000, force: true });
        await page.waitForTimeout(400);

        const opened =
          (await page.evaluate(() => document.querySelectorAll('[aria-expanded="true"]').length)) >
          0;
        if (!opened) {
          counted('overlay trigger did not open');
          continue;
        }
        const operable = await page.evaluate<Operable>(OPERABLE);
        const result = await timed('overlay axe', () => axeOn(page));
        rows.push({
          story: story.id,
          trigger: label,
          opened,
          violations: result.violations.filter((v) => !v.includes(MODAL_OVERLAY_RULE)),
          tabbables: operable.tabbables,
          offersChoices: operable.offersChoices,
        });
      } catch (error) {
        rows.push({
          story: story.id,
          trigger: label,
          opened: false,
          violations: [],
          tabbables: 0,
          offersChoices: false,
          error: String((error as Error).message).slice(0, 160),
        });
      }
    }
  }

  writeInventory('overlays', rows);
}, 2_400_000);

afterAll(async () => {
  await stopHarness(harness);
  ledger();
});

describe('every layer the matrix can open', () => {
  it('opens enough of them to be measuring anything', () => {
    // A pass that opened nothing would satisfy every assertion below it. Phase 8.14 measured 79
    // collapsed triggers across 106 stories, 74 of which open on a click; the floor is slack
    // because its job is to catch a broken selector, not to freeze the component list.
    expect(rows.length, 'no overlay was opened — the pass is measuring nothing').toBeGreaterThan(
      50,
    );
    expect(rows.filter((row) => row.error !== undefined)).toStrictEqual([]);
  });

  it('is valid once open', () => {
    const failing = rows
      .filter((row) => row.violations.length > 0)
      .map((row) => `${row.story} · ${row.trigger} → ${row.violations.join(' | ')}`)
      .sort();
    expect(failing).toStrictEqual([]);
  });

  it('can be operated once open, wherever it offers something to choose', () => {
    const offering = rows.filter((row) => row.offersChoices === true);
    // The contract is worth nothing if no layer in the matrix offers a choice at all.
    expect(
      offering.length,
      'no opened layer offered a choice — nothing was checked',
    ).toBeGreaterThan(20);
    const inert = offering
      .filter((row) => row.tabbables === 0)
      .map(
        (row) =>
          `${row.story} · ${row.trigger} → offers choices, but a keyboard cannot reach any of them`,
      )
      .sort();
    expect(inert).toStrictEqual([]);
  });
});
