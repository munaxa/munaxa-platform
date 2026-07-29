#!/usr/bin/env node
/**
 * Structural-token mirror validator.
 *
 * Every structural scale exists twice on purpose: once typed (`tokens/<scale>/index.ts`, for
 * TypeScript consumers and design tooling) and once as CSS custom properties
 * (`tokens/css/primitives.css`, for consumers that have no build step — print stylesheets,
 * email, plain CSS). Two mirrors means two chances to drift, and a drifted spacing or radius
 * scale is exactly how two products stop looking like one family.
 *
 * This validator asserts the mirrors are value-identical, in both directions: no typed step
 * missing from CSS, no CSS variable without a typed counterpart.
 *
 * Typography is deliberately absent from the CSS mirror (it is consumed only through Tailwind's
 * font utilities), so there is nothing to compare — what protects it is the theme-contract
 * validator, which forbids any product from redeclaring a `--font-*` / `--text-*` variable.
 *
 * Run: `pnpm --filter @axa/platform validate:tokens`
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CSS = join(ROOT, 'tokens', 'css', 'primitives.css');

/**
 * Typed keys that intentionally have no CSS counterpart, with the reason. The validator checks
 * this list too: an entry that gains a CSS variable, or disappears from the typed module, is
 * reported — so the allowlist cannot quietly rot.
 */
const TS_ONLY = {
  'motion.duration.instant': 'zero duration; expressed as `transition: none`, not a variable',
  'elevation.none': 'the absence of a shadow; expressed as `box-shadow: none`',
  'elevation.card': 'composed in the Tailwind theme (--shadow-card) because it references --border',
  'elevation.glow': 'composed in the Tailwind theme (--shadow-glow) because it references --primary',
};

const errors = [];
const fail = (m) => errors.push(m);

const css = readFileSync(CSS, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** All `--axa-*` declarations as name -> value. */
const cssVars = new Map(
  [...css.matchAll(/^\s*--(axa-[a-zA-Z0-9_-]+)\s*:\s*([^;]+);/gm)].map((m) => [
    m[1],
    m[2].trim(),
  ]),
);

/**
 * Read a typed token module without importing it (the package may not be built yet in CI).
 * The modules are plain `export const x = { … } as const;` object literals, so a scoped
 * JSON-ish parse is exact and dependency-free.
 */
function readTyped(scale, exportName) {
  const src = readFileSync(join(ROOT, 'tokens', scale, 'index.ts'), 'utf8');
  const start = src.indexOf(`export const ${exportName} = {`);
  if (start === -1) throw new Error(`tokens/${scale}/index.ts: no \`export const ${exportName}\``);
  let depth = 0;
  let open = src.indexOf('{', start);
  let end = open;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  const body = src.slice(open, end + 1);
  const json = body
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
    .replace(/'/g, '"')
    .replace(/([{,]\s*)([A-Za-z_$][\w$]*|\d+)\s*:/g, '$1"$2":')
    .replace(/,(\s*[}\]])/g, '$1');
  return JSON.parse(json);
}

/** Numeric-insensitive comparison: CSS `0.1` and TS `0.10` are the same value. */
const norm = (v) =>
  String(v)
    .replace(/\d*\.?\d+/g, (m) => String(Number(m)))
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Compare one typed scale against its CSS mirror.
 * `entries` is a flat list of [dottedKey, cssVarName, value].
 */
function compare(label, prefix, entries) {
  const expected = new Set();
  for (const [key, varName, value] of entries) {
    expected.add(varName);
    const actual = cssVars.get(varName);
    if (actual === undefined) {
      fail(`${label}: typed \`${key}\` has no CSS mirror (expected \`--${varName}\`).`);
    } else if (norm(actual) !== norm(value)) {
      fail(`${label}: \`${key}\` differs — typed \`${value}\`, CSS \`--${varName}: ${actual}\`.`);
    }
  }
  for (const name of cssVars.keys()) {
    if (name.startsWith(prefix) && !expected.has(name)) {
      fail(`${label}: \`--${name}\` exists in CSS with no typed counterpart.`);
    }
  }
}

const spacing = readTyped('spacing', 'spacing');
compare(
  'spacing',
  'axa-space-',
  Object.entries(spacing).map(([k, v]) => [`spacing.${k}`, `axa-space-${k}`, v]),
);

const radius = readTyped('radius', 'radius');
compare(
  'radius',
  'axa-radius-',
  Object.entries(radius).map(([k, v]) => [`radius.${k}`, `axa-radius-${k}`, v]),
);

const zIndex = readTyped('z-index', 'zIndex');
compare(
  'z-index',
  'axa-z-',
  Object.entries(zIndex).map(([k, v]) => [`zIndex.${k}`, `axa-z-${k}`, v]),
);

const breakpoints = readTyped('breakpoints', 'breakpoints');
compare(
  'breakpoints',
  'axa-bp-',
  Object.entries(breakpoints).map(([k, v]) => [`breakpoints.${k}`, `axa-bp-${k}`, v]),
);

const opacity = readTyped('opacity', 'opacity');
compare(
  'opacity',
  'axa-opacity-',
  Object.entries(opacity).map(([k, v]) => [`opacity.${k}`, `axa-opacity-${k}`, v]),
);

const motion = readTyped('motion', 'motion');
compare(
  'motion durations',
  'axa-duration-',
  Object.entries(motion.duration)
    .filter(([k]) => !(`motion.duration.${k}` in TS_ONLY))
    .map(([k, v]) => [`motion.duration.${k}`, `axa-duration-${k}`, v]),
);
compare(
  'motion easings',
  'axa-easing-',
  Object.entries(motion.easing).map(([k, v]) => [`motion.easing.${k}`, `axa-easing-${k}`, v]),
);

const elevation = readTyped('elevation', 'elevation');
compare(
  'elevation',
  'axa-shadow-',
  Object.entries(elevation)
    .filter(([k]) => !(`elevation.${k}` in TS_ONLY))
    .map(([k, v]) => [`elevation.${k}`, `axa-shadow-${k}`, v]),
);

// The allowlist must stay honest.
const typed = { motion, elevation };
for (const [dotted, reason] of Object.entries(TS_ONLY)) {
  const [scale, ...rest] = dotted.split('.');
  let node = typed[scale];
  for (const part of rest) node = node?.[part];
  if (node === undefined) {
    fail(`TS_ONLY: \`${dotted}\` no longer exists in the typed tokens — remove it (${reason}).`);
  }
  const cssName = dotted
    .replace('motion.duration.', 'axa-duration-')
    .replace('elevation.', 'axa-shadow-');
  if (cssVars.has(cssName)) {
    fail(`TS_ONLY: \`${dotted}\` now HAS a CSS mirror (\`--${cssName}\`) — drop it from TS_ONLY.`);
  }
}

if (errors.length > 0) {
  console.error(`\n✖ Structural token validation failed (${errors.length} problem(s)):\n`);
  for (const e of errors) console.error(`  • ${e}`);
  console.error('\nSee platform/architecture/theming.md — "Tokens have two mirrors".\n');
  process.exit(1);
}

const counted =
  Object.keys(spacing).length +
  Object.keys(radius).length +
  Object.keys(zIndex).length +
  Object.keys(breakpoints).length +
  Object.keys(motion.duration).length +
  Object.keys(motion.easing).length +
  Object.keys(elevation).length;
console.log(`✔ Structural tokens: ${counted} typed values match their CSS mirrors exactly.`);
