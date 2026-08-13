import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type Brand, type Harness, type Scheme, startHarness, stopHarness } from './harness.js';
import { byCombination, writeInventory } from './inventory.js';
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
import { axeOn } from './measure.js';
import {
  CONTRACT,
  DETECT_KINDS,
  EXCLUDED,
  GRID_WITH_CELLS,
  INTERACTIONS,
  type Kind,
  MINIMUM_STORIES,
  readIndex,
  type Story,
  TABLIST_WITH_TABS,
} from './stories.js';
import { counted, ledger, timed } from './timing.js';

/**
 * The accessibility matrix — one canonical render, two independent guarantees. Phase 8.11.
 *
 * Phases 8.5–8.10 built two matrices that each rendered the same 800 story × brand × scheme
 * combinations: one to measure colour contrast with axe, one to drive the keyboard contracts. The
 * Phase 8.10 ledger measured the duplication at roughly 1 040 worker-seconds — the largest single
 * cost in the suite, and pure waste, because a render is a render.
 *
 * They share one now. The order is the whole safety argument:
 *
 *   1. **Render the canonical state.** The right story, brand and scheme, settled, with nothing
 *      typed, selected, opened or focused.
 *   2. **Contrast first, because it only reads.** axe inspects; it does not press keys. The state
 *      it measures is therefore the state a person meets on arrival.
 *   3. **Keyboard second, because it mutates.** Typing filters a `DataGrid`, arrows move a
 *      selection, Enter opens a menu. Running it before contrast would have contrast measure a
 *      story nobody navigated to.
 *
 * The reverse order is the trap this design exists to avoid, and `keyboard-proof.a11y.spec.ts`
 * contains a proof that would fail if the two were ever swapped.
 *
 * Two details keep the shared render honest:
 *
 *   - The canonical settle is **150ms**, the longer of the two the separate matrices used, so
 *     neither guarantee gets less stabilisation than it had.
 *   - A story with a declared `INTERACTIONS` step is *deliberately* mutated before axe — the
 *     command palette has to be open to be measured. Those stories re-render before the keyboard
 *     contracts, so the keyboard side still starts from the canonical state rather than from a page
 *     with an overlay open.
 *
 * The two inventories stay separate: a contrast failure never prevents keyboard results from being
 * collected, and neither is folded into the other's total. They are two accessibility guarantees
 * that happen to share a browser tab, not one merged number.
 */

const ROOT = join(process.cwd(), 'storybook-static');
const BRANDS: readonly Brand[] = ['docs', 'group', 'school', 'work'];
const SCHEMES: readonly Scheme[] = ['light', 'dark'];
const WORKERS = 6;

interface Contrast {
  readonly story: Story;
  readonly brand: Brand;
  readonly scheme: Scheme;
  readonly violations: readonly string[];
  readonly interacted: boolean;
  readonly error?: string;
}

interface Keyboard {
  readonly story: Story;
  readonly brand: Brand;
  readonly scheme: Scheme;
  readonly kinds: readonly Kind[];
  /** `K1`…`K9` with a sentence, or empty when the story met its contract. */
  readonly failures: readonly string[];
  readonly error?: string;
}

let harness: Harness | null = null;
let contrastResults: Contrast[] = [];
let keyboardResults: Keyboard[] = [];
/** Kinds that classification saw but a repeat render did not — reported, never hidden. */
const reclassified: string[] = [];
let discovered: { total: number; eligible: Story[] } = { total: 0, eligible: [] };
let elapsedMs = 0;

beforeAll(async () => {
  const started = Date.now();
  discovered = readIndex(ROOT);
  harness = await timed('harness startup (server + browser)', () => startHarness(ROOT));

  const queue: { story: Story; brand: Brand; scheme: Scheme }[] = [];
  for (const story of discovered.eligible) {
    for (const brand of BRANDS) for (const scheme of SCHEMES) queue.push({ story, brand, scheme });
  }

  const contrast: Contrast[] = [];
  const keyboard: Keyboard[] = [];

  const worker = async (): Promise<void> => {
    const context = await timed('browser context', () =>
      harness!.browser.newContext({ viewport: { width: 1280, height: 900 } }),
    );
    /*
     * One page per worker — Phase 8.10. Every combination begins with a full navigation, which
     * replaces the document, so a reused page carries nothing across. A page is replaced only when
     * a combination throws, where its state is genuinely unknown.
     */
    let page = await timed('new page', () => context.newPage());
    const replacePage = async (): Promise<void> => {
      await page.close();
      page = await timed('new page', () => context.newPage());
    };

    for (;;) {
      const job = queue.shift();
      if (job === undefined) break;

      const canonical = async (label: string): Promise<void> => {
        await timed(label, () =>
          openRendered(page, harness!.origin, job.story.id, job.brand, job.scheme),
        );
      };

      // ---- the shared canonical render -------------------------------------------------------
      let rendered = true;
      try {
        await canonical('story render (canonical, shared)');
      } catch (error) {
        rendered = false;
        const message = error instanceof Error ? error.message.slice(0, 160) : String(error);
        contrast.push({ ...job, violations: [], interacted: false, error: message });
        keyboard.push({ ...job, kinds: ['static'], failures: [], error: message });
        await replacePage();
      }
      if (!rendered) continue;

      // ---- contrast, which only reads --------------------------------------------------------
      let interacted = false;
      try {
        for (const step of INTERACTIONS.get(job.story.id) ?? []) {
          if (step.clickByName !== undefined) {
            await page.getByRole('button', { name: step.clickByName }).first().click();
          }
          if (step.waitFor !== undefined) {
            await page.waitForSelector(step.waitFor, { state: 'visible', timeout: 10_000 });
          }
          interacted = true;
        }
        const outcome = await timed('axe', () => axeOn(page));
        contrast.push({ ...job, violations: outcome.violations, interacted });
      } catch (error) {
        contrast.push({
          ...job,
          violations: [],
          interacted,
          error: error instanceof Error ? error.message.slice(0, 160) : String(error),
        });
        // The contrast half failed; the keyboard half is a separate guarantee and still gets its
        // own render below, so one failing does not silence the other.
        await replacePage();
      }
      counted('combination');

      // ---- keyboard, which mutates -----------------------------------------------------------
      const failures: string[] = [];
      let kinds: Kind[] = [];

      const reload = async (): Promise<void> => {
        await canonical('story render (reload for a contract)');
      };

      const stillRenders = async (kind: Kind): Promise<boolean> => {
        const now =
          (await timed('re-detect kinds after reload', () =>
            page.evaluate<Kind[]>(`(${DETECT_KINDS})()`),
          )) ?? [];
        if (now.includes(kind)) return true;
        reclassified.push(`${job.story.id} · ${job.brand} · ${job.scheme}: ${kind}`);
        return false;
      };

      try {
        /*
         * A story that was interacted with for contrast, or whose contrast attempt threw, is no
         * longer showing the canonical state — so the keyboard side renders it again. Everything
         * else inherits the render axe just read, which is exactly the saving this phase is for.
         */
        if (interacted || contrast.at(-1)?.error !== undefined) {
          await canonical('story render (keyboard needs canonical again)');
        }

        kinds = (await timed('classify', () => page.evaluate(`(${DETECT_KINDS})()`))) ?? [];
        if (kinds.length === 0) kinds = ['static'];

        if (!kinds.includes('static')) {
          const { reached, expected, visible, missed } = await timed('tab walk', () =>
            tabThroughStory(page),
          );
          if (reached === 0) {
            failures.push(
              `K1 no control in the story received focus after ${String(MAX_TABS)}+ Tab presses`,
            );
          } else {
            if (!visible) {
              failures.push('K6 focus reached a control but its painted appearance did not change');
            }
            if (missed.length > 0) {
              failures.push(
                `K1 Tab reached ${String(reached)} of ${String(expected)} controls; never reached: ${missed.join(' · ')}`,
              );
            }
          }

          // Links read and change nothing, so they run on the render the walk just used.
          if (kinds.includes('link')) {
            const orphans = await timed('link targets', () => linksHaveTargets(page));
            if (orphans.length > 0) {
              failures.push(`K9 link with no activation target: ${orphans.join(' · ')}`);
            }
          }

          // Everything below changes the story, so each gets its own render — Phase 8.9.
          if (kinds.includes('switch') || kinds.includes('checkbox')) {
            await reload();
            const sel = kinds.includes('switch')
              ? '[role="switch"]'
              : 'input[type="checkbox"], [role="checkbox"]';
            const { before, after } = await timed('activation (Space)', async () => {
              const first = await stateOf(page, sel);
              await page.locator(sel).first().focus();
              await page.keyboard.press('Space');
              await page.waitForTimeout(120);
              return { before: first, after: await stateOf(page, sel) };
            });
            if (before !== null && before === after) {
              failures.push(`K2 Space did not change the control's state (${String(before)})`);
            }
          }

          if (kinds.includes('input')) {
            await reload();
            if (
              (await stillRenders('input')) &&
              !(await timed('typing', () => typingEntersText(page)))
            ) {
              failures.push('K8 typing into the field did not enter text');
            }
          }

          if (kinds.includes('radio')) {
            await reload();
            if (
              (await stillRenders('radio')) &&
              !(await timed('radio arrows', () => arrowsMoveSelection(page)))
            ) {
              failures.push('K3 ArrowDown did not move the selection within the radio group');
            }
          }

          if (kinds.includes('tabs')) {
            await reload();
            if (
              (await stillRenders('tabs')) &&
              !(await timed('tablist arrows', () =>
                arrowsMove(page, TABLIST_WITH_TABS, 'ArrowRight'),
              ))
            ) {
              failures.push('K3 ArrowRight did not move focus within the tablist');
            }
          }

          if (kinds.includes('grid')) {
            await reload();
            if (
              (await stillRenders('grid')) &&
              !(await timed('grid arrows', () => arrowsMove(page, GRID_WITH_CELLS, 'ArrowDown')))
            ) {
              failures.push('K3 ArrowDown did not move focus within the grid');
            }
          }

          for (const [kind, trigger, surface] of [
            ['menu', '[aria-haspopup="menu"]', '[role="menu"]'],
            ['dialog', '[aria-haspopup="dialog"]', '[role="dialog"]'],
            ['combobox', '[role="combobox"]', '[role="listbox"]'],
          ] as const) {
            if (!kinds.includes(kind)) continue;
            await reload();
            if (!(await stillRenders(kind))) continue;
            const { opened, closed, restored } = await timed(`overlay (${kind})`, () =>
              openAndDismiss(page, trigger, surface),
            );
            if (!opened) failures.push(`K4 Enter did not open the ${kind}`);
            else if (!closed) failures.push(`K5 Escape did not close the ${kind}`);
            else if (!restored) failures.push(`K7 focus did not return to the ${kind} trigger`);
          }
        }
        keyboard.push({ ...job, kinds, failures });
      } catch (error) {
        keyboard.push({
          ...job,
          kinds: kinds.length > 0 ? kinds : ['static'],
          failures: [],
          error: error instanceof Error ? error.message.slice(0, 160) : String(error),
        });
        await replacePage();
      }
    }
    await page.close();
    await context.close();
  };

  await Promise.all(Array.from({ length: WORKERS }, worker));
  contrastResults = contrast;
  keyboardResults = keyboard;
  elapsedMs = Date.now() - started;

  writeInventory(
    'contrast',
    byCombination(contrast).map((row) => ({
      id: row.story.id,
      brand: row.brand,
      scheme: row.scheme,
      interacted: row.interacted,
      error: row.error ?? null,
      violations: [...row.violations].sort((a, b) => a.localeCompare(b)),
    })),
  );
  writeInventory(
    'keyboard',
    byCombination(keyboard).map((row) => ({
      id: row.story.id,
      brand: row.brand,
      scheme: row.scheme,
      kinds: [...row.kinds].sort((a, b) => a.localeCompare(b)),
      error: row.error ?? null,
      failures: [...row.failures].sort((a, b) => a.localeCompare(b)),
    })),
  );
}, 2_400_000);

afterAll(async () => {
  await stopHarness(harness);
});

describe('story discovery', () => {
  it('reads its inventory from the Storybook build, not from a list', () => {
    expect(discovered.eligible.length).toBeGreaterThan(0);
    // A shrinking index is either a deleted component or a broken discovery mechanism, and the two
    // are indistinguishable from a green suite. Raising the floor is deliberate; a drop fails.
    expect(
      discovered.eligible.length,
      `discovered ${String(discovered.eligible.length)} eligible stories, below the recorded floor`,
    ).toBeGreaterThanOrEqual(MINIMUM_STORIES);
  });

  it('excludes nothing without a written reason', () => {
    for (const [id, reason] of EXCLUDED) {
      expect(reason.length, `exclusion ${id} has no reason`).toBeGreaterThan(20);
    }
    // The list is empty today; this keeps it from growing quietly.
    expect(EXCLUDED.size, `exclusions present: ${[...EXCLUDED.keys()].join(', ')}`).toBe(0);
  });

  it('rendered every discovered story in every brand and scheme', () => {
    const expected = discovered.eligible.length * BRANDS.length * SCHEMES.length;
    expect(contrastResults.length, 'the contrast matrix did not run to completion').toBe(expected);
    expect(keyboardResults.length, 'the keyboard matrix did not run to completion').toBe(expected);

    const errored = contrastResults.filter((entry) => entry.error !== undefined);
    expect(
      errored.map((entry) => `${entry.story.id} ${entry.brand} ${entry.scheme}: ${entry.error}`),
      'stories that could not be rendered — a load failure is a failure, not a skip',
    ).toStrictEqual([]);
  });
});

describe('contrast across the matrix', () => {
  it('reports the coverage summary', () => {
    const failing = contrastResults.filter((entry) => entry.violations.length > 0);
    const summary = {
      storiesDiscovered: discovered.total,
      eligible: discovered.eligible.length,
      excluded: EXCLUDED.size,
      brands: BRANDS.length,
      schemes: SCHEMES.length,
      combinations: contrastResults.length,
      passed: contrastResults.length - failing.length,
      failed: failing.length,
      interactionsPerformed: contrastResults.filter((entry) => entry.interacted).length,
      durationSeconds: Math.round(elapsedMs / 1000),
    };
    // eslint-disable-next-line no-console -- the machine-readable summary Part 9 asks for.
    console.log('[a11y coverage]', JSON.stringify(summary, null, 1));
    expect(summary.combinations).toBe(summary.passed + summary.failed);
  });

  it('has no colour-contrast violation in any combination', () => {
    const failing = contrastResults.filter((entry) => entry.violations.length > 0);
    const detail = failing.map(
      (entry) =>
        `${entry.story.id} · ${entry.brand} · ${entry.scheme} → ${entry.violations.join(' | ')}`,
    );
    // eslint-disable-next-line no-console -- failing combinations, with the selector, for diagnosis.
    if (detail.length > 0) console.log('[a11y failures]', JSON.stringify(detail, null, 1));
    expect(detail).toStrictEqual([]);
  });
});

describe('keyboard across the matrix', () => {
  it('classified every combination and drove them all', () => {
    expect(
      keyboardResults.filter((o) => o.error !== undefined).map((o) => `${o.story.id}: ${o.error}`),
      'stories that could not be driven — a failure to drive is a failure, not a skip',
    ).toStrictEqual([]);
  });

  it('reports the keyboard coverage summary', () => {
    const interactive = keyboardResults.filter((o) => !o.kinds.includes('static'));
    const byKind: Record<string, number> = {};
    for (const o of keyboardResults) for (const k of o.kinds) byKind[k] = (byKind[k] ?? 0) + 1;
    const summary = {
      stories: discovered.eligible.length,
      brands: BRANDS.length,
      schemes: SCHEMES.length,
      combinations: keyboardResults.length,
      interactive: interactive.length,
      static: keyboardResults.length - interactive.length,
      failed: keyboardResults.filter((o) => o.failures.length > 0).length,
      reclassifiedOnReload: reclassified,
      byKind,
      contracts: CONTRACT,
    };
    // eslint-disable-next-line no-console -- the classification matrix the phase asks to publish.
    console.log('[keyboard coverage]', JSON.stringify(summary, null, 1));
    /*
     * Worker-seconds, not wall-clock: six workers run in parallel, so these sum to roughly six
     * times the elapsed time. It is the right number for deciding what to change, and the wrong
     * one for predicting how long a run takes.
     */
    // eslint-disable-next-line no-console -- Phase 8.10 measures before it optimises.
    console.log('[matrix timing]', JSON.stringify(ledger(), null, 1));
    expect(summary.combinations).toBeGreaterThan(0);
  });

  it('meets the keyboard contract for every interactive story', () => {
    const failing = keyboardResults
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
