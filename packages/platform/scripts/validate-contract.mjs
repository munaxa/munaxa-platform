#!/usr/bin/env node
/**
 * Theme-contract validator — the mechanical guarantee behind the theming rules.
 *
 * A product theme is only allowed to answer the question "what colour is this role?". It may
 * never ask a new question (invent a semantic role), and it may never redefine a structural
 * scale (typography, spacing, radius, shadow, motion, z-index, breakpoints) — those are shared
 * by every product and live in `tokens/`.
 *
 * The contract is DERIVED, never duplicated: the required role set is exactly the set of
 * `var(--x)` references inside the `@theme inline` block of `themes/base/base.css`. Add a role
 * to the contract and every palette is immediately required to supply it; that is the point.
 *
 * Run: `pnpm --filter @axa/platform validate:contract`
 * Exit code 1 on any violation, with every violation reported (not just the first).
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const THEMES = join(ROOT, 'themes');
const BASE = join(THEMES, 'base', 'base.css');
const NEUTRALS = join(THEMES, 'base', 'neutrals.css');
const PRIMITIVES = join(ROOT, 'tokens', 'css', 'primitives.css');

/**
 * Roles the *application* supplies, not the theme: the radius base and the font families it
 * loads. base.css references them, but a palette must not define them — they differ per app,
 * not per brand.
 */
const APP_SUPPLIED = new Set(['radius', 'font-display', 'font-body', 'font-mono']);

/**
 * Structural scales that belong to every product equally. A palette declaring any of these is
 * forking a shared scale, which is exactly what makes two products drift apart.
 */
const STRUCTURAL_PREFIXES = [
  'axa-', // every primitive scale in tokens/css/primitives.css
  'radius-',
  'shadow-', // note: --shadow-tint / --glow-tint are brand values, allowlisted below
  'font-',
  'text-',
  'leading-',
  'tracking-',
  'spacing-',
  'space-',
  'duration-',
  'ease-',
  'z-',
  'breakpoint-',
];
/** Brand tints that legitimately live in a palette despite the `shadow-` prefix rule. */
const STRUCTURAL_ALLOW = new Set(['shadow-tint']);

const errors = [];
const fail = (msg) => errors.push(msg);

/** Strip comments so declarations inside doc blocks are never mistaken for real ones. */
const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** Every `--name` referenced through `var(--name)` in a chunk of CSS. */
function referencedVars(css) {
  return new Set([...css.matchAll(/var\(\s*--([a-zA-Z0-9_-]+)/g)].map((m) => m[1]));
}

/** Every `--name:` declared in a chunk of CSS, in source order. */
function declaredVars(css) {
  return [...css.matchAll(/^\s*--([a-zA-Z0-9_-]+)\s*:/gm)].map((m) => m[1]);
}

/** Extract the body of a top-level block whose header matches `headerRe` (brace-balanced). */
function blockBody(css, headerRe) {
  const m = headerRe.exec(css);
  if (!m) return null;
  let i = css.indexOf('{', m.index);
  if (i === -1) return null;
  let depth = 0;
  for (let j = i; j < css.length; j++) {
    if (css[j] === '{') depth++;
    else if (css[j] === '}') {
      depth--;
      if (depth === 0) return css.slice(i + 1, j);
    }
  }
  return null;
}

// ── 1. Derive the contract from base.css ──────────────────────────────────────
if (!existsSync(BASE)) {
  console.error(`✖ contract: themes/base/base.css is missing`);
  process.exit(1);
}
const baseCss = strip(readFileSync(BASE, 'utf8'));
const themeBlock = blockBody(baseCss, /@theme\s+inline\s*/);
if (themeBlock === null) {
  console.error('✖ contract: no `@theme inline` block found in themes/base/base.css');
  process.exit(1);
}
const contract = new Set([...referencedVars(themeBlock)].filter((v) => !APP_SUPPLIED.has(v)));

/**
 * Roles supplied centrally rather than per-brand. The neutral ramp is *structure*: every product
 * renders the same greys, and only the brand hue changes between themes. They are still part of
 * the contract — components may use them — but a palette must not restate them, because that is
 * how four themes quietly become four different greyscales.
 */
if (!existsSync(NEUTRALS)) {
  console.error('\u2716 contract: themes/base/neutrals.css is missing — the shared neutral ramp has no home.');
  process.exit(1);
}
const SHARED = new Set(declaredVars(strip(readFileSync(NEUTRALS, 'utf8'))));
for (const v of SHARED) {
  if (!contract.has(v)) {
    fail(`base/neutrals.css: \`--${v}\` is declared but never bound in the contract — dead value.`);
  }
}
/** What each product palette must answer for itself. */
const brandContract = new Set([...contract].filter((v) => !SHARED.has(v)));

// The base theme must stay product-agnostic: no literal colours, no product names. The product
// list is read off disk rather than hardcoded, so renaming or adding a theme cannot leave this
// check silently guarding a name that no longer exists.
if (/#[0-9a-fA-F]{3,8}\b/.test(themeBlock)) {
  fail('base.css: the theme contract must not contain a literal colour — colour is a palette.');
}
const themeIds = readdirSync(THEMES)
  .filter((d) => d !== 'base' && statSync(join(THEMES, d)).isDirectory())
  .sort();
// Only declaration lines can leak branding; prose in the doc comment legitimately says "product".
for (const line of baseCss.split('\n')) {
  if (!line.includes('--')) continue;
  const named = themeIds.find((id) => new RegExp(`\\b${id}\\b`, 'i').test(line));
  if (named) {
    fail(`base.css: the theme contract must not name a product ("${named}") — found: ${line.trim()}`);
  }
}

// ── 2. Structural scales are declared exactly once, outside any theme ──────────
if (!existsSync(PRIMITIVES)) {
  fail('tokens/css/primitives.css is missing — the structural scales have no home.');
}

// ── 3. Every product theme satisfies the contract ─────────────────────────────
const products = readdirSync(THEMES)
  .filter((d) => d !== 'base' && statSync(join(THEMES, d)).isDirectory())
  .sort();

if (products.length === 0) fail('themes/: no product themes found.');

for (const product of products) {
  const dir = join(THEMES, product);
  const label = `themes/${product}`;

  for (const required of ['palette.css', 'index.css', 'brand.ts']) {
    if (!existsSync(join(dir, required))) fail(`${label}: missing ${required}`);
  }
  const palettePath = join(dir, 'palette.css');
  if (!existsSync(palettePath)) continue;

  const css = strip(readFileSync(palettePath, 'utf8'));
  const light = blockBody(css, /(^|\n)\s*:root\s*/);
  const dark = blockBody(css, /(^|\n)\s*\.dark\s*/);

  if (light === null) {
    fail(`${label}/palette.css: no \`:root\` block — a theme must define the light scheme.`);
    continue;
  }
  if (dark === null) {
    fail(`${label}/palette.css: no \`.dark\` block — a theme must define the dark scheme.`);
    continue;
  }

  const lightVars = declaredVars(light);
  const darkVars = declaredVars(dark);

  for (const [scheme, vars] of [
    ['light (:root)', lightVars],
    ['dark (.dark)', darkVars],
  ]) {
    const seen = new Set();
    for (const v of vars) {
      if (seen.has(v)) fail(`${label}/palette.css ${scheme}: \`--${v}\` is declared twice.`);
      seen.add(v);

      if (SHARED.has(v)) {
        fail(
          `${label}/palette.css ${scheme}: \`--${v}\` belongs to the shared neutral ramp ` +
            `(themes/base/neutrals.css). A theme overrides branding only — it must not fork ` +
            `the greyscale every product shares.`,
        );
      } else if (!contract.has(v)) {
        fail(
          `${label}/palette.css ${scheme}: \`--${v}\` is not part of the theme contract. ` +
            `A product may not invent a semantic role — add it to themes/base/base.css first, ` +
            `then supply it in every palette.`,
        );
      }
      const structural = STRUCTURAL_PREFIXES.find((p) => v.startsWith(p));
      if (structural && !STRUCTURAL_ALLOW.has(v)) {
        fail(
          `${label}/palette.css ${scheme}: \`--${v}\` redefines a shared structural scale ` +
            `("${structural}*"). Typography, spacing, radius, shadow, motion, z-index and ` +
            `breakpoints are identical across products and live in tokens/.`,
        );
      }
    }
  }

  // `:root` must answer every question the contract asks. `.dark` may override any subset —
  // a role it leaves out is inherited through the cascade, which is how a theme says
  // "this value is the same in both schemes" without duplicating it.
  const lightSet = new Set(lightVars);
  for (const required of [...brandContract].sort()) {
    if (!lightSet.has(required)) {
      fail(`${label}/palette.css light (:root): missing required role \`--${required}\`.`);
    }
  }

  // The theme entry point must pair this palette with the shared contract — never re-declare it.
  const entry = join(dir, 'index.css');
  if (existsSync(entry)) {
    const e = readFileSync(entry, 'utf8');
    if (!e.includes("@import '../base/base.css';")) {
      fail(`${label}/index.css: must import the shared contract (\`../base/base.css\`).`);
    }
    if (!e.includes("@import './palette.css';")) {
      fail(`${label}/index.css: must import its own \`./palette.css\`.`);
    }
    if (blockBody(e, /@theme\s+inline\s*/) !== null) {
      fail(`${label}/index.css: must not declare its own \`@theme\` block — the contract is shared.`);
    }
  }
}

// ── 4. Every theme on disk is registered in the typed registry ────────────────
const registryPath = join(THEMES, 'index.ts');
if (!existsSync(registryPath)) {
  fail('themes/index.ts is missing — themes must be enumerable by tooling.');
} else {
  const registry = readFileSync(registryPath, 'utf8');
  for (const product of products) {
    if (!new RegExp(`\\bid:\\s*'${product}'`).test(registry)) {
      fail(`themes/index.ts: theme \`${product}\` exists on disk but is not registered.`);
    }
  }
}

// ── report ────────────────────────────────────────────────────────────────────
if (errors.length > 0) {
  console.error(`\n✖ Theme contract validation failed (${errors.length} problem(s)):\n`);
  for (const e of errors) console.error(`  • ${e}`);
  console.error(
    `\nThe contract is ${contract.size} semantic roles (${brandContract.size} per-brand, ` +
      `${SHARED.size} shared), derived from the \`@theme inline\` block of ` +
      `themes/base/base.css.\nSee platform/architecture/theming.md.\n`,
  );
  process.exit(1);
}

console.log(
  `✔ Theme contract: ${contract.size} semantic roles (${brandContract.size} per-brand + ` +
    `${SHARED.size} shared neutral) satisfied by ${products.length} product theme(s) ` +
    `(${products.join(', ')}) in both colour schemes.`,
);
