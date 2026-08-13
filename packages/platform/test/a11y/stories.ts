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
 * What a story actually renders, and therefore what it owes a keyboard user — Phase 8.7.
 *
 * The Phase 8.4 version classified on the story *title*: `includes('datagrid')` meant grid,
 * `includes('selection')` meant combobox. Enough for the two stories it covered; not enough for a
 * matrix. A title cannot tell a button from a switch, cannot see that a foundations page renders
 * live inputs, and cannot know an icons gallery renders none — so it would both miss real controls
 * and invent contracts for decorative pages.
 *
 * Classification is therefore taken from the rendered DOM of the story, inside `#storybook-root`
 * and any portal it opens, never from Storybook's own chrome. `static` is a real answer rather than
 * a skip: a typography page has no keyboard contract, and asserting one would be theatre.
 */
export type Kind =
  | 'static'
  | 'button'
  | 'link'
  | 'input'
  | 'checkbox'
  | 'radio'
  | 'switch'
  | 'tabs'
  | 'menu'
  | 'combobox'
  | 'dialog'
  | 'grid';

/**
 * The contract each kind owes, in the order a person performs it.
 *
 * Deliberately minimal per kind. A grid owes roving arrows rather than a Tab stop per cell —
 * asserting Tab there would report a defect where the component is correct, which is exactly the
 * K3 failure class this phase must avoid manufacturing.
 *
 * Phase 8.9 marks each line "checked" once the matrix drives it. `combobox` reads the way it does
 * because the platform ships two of them and they open differently: the `Popover`-backed one opens
 * on Enter, the `Autocomplete`-backed one is open as soon as it has focus. Both dismiss on Escape
 * and both restore focus, so the contract is written around what they share rather than around one
 * of them. Opening a select-only combobox with ArrowDown is an ARIA authoring-practice
 * recommendation this platform does not implement; it is recorded as a deferred enhancement rather
 * than asserted here, because the control is fully operable without it.
 */
export const CONTRACT: Readonly<Record<Kind, string>> = {
  static: 'none — renders no focusable control',
  button: 'Tab reaches it; Enter or Space activates',
  link: 'Tab reaches it; it exposes an activation target — checked',
  input: 'Tab reaches it; typing enters text — checked',
  checkbox: 'Tab reaches it; Space toggles checked — checked',
  radio: 'Tab reaches the group; arrows move the selection — checked',
  switch: 'Tab reaches it; Space toggles state — checked',
  tabs: 'Tab reaches the tablist; arrows move between tabs — checked',
  menu: 'Tab reaches the trigger; Enter opens; Escape closes and returns focus — checked',
  combobox:
    'Tab reaches it; it opens (on Enter, or already open once focused); Escape closes and returns focus — checked',
  dialog: 'Tab reaches the trigger; Enter opens; Escape closes and returns focus — checked',
  grid: 'roving focus: one Tab stop, arrows move the cell — checked',
};

/*
 * A composite is only a composite once it has something to move between: a loading `DataGrid`
 * renders eight skeleton rows and no cell at all, and arrow keys with nowhere to go are correct
 * behaviour rather than a defect.
 *
 * Exported because a states story renders *several* grids — the empty one, the loading one, the
 * populated one — and classifying from the page while driving the first match on it accuses a
 * component that works. The selector that decides a story has a grid is the one that picks which
 * grid to drive.
 */
export const GRID_WITH_CELLS = '[role="grid"]:has([role="gridcell"])';
export const TABLIST_WITH_TABS = '[role="tablist"]:has([role="tab"])';

/**
 * Detect every kind a rendered story contains, so a story with two controls owes both contracts.
 *
 * Disabled controls do not count. WCAG exempts inactive controls, and a correct disabled `Button`
 * is deliberately out of the tab order — so a story that renders only disabled controls has no
 * keyboard contract, and reporting one would be a defect in the instrument rather than the
 * component. `primitives-button--disabled` is exactly that story and was the whole of the first
 * matrix run's failure list.
 */
/**
 * A field a person can type into — Phase 8.9, and one definition rather than two.
 *
 * The Phase 8.7 selector was "an input that is not a checkbox or a radio", which swept in
 * `<input type="file">`. The files stories render one, visually hidden behind a Browse button as
 * every upload control does, and typing into it does nothing because typing into a file field is
 * meaningless. A contract built on that selector would have called two correct components broken.
 *
 * Hidden, disabled and read-only fields are out for the same reason: nobody can type into them, so
 * they owe nothing. The classifier and the contract share this source so they cannot disagree about
 * what the story contains — a disagreement of exactly that kind cost Phase 8.7 a whole failure
 * family, when a page-wide classification met a first-match driver.
 */
const TYPABLE_IN = `(root) => {
  const TYPES = ['text', 'search', 'email', 'url', 'tel', 'password', 'number'];
  if (root === null) return [];
  return [...root.querySelectorAll('input, textarea')].filter((el) => {
    if (el.disabled || el.readOnly || el.getAttribute('aria-disabled') === 'true') return false;
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    return el.tagName === 'TEXTAREA' || TYPES.includes(el.type);
  });
}`;

/** Tag the first typable field so the contract types into exactly what the classifier counted. */
export const MARK_TYPABLE = `() => {
  const typableIn = ${TYPABLE_IN};
  const first = typableIn(document.querySelector('#storybook-root'))[0];
  if (first === undefined) return false;
  first.setAttribute('data-kb-typable', '');
  return true;
}`;

export const DETECT_KINDS = `() => {
  const GRID_WITH_CELLS = ${JSON.stringify(GRID_WITH_CELLS)};
  const TABLIST_WITH_TABS = ${JSON.stringify(TABLIST_WITH_TABS)};
  const typableIn = ${TYPABLE_IN};
  const root = document.querySelector('#storybook-root');
  if (root === null) return [];
  const kinds = new Set();
  const INACTIVE = ':not(:disabled):not([aria-disabled="true"]):not([data-disabled])';
  const has = (selector) =>
    selector
      .split(',')
      .some((part) => root.querySelector(part.trim() + INACTIVE) !== null);

  if (has(GRID_WITH_CELLS)) kinds.add('grid');
  if (has(TABLIST_WITH_TABS)) kinds.add('tabs');
  if (has('[role="switch"]')) kinds.add('switch');
  if (has('input[type="checkbox"], [role="checkbox"]')) kinds.add('checkbox');
  if (has('input[type="radio"], [role="radio"]')) kinds.add('radio');
  if (has('[role="combobox"]')) kinds.add('combobox');
  if (has('[aria-haspopup="menu"]')) kinds.add('menu');
  if (has('[aria-haspopup="dialog"]')) kinds.add('dialog');
  if (typableIn(root).length > 0) kinds.add('input');
  if (has('a[href]')) kinds.add('link');
  if (has('button')) kinds.add('button');

  return [...kinds];
}`;
