import { readFileSync, readdirSync, statSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * Phase 8.13 — the gap the accessibility matrix could not report.
 *
 * The matrix has said "100 stories, 0 excluded" since Phase 8.5, and that number is honest about
 * every question except the one that matters most: it counts *stories*. Discovery reads
 * `storybook-static/index.json`, so a public component nobody ever wrote a story for is not
 * excluded and not skipped — it is invisible, and the run is green because it was never asked.
 *
 * Eighteen renderable public exports were in exactly that state: no story, and no other component
 * rendered them either, so zero of the 800 brand × scheme combinations had ever laid one out. The
 * first five that were rendered turned up a real defect immediately — `Progress` shipped
 * `role="progressbar"` with `aria-label={undefined}` whenever `label` was omitted.
 *
 * This test is the ratchet. It fails when a public component is added without anything rendering
 * it, so the gap cannot silently reopen, and it fails just as loudly when `NOT_RENDERED` names
 * something that *is* now rendered — an allowance that is never re-checked becomes a place to hide.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE = path.dirname(HERE);

/**
 * Composition parts that no story can render, with the reason.
 *
 * Radix's `ContextMenu` root has no `open` prop: it opens on the browser's `contextmenu` event and
 * on nothing else, so — unlike `DropdownMenu` and `Popover`, which `uncovered.stories.tsx` renders
 * open — its sub-parts cannot be brought onto the page declaratively. Covering them needs the
 * matrix to dispatch the event, which is a change to the harness rather than to a story, and is
 * recorded rather than done here.
 *
 * The exemption is narrow on purpose: it buys these seven no accessibility relief whatsoever, it
 * only records that no story renders them. `ContextMenuContent`, `ContextMenuItem`,
 * `ContextMenuSeparator` and `ContextMenuTrigger` are *not* here, because the shell renders them.
 */
const NOT_RENDERED = [
  'ContextMenuCheckboxItem',
  'ContextMenuGroup',
  'ContextMenuLabel',
  'ContextMenuRadioGroup',
  'ContextMenuSub',
  'ContextMenuSubContent',
  'ContextMenuSubTrigger',
] as const;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry === '.storybook') continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

/**
 * A component is "rendered" if it appears as a JSX tag. The trailing character class admits
 * `<OrgChart<Person>`, which the obvious `[\s/>]` silently misses — a generic component would have
 * been reported as uncovered while `board.stories.tsx` renders it twice.
 */
const JSX = /<([A-Z][A-Za-z0-9]*)[\s/><]/g;

/** `Meta.component` is the other way a story renders one — `TokenReference` is rendered from args. */
const AS_META = /\bcomponent:\s*([A-Z][A-Za-z0-9]*)/g;

const namesIn = (source: string, pattern: RegExp): string[] =>
  [...source.matchAll(pattern)].map((match) => match[1] as string);

describe('every public component is rendered somewhere the matrix can see it', () => {
  const files = walk(PACKAGE);
  const tsx = files.filter((file) => file.endsWith('.tsx'));
  const storyFiles = tsx.filter((file) => file.endsWith('.stories.tsx'));
  const sourceFiles = tsx.filter(
    (file) => !file.endsWith('.stories.tsx') && !file.endsWith('.test.tsx'),
  );

  /** PascalCase values declared in a `.tsx` file: the ones that can actually be put on a page. */
  const declared = new Map<string, string>();
  for (const file of sourceFiles) {
    for (const name of namesIn(
      readFileSync(file, 'utf8'),
      /^export\s+(?:const|function)\s+([A-Z][A-Za-z0-9]*)\b/gm,
    )) {
      declared.set(name, path.relative(PACKAGE, file));
    }
  }

  /** Public = re-exported from a barrel, which is the only thing an application can import. */
  const isPublic = new Set<string>();
  for (const barrel of files.filter((file) => file.endsWith('index.ts'))) {
    const source = readFileSync(barrel, 'utf8');
    for (const match of source.matchAll(/export\s+\*\s+from\s+'([^']+)'/g)) {
      const target = path.resolve(path.dirname(barrel), (match[1] as string).replace(/\.js$/, ''));
      for (const [name, relative] of declared) {
        if (path.join(PACKAGE, relative).replace(/\.tsx$/, '') === target) isPublic.add(name);
      }
    }
    for (const match of source.matchAll(/export\s+\{([^}]+)\}/g)) {
      for (const part of (match[1] as string).split(',')) {
        const name = (
          part
            .trim()
            .split(/\s+as\s+/)
            .pop() ?? ''
        ).trim();
        if (/^[A-Z][A-Za-z0-9]*$/.test(name) && declared.has(name)) isPublic.add(name);
      }
    }
  }

  const inStories = new Set<string>();
  for (const file of storyFiles) {
    const source = readFileSync(file, 'utf8');
    for (const name of namesIn(source, JSX)) inStories.add(name);
    for (const name of namesIn(source, AS_META)) inStories.add(name);
  }

  const byAnotherComponent = new Set<string>();
  for (const file of sourceFiles) {
    for (const name of namesIn(readFileSync(file, 'utf8'), JSX)) byAnotherComponent.add(name);
  }

  const publicNames = [...isPublic].sort();
  const unrendered = publicNames.filter(
    (name) => !inStories.has(name) && !byAnotherComponent.has(name),
  );

  it('found the public surface it is supposed to be guarding', () => {
    // A scan that silently matched nothing would pass every assertion below it. Phase 8.13
    // measured 172 renderable public exports across 34 story files; the floors are deliberately
    // slack, because their job is to catch a broken regex rather than to freeze the component list.
    expect(storyFiles.length, 'no story files found — the scan is broken').toBeGreaterThan(25);
    expect(publicNames.length, 'no public components found — the scan is broken').toBeGreaterThan(
      150,
    );
    expect(publicNames, 'a component fixed in this phase').toContain('Progress');
  });

  it('renders every public component in a story or inside another component', () => {
    expect(
      unrendered,
      'these public components are rendered nowhere, so no accessibility check has ever seen ' +
        'them: add a story, or add them to NOT_RENDERED with the reason no story can render them',
    ).toStrictEqual([...NOT_RENDERED]);
  });

  it('keeps the exemption list honest, so nothing hides behind a stale entry', () => {
    const nowRendered = NOT_RENDERED.filter(
      (name) => inStories.has(name) || byAnotherComponent.has(name),
    );
    expect(
      nowRendered,
      'these are rendered now — remove them from NOT_RENDERED so the guard covers them',
    ).toStrictEqual([]);

    const notPublic = NOT_RENDERED.filter((name) => !isPublic.has(name));
    expect(notPublic, 'these are no longer public — remove them from NOT_RENDERED').toStrictEqual(
      [],
    );
  });
});
