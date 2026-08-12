import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The story inventory, read from the build rather than maintained by hand — Phase 8.5.
 *
 * Phase 8.4 measured twelve stories chosen by a person and found seven defects. The platform builds
 * ninety-six. A list someone has to remember to extend is a list that stops being true the first
 * time a component is added, so the inventory now comes from `storybook-static/index.json` — the
 * artefact Storybook itself generates from the story files it compiled.
 *
 * The consequence is the point: a new story enters the accessibility matrix by existing.
 */

/** The shape Storybook v5 indexes emit. Narrowed to what this suite actually reads. */
interface IndexEntry {
  readonly id: string;
  readonly type: string;
  readonly title: string;
  readonly name: string;
  readonly importPath: string;
}

export interface Story {
  readonly id: string;
  readonly title: string;
  readonly name: string;
  readonly importPath: string;
}

/**
 * Stories deliberately kept out of the matrix.
 *
 * Empty, and the assertion below keeps it that way by accident-proofing rather than by trust: a
 * failing story is an accessibility problem, not an exclusion candidate, and Phase 8.3 is the
 * cautionary tale — a single tolerated entry there hid a serious violation for three phases.
 *
 * Anything added here needs a reason that survives being read aloud: *why the entry cannot be
 * rendered independently*, not *why it currently fails*.
 */
export const EXCLUDED: ReadonlyMap<string, string> = new Map();

/**
 * The floor the discovered count must not silently drop below.
 *
 * A story index that shrinks is either a deleted component or a broken discovery mechanism, and the
 * two look identical from a green suite. Raising this number is a deliberate act; a drop fails.
 */
export const MINIMUM_STORIES = 90;

export function readIndex(root: string): { readonly total: number; readonly eligible: Story[] } {
  const raw = JSON.parse(readFileSync(join(root, 'index.json'), 'utf8')) as {
    v: number;
    entries: Record<string, IndexEntry>;
  };

  const all = Object.values(raw.entries);
  /*
   * `type: 'story'` is the renderable kind. Storybook also emits `docs` entries for MDX pages,
   * which are documentation *about* stories and render a page of them rather than a component —
   * they are not independently renderable in the sense this suite needs. None exist in this build,
   * so the filter is a guard rather than an exclusion, and the counts in the report say so.
   */
  const renderable = all.filter((entry) => entry.type === 'story');
  const eligible = renderable
    .filter((entry) => !EXCLUDED.has(entry.id))
    .map(({ id, title, name, importPath }) => ({ id, title, name, importPath }));

  return { total: all.length, eligible };
}

/**
 * How a story is exercised before it is judged.
 *
 * Most stories render everything they have on load. A few hide their most interesting surface
 * behind a control — Phase 8.4 measured the `Command` group heading at 2.79:1 only after clicking
 * the button that opens the palette, and would otherwise have recorded "does not render".
 *
 * Interactions are declared per story and performed through the real controls: a click on a named
 * button, a keypress. Nothing here reaches into React state or edits the DOM, because an
 * accessibility result obtained by bypassing the component is a result about nothing.
 */
export interface Interaction {
  readonly label: string;
  /** Accessible name of a control to click, matched case-insensitively. */
  readonly clickByName?: RegExp;
  /** Selector that must appear before the story counts as opened. */
  readonly waitFor?: string;
}

export const INTERACTIONS: ReadonlyMap<string, readonly Interaction[]> = new Map([
  [
    'forms-selection--palette',
    [{ label: 'open the command palette', clickByName: /open palette/i, waitFor: '[cmdk-input]' }],
  ],
]);

/**
 * Keyboard expectations by component kind.
 *
 * Deliberately not "every key on every story": a `Badge` has no keyboard contract, and asserting
 * one would be theatre. Kinds are matched from the story title, and only the interaction a control
 * of that kind actually owes a keyboard user is required.
 */
export type Kind = 'navigation' | 'dialog' | 'grid' | 'combobox' | 'menu' | 'none';

export function kindOf(story: Story): Kind {
  const title = story.title.toLowerCase();
  if (title.includes('appshell') || title.includes('navigation')) return 'navigation';
  if (story.id === 'forms-selection--palette') return 'dialog';
  if (title.includes('datagrid')) return 'grid';
  if (title.includes('selection')) return 'combobox';
  if (title.includes('menus')) return 'menu';
  return 'none';
}
