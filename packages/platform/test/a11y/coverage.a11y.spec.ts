import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type Brand, type Harness, type Scheme, startHarness, stopHarness } from './harness.js';
import { axeOn } from './measure.js';
import { counted, ledger, timed } from './timing.js';
import { EXCLUDED, INTERACTIONS, MINIMUM_STORIES, readIndex, type Story } from './stories.js';

/**
 * Every story the platform builds, in every brand and both schemes — Phase 8.5.
 *
 * Phase 8.4 proved the platform *can* catch its own accessibility defects. This makes it catch them
 * everywhere rather than on a subset someone chose: the inventory is read from the Storybook build,
 * so a component added tomorrow is measured tomorrow without anyone remembering to list it.
 *
 * The whole matrix is executed before anything is asserted. Stopping at the first failure would
 * report one defect and hide the shape of the rest — whether a violation is one component or one
 * token repeated across four brands is the difference between a component fix and a palette fix.
 */

const ROOT = join(process.cwd(), 'storybook-static');
const BRANDS: readonly Brand[] = ['docs', 'group', 'school', 'work'];
const SCHEMES: readonly Scheme[] = ['light', 'dark'];

/** Concurrency: a browser context each, well under what the box will bear. */
const WORKERS = 6;

interface Result {
  readonly story: Story;
  readonly brand: Brand;
  readonly scheme: Scheme;
  readonly violations: readonly string[];
  readonly error?: string;
  readonly interacted: boolean;
}

let harness: Harness | null = null;
let results: Result[] = [];
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

  const collected: Result[] = [];
  const worker = async (): Promise<void> => {
    const context = await timed('browser context', () =>
      harness!.browser.newContext({ viewport: { width: 1280, height: 900 } }),
    );
    /*
     * One page per worker rather than one per combination — Phase 8.10.
     *
     * Every combination begins with a full navigation, which replaces the document, so a reused
     * page carries nothing across. Creating 800 pages cost 237 worker-seconds and bought no
     * isolation that the navigation was not already providing. A page is replaced only when a
     * combination throws, where its state is genuinely unknown.
     */
    let page = await timed('new page', () => context.newPage());
    for (;;) {
      const job = queue.shift();
      if (job === undefined) break;
      let interacted = false;
      try {
        await timed('story render', async () => {
          await page.goto(
            `${harness!.origin}/iframe.html?id=${job.story.id}&globals=brand:${job.brand};scheme:${job.scheme}`,
            { waitUntil: 'load', timeout: 30_000 },
          );
          await page.waitForFunction(
            () => (document.querySelector('#storybook-root')?.children.length ?? 0) > 0,
            undefined,
            { timeout: 15_000 },
          );
        });

        for (const step of INTERACTIONS.get(job.story.id) ?? []) {
          if (step.clickByName !== undefined) {
            await page.getByRole('button', { name: step.clickByName }).first().click();
          }
          if (step.waitFor !== undefined) {
            await page.waitForSelector(step.waitFor, { state: 'visible', timeout: 10_000 });
          }
          interacted = true;
        }

        // A short settle rather than `settleColours`: this runs 768 times, and the expensive
        // per-element sampling is reserved for the measurement suite that reports ratios.
        await timed('settle (fixed 150ms)', () => page.waitForTimeout(150));
        const outcome = await timed('axe', () => axeOn(page));
        counted('combination');
        collected.push({ ...job, violations: outcome.violations, interacted });
      } catch (error) {
        collected.push({
          ...job,
          violations: [],
          error: error instanceof Error ? error.message.slice(0, 160) : String(error),
          interacted,
        });
        // A combination that threw leaves the page in a state nobody has reasoned about.
        await page.close();
        page = await timed('new page', () => context.newPage());
      }
    }
    await page.close();
    await context.close();
  };

  await Promise.all(Array.from({ length: WORKERS }, worker));
  results = collected;
  elapsedMs = Date.now() - started;
}, 1_800_000);

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
    expect(results.length, 'the matrix did not run to completion').toBe(expected);

    const errored = results.filter((entry) => entry.error !== undefined);
    expect(
      errored.map((entry) => `${entry.story.id} ${entry.brand} ${entry.scheme}: ${entry.error}`),
      'stories that could not be rendered — a load failure is a failure, not a skip',
    ).toStrictEqual([]);
  });
});

describe('accessibility across the matrix', () => {
  it('reports the coverage summary', () => {
    const failing = results.filter((entry) => entry.violations.length > 0);
    const summary = {
      storiesDiscovered: discovered.total,
      eligible: discovered.eligible.length,
      excluded: EXCLUDED.size,
      brands: BRANDS.length,
      schemes: SCHEMES.length,
      combinations: results.length,
      passed: results.length - failing.length,
      failed: failing.length,
      interactionsPerformed: results.filter((entry) => entry.interacted).length,
      durationSeconds: Math.round(elapsedMs / 1000),
    };
    // eslint-disable-next-line no-console -- the machine-readable summary Part 9 asks for.
    console.log('[a11y coverage]', JSON.stringify(summary, null, 1));
    // eslint-disable-next-line no-console -- Phase 8.10 measures before it optimises. Worker-seconds.
    console.log('[contrast timing]', JSON.stringify(ledger(), null, 1));
    expect(summary.combinations).toBe(summary.passed + summary.failed);
  });

  it('has no colour-contrast violation in any combination', () => {
    const failing = results.filter((entry) => entry.violations.length > 0);
    const detail = failing.map(
      (entry) =>
        `${entry.story.id} · ${entry.brand} · ${entry.scheme} → ${entry.violations.join(' | ')}`,
    );
    // eslint-disable-next-line no-console -- failing combinations, with the selector, for diagnosis.
    if (detail.length > 0) console.log('[a11y failures]', JSON.stringify(detail, null, 1));
    expect(detail).toStrictEqual([]);
  });
});
