import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The per-combination result inventory — Phase 8.11.
 *
 * An optimisation is only safe if it produces the *same answers*, and "800/800 both times" is not
 * that: two runs can agree on a total while disagreeing about which story failed, which kinds were
 * detected, or which contracts ran. This writes the full inventory — one row per story × brand ×
 * scheme — so a before and after can be diffed at combination level rather than at headline level.
 *
 * Written only when `A11Y_INVENTORY_DIR` is set, so a normal run and CI are unaffected: this exists
 * for the differential verification of an architectural change, not as a permanent artefact.
 */
export function writeInventory(name: string, rows: readonly unknown[]): void {
  const dir = process.env.A11Y_INVENTORY_DIR;
  if (dir === undefined || dir === '') return;
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${name}.json`), `${JSON.stringify(rows, null, 1)}\n`, 'utf8');
}

/** A stable order, so a diff shows real differences rather than scheduling ones. */
export function byCombination<T extends { story: { id: string }; brand: string; scheme: string }>(
  rows: readonly T[],
): T[] {
  return [...rows].sort((a, b) =>
    `${a.story.id}|${a.brand}|${a.scheme}`.localeCompare(`${b.story.id}|${b.brand}|${b.scheme}`),
  );
}
