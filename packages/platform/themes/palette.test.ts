import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The generated palettes, held against the surfaces the components actually pair them with.
 *
 * Phase 8.3 measured `Badge` at 4.31:1 and `Avatar` at 4.16:1 in the running product, while the
 * `--primary-strong` token those components use measured a comfortable 5.07:1 against white. Both
 * numbers were right. The token was chosen against the page and shipped on a brand *tint* — a 15%
 * tint under `Badge`, 10% under `Avatar` and `Tag` — and a tint of the brand over white is darker
 * than white, so a value that only just clears the page cannot clear the tint.
 *
 * The rule now lives in `scripts/generate-palettes.mjs`; this asserts the property on the generated
 * output, which is what actually ships. It is deliberately not a snapshot of the hex values: the
 * palettes are regenerated from brand colours, and a snapshot would fail on every legitimate brand
 * change while passing on exactly the defect it was written for.
 */

// Resolved from the package root rather than `import.meta.url`: the suite runs under happy-dom,
// where that URL is document-relative and resolves to `/themes` at the filesystem root.
const THEMES_DIR = join(process.cwd(), 'themes');

/** WCAG AA for text below 18.66px bold / 24px. Every use of this token is small text. */
const AA = 4.5;

const channels = (hex: string): readonly number[] =>
  [0, 2, 4].map((i) => Number.parseInt(hex.slice(1 + i, 3 + i), 16));

const luminance = (hex: string): number => {
  const [r, g, b] = channels(hex).map((value) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
};

const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
};

/** sRGB alpha compositing — the same blend the browser paints and Phase 8.3 measured. */
const composite = (fg: string, bg: string, alpha: number): string =>
  '#' +
  [0, 2, 4]
    .map((i) => {
      const f = Number.parseInt(fg.slice(1 + i, 3 + i), 16);
      const b = Number.parseInt(bg.slice(1 + i, 3 + i), 16);
      return Math.round(f * alpha + b * (1 - alpha))
        .toString(16)
        .padStart(2, '0');
    })
    .join('');

/**
 * Read a custom property as the cascade resolves it for a scheme.
 *
 * The dark block overrides only what differs, so `--success`, `--warning` and `--info` are declared
 * once on `:root` and inherited by `.dark`. Reading the dark block alone therefore finds no value
 * and would report a missing token where the browser sees an inherited one — so a dark lookup falls
 * back to `:root`, which is what `.dark` actually resolves to.
 */
function readToken(css: string, name: string, scheme: 'light' | 'dark'): string {
  const [light = '', dark = ''] = css.split(/\n\.dark\s*\{/);
  const pattern = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`);
  const found =
    scheme === 'dark' ? (pattern.exec(dark) ?? pattern.exec(light)) : pattern.exec(light);
  if (found?.[1] === undefined) {
    throw new Error(`--${name} resolves to nothing in the ${scheme} scheme`);
  }
  return found[1].toLowerCase();
}

const themes = readdirSync(THEMES_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name !== 'base')
  .map((entry) => entry.name);

describe('generated palettes', () => {
  it('ships a palette for every brand', () => {
    expect(themes.length).toBeGreaterThan(0);
  });

  describe.each(themes)('%s', (theme) => {
    const css = readFileSync(join(THEMES_DIR, theme, 'palette.css'), 'utf8');

    /*
     * The pairings are named rather than derived, because they are what the components declare:
     * `badge.tsx` is `bg-<tone>/15`, `avatar.tsx`, `tag.tsx` and `alert.tsx` are `bg-<tone>/10` —
     * the latter over `--muted` in the shells they sit in. Deriving them from the components would
     * couple this to their class strings; naming them means a *new* pairing at a lower alpha is a
     * deliberate decision that has to come back here.
     *
     * Every `-strong` token is covered, not only the brand's. Phase 8.3 fixed `--primary-strong`
     * and left the status family on the original white-only rule, because the product it measured
     * renders only the default `Badge` tone. Phase 8.4 rendered all of them and found `success`,
     * `warning`, `info` and `destructive` failing the same way. A test that had described the
     * property rather than the one instance would have caught that a phase earlier.
     */
    it.each([
      ['primary', 'light'],
      ['primary', 'dark'],
      ['destructive', 'light'],
      ['destructive', 'dark'],
      ['success', 'light'],
      ['success', 'dark'],
      ['warning', 'light'],
      ['warning', 'dark'],
      ['info', 'light'],
      ['info', 'dark'],
    ] as const)('keeps --%s-strong legible on its own tint in %s', (role, scheme) => {
      const strong = readToken(css, `${role}-strong`, scheme);
      const fill = readToken(css, role, scheme);
      const page = readToken(css, 'background', scheme);
      const muted = readToken(css, 'muted', scheme);

      const brand = readToken(css, 'primary', scheme);
      const surfaces = {
        page,
        [`badge · ${role}/15 over the page`]: composite(fill, page, 0.15),
        [`tag, avatar and alert · ${role}/10 over muted`]: composite(fill, muted, 0.1),
        /*
         * A tint over another tint — Phase 8.6.
         *
         * `DataGrid` washes a selected row with `bg-primary/5` and a status `Badge` inside it paints
         * `bg-<tone>/15` on top, so the label is two translucent layers above the page. Modelling
         * one layer passed at 4.50:1 and shipped 4.48:1, which is what the browser measured.
         */
        [`badge in a selected row · ${role}/15 over primary/5 over the page`]: composite(
          fill,
          composite(brand, page, 0.05),
          0.15,
        ),
      };

      const measured = Object.entries(surfaces).map(([label, surface]) => ({
        label,
        surface,
        ratio: Number(contrast(strong, surface).toFixed(2)),
      }));
      const worst = measured.reduce((a, b) => (a.ratio < b.ratio ? a : b));

      expect(
        worst.ratio,
        `${theme} ${scheme}: --${role}-strong ${strong} on ${worst.label} (${worst.surface})`,
      ).toBeGreaterThanOrEqual(AA);
    });

    it.each([
      ['primary', 'light'],
      ['primary', 'dark'],
      ['destructive', 'light'],
      ['destructive', 'dark'],
      ['success', 'light'],
      ['success', 'dark'],
      ['warning', 'light'],
      ['warning', 'dark'],
      ['info', 'light'],
      ['info', 'dark'],
    ] as const)('pairs --%s with a legible --%s-foreground in %s', (role, scheme) => {
      /*
       * Every fill the theme offers has to promise a label colour that actually clears AA on it.
       *
       * `bestFg` returned the better of white and ink rather than a passing one, and `Gantt` filled
       * the gap by borrowing `text-background` — white on amber, 2.14:1. This asserts the promise
       * rather than the mechanism, so it holds however the generator later chooses.
       */
      const fill = readToken(css, role, scheme);
      const foreground = readToken(css, `${role}-foreground`, scheme);
      expect(
        Number(contrast(fill, foreground).toFixed(2)),
        `${theme} ${scheme}: --${role} ${fill} with --${role}-foreground ${foreground}`,
      ).toBeGreaterThanOrEqual(AA);
    });
  });
});
