import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type Brand, type Harness, type Scheme, startHarness, stopHarness } from './harness.js';
import {
  arrowsMove,
  arrowsMoveSelection,
  linksHaveTargets,
  MAX_TABS,
  openAndDismiss,
  openRendered,
  stateOf,
  tabThroughStory,
  typingEntersText,
} from './keyboard.js';
import {
  CONTRACT,
  DETECT_KINDS,
  GRID_WITH_CELLS,
  type Kind,
  readIndex,
  type Story,
  TABLIST_WITH_TABS,
} from './stories.js';

/**
 * Keyboard behaviour across the whole discovered matrix — Phase 8.7.
 *
 * Phase 8.4 asserted two keyboard interactions on two stories it chose by hand. This derives each
 * story's contract from what it actually renders and holds every story to it, over the same
 * automatic inventory Phase 8.5 established — so a component added tomorrow is covered without
 * anyone remembering to add it.
 *
 * The instrument itself lives in `keyboard.ts` and is proved in `keyboard-proof.a11y.spec.ts`.
 */

const ROOT = join(process.cwd(), 'storybook-static');
const BRANDS: readonly Brand[] = ['docs', 'group', 'school', 'work'];
const SCHEMES: readonly Scheme[] = ['light', 'dark'];
const WORKERS = 6;

interface Outcome {
  readonly story: Story;
  readonly brand: Brand;
  readonly scheme: Scheme;
  readonly kinds: readonly Kind[];
  /** `K1`…`K9` with a sentence, or empty when the story met its contract. */
  readonly failures: readonly string[];
  readonly error?: string;
}

let harness: Harness | null = null;
let outcomes: Outcome[] = [];
let discovered: { total: number; eligible: Story[] } = { total: 0, eligible: [] };

beforeAll(async () => {
  discovered = readIndex(ROOT);
  harness = await startHarness(ROOT);

  const queue: { story: Story; brand: Brand; scheme: Scheme }[] = [];
  for (const story of discovered.eligible) {
    for (const brand of BRANDS) for (const scheme of SCHEMES) queue.push({ story, brand, scheme });
  }

  const collected: Outcome[] = [];
  const worker = async (): Promise<void> => {
    const context = await harness!.browser.newContext({ viewport: { width: 1280, height: 900 } });
    for (;;) {
      const job = queue.shift();
      if (job === undefined) break;
      const page = await context.newPage();
      const failures: string[] = [];
      let kinds: Kind[] = [];
      try {
        await openRendered(page, harness!.origin, job.story.id, job.brand, job.scheme);

        // Invoked, not merely evaluated: a bare function source is an expression whose value is a
        // function, which does not serialise and arrives as `undefined`.
        kinds = (await page.evaluate(`(${DETECT_KINDS})()`)) ?? [];
        if (kinds.length === 0) kinds = ['static'];

        if (!kinds.includes('static')) {
          const { reached, expected, visible, missed } = await tabThroughStory(page);
          if (reached === 0) {
            failures.push(
              `K1 no control in the story received focus after ${String(MAX_TABS)}+ Tab presses`,
            );
          } else {
            if (!visible) {
              failures.push('K6 focus reached a control but its painted appearance did not change');
            }
            // Phase 8.9: every stop, not the first four. A story whose twelfth control has fallen
            // out of the tab order used to pass this suite in silence.
            if (missed.length > 0) {
              failures.push(
                `K1 Tab reached ${String(reached)} of ${String(expected)} controls; never reached: ${missed.join(' · ')}`,
              );
            }
          }

          // Activation, where the story renders a control whose state a keypress should change.
          if (kinds.includes('switch') || kinds.includes('checkbox')) {
            const sel = kinds.includes('switch')
              ? '[role="switch"]'
              : 'input[type="checkbox"], [role="checkbox"]';
            const before = await stateOf(page, sel);
            await page.locator(sel).first().focus();
            await page.keyboard.press('Space');
            await page.waitForTimeout(120);
            const after = await stateOf(page, sel);
            if (before !== null && before === after) {
              failures.push(`K2 Space did not change the control's state (${String(before)})`);
            }
          }

          // Typing, where the story renders a field a person can type into.
          if (kinds.includes('input') && !(await typingEntersText(page))) {
            failures.push('K8 typing into the field did not enter text');
          }

          // Links owe an activation target; without one Enter does nothing and the browser offers
          // no way to open it anywhere.
          if (kinds.includes('link')) {
            const orphans = await linksHaveTargets(page);
            if (orphans.length > 0) {
              failures.push(`K9 link with no activation target: ${orphans.join(' · ')}`);
            }
          }

          // A radio group is one Tab stop whose arrows move the selection.
          if (kinds.includes('radio') && !(await arrowsMoveSelection(page))) {
            failures.push('K3 ArrowDown did not move the selection within the radio group');
          }

          // Roving focus, where the story renders a composite that owns one Tab stop.
          if (
            kinds.includes('tabs') &&
            !(await arrowsMove(page, TABLIST_WITH_TABS, 'ArrowRight'))
          ) {
            failures.push('K3 ArrowRight did not move focus within the tablist');
          }
          if (kinds.includes('grid') && !(await arrowsMove(page, GRID_WITH_CELLS, 'ArrowDown'))) {
            failures.push('K3 ArrowDown did not move focus within the grid');
          }

          // Overlays, where the story renders a trigger that owes open, dismiss and return.
          for (const [kind, trigger, surface] of [
            ['menu', '[aria-haspopup="menu"]', '[role="menu"]'],
            ['dialog', '[aria-haspopup="dialog"]', '[role="dialog"]'],
            /*
             * Phase 8.9. Measured rather than assumed: the platform has two comboboxes and they
             * open differently — the `Popover`-backed one opens on Enter, the `Autocomplete`-backed
             * one is already open once focused — but both dismiss on Escape and both put focus back
             * where it started. `openAndDismiss` tolerates an already-open surface, so one contract
             * covers both without either being asked to behave like the other.
             */
            ['combobox', '[role="combobox"]', '[role="listbox"]'],
          ] as const) {
            if (!kinds.includes(kind)) continue;
            const { opened, closed, restored } = await openAndDismiss(page, trigger, surface);
            if (!opened) failures.push(`K4 Enter did not open the ${kind}`);
            else if (!closed) failures.push(`K5 Escape did not close the ${kind}`);
            else if (!restored) failures.push(`K7 focus did not return to the ${kind} trigger`);
          }
        }
        collected.push({ ...job, kinds, failures });
      } catch (error) {
        collected.push({
          ...job,
          kinds: kinds.length > 0 ? kinds : ['static'],
          failures: [],
          error: error instanceof Error ? error.message.slice(0, 160) : String(error),
        });
      }
      await page.close();
    }
    await context.close();
  };

  await Promise.all(Array.from({ length: WORKERS }, worker));
  outcomes = collected;
}, 2_400_000);

afterAll(async () => {
  await stopHarness(harness);
});

describe('keyboard across the matrix', () => {
  it('classified every combination and rendered them all', () => {
    const expected = discovered.eligible.length * BRANDS.length * SCHEMES.length;
    expect(outcomes.length, 'the keyboard matrix did not run to completion').toBe(expected);
    expect(
      outcomes.filter((o) => o.error !== undefined).map((o) => `${o.story.id}: ${o.error}`),
      'stories that could not be driven — a failure to render is a failure, not a skip',
    ).toStrictEqual([]);
  });

  it('reports the keyboard coverage summary', () => {
    const interactive = outcomes.filter((o) => !o.kinds.includes('static'));
    const byKind: Record<string, number> = {};
    for (const o of outcomes) for (const k of o.kinds) byKind[k] = (byKind[k] ?? 0) + 1;
    const summary = {
      stories: discovered.eligible.length,
      brands: BRANDS.length,
      schemes: SCHEMES.length,
      combinations: outcomes.length,
      interactive: interactive.length,
      static: outcomes.length - interactive.length,
      failed: outcomes.filter((o) => o.failures.length > 0).length,
      byKind,
      contracts: CONTRACT,
    };
    // eslint-disable-next-line no-console -- the classification matrix the phase asks to publish.
    console.log('[keyboard coverage]', JSON.stringify(summary, null, 1));
    expect(summary.combinations).toBeGreaterThan(0);
  });

  it('meets the keyboard contract for every interactive story', () => {
    const failing = outcomes
      .filter((o) => o.failures.length > 0)
      .map(
        (o) =>
          `${o.story.id} · ${o.brand} · ${o.scheme} · [${o.kinds.join(',')}] → ${o.failures.join(' | ')}`,
      );
    // eslint-disable-next-line no-console -- the failure inventory, classified K1…K9.
    if (failing.length > 0) console.log('[keyboard failures]', JSON.stringify(failing, null, 1));
    expect(failing).toStrictEqual([]);
  });
});
