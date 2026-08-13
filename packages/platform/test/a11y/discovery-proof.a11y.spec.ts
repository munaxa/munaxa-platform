import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { MINIMUM_STORIES, readIndex } from './stories.js';

/**
 * Proof that automatic discovery still notices a shrinking inventory — Phase 8.11.
 *
 * The matrix covers whatever Storybook built, and the floor in `stories.ts` is what stops that from
 * quietly becoming "whatever Storybook built today, which is less". Every phase since 8.5 has
 * asserted the floor; none has ever proved the floor *fires*. An assertion nobody has seen fail is
 * a promise, not a guarantee — the lesson this suite keeps relearning.
 *
 * No browser: `readIndex` reads the built index, so removing entries from a copy is enough to show
 * the mechanism reacts. Milliseconds, and it runs on every accessibility run.
 */

const ROOT = join(process.cwd(), 'storybook-static');

describe('story discovery reacts to a shrinking inventory', () => {
  it('falls below the floor when entries are removed, and recovers when they return', () => {
    const real = readIndex(ROOT);
    expect(
      real.eligible.length,
      'the real build must clear the floor to begin with',
    ).toBeGreaterThanOrEqual(MINIMUM_STORIES);

    const raw = JSON.parse(readFileSync(join(ROOT, 'index.json'), 'utf8')) as {
      entries: Record<string, unknown>;
    };

    // Remove enough entries to cross the floor — deliberately more than a rounding error, so the
    // proof is about the mechanism rather than about an off-by-one.
    const keep = Math.max(0, MINIMUM_STORIES - 5);
    const thinned = Object.fromEntries(Object.entries(raw.entries).slice(0, keep));

    const scratch = mkdtempSync(join(tmpdir(), 'a11y-discovery-'));
    writeFileSync(join(scratch, 'index.json'), JSON.stringify({ v: 5, entries: thinned }), 'utf8');

    const shrunk = readIndex(scratch);
    expect(
      shrunk.eligible.length,
      'discovery must report the smaller inventory rather than the remembered one',
    ).toBeLessThan(real.eligible.length);
    expect(
      shrunk.eligible.length,
      'and that smaller inventory must fall below the floor the matrix asserts',
    ).toBeLessThan(MINIMUM_STORIES);

    // The original build is untouched: discovery reads, it does not cache.
    const again = readIndex(ROOT);
    expect(again.eligible.length, 'the full inventory returns when the entries do').toBe(
      real.eligible.length,
    );
    expect(again.eligible.map((story) => story.id)).toStrictEqual(
      real.eligible.map((story) => story.id),
    );
  });

  it('never carries an exclusion without a reason', () => {
    // Restated here so the discovery proof and the matrix cannot drift apart about what "eligible"
    // means: an excluded story is a story the matrix does not cover.
    const { total, eligible } = readIndex(ROOT);
    expect(eligible.length, 'nothing is excluded today, and the count says so').toBe(total);
  });
});
