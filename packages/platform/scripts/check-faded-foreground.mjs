import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Readable text must not fade a semantic foreground token — Phase 8.5.
 *
 * Phases 8.2 and 8.4 fixed the same implementation six times:
 *
 *   SidebarNav group title · Command group heading · Calendar week number ·
 *   Calendar outside-month day · Field optional label · Autocomplete description
 *
 * Every one was a semantic foreground token with an opacity modifier applied to text a person is
 * expected to read, and every one measured between 1.71:1 and 2.79:1. The browser suite catches
 * them once they are rendered; this catches them at the point they are written, which is cheaper
 * and does not depend on a story existing for the state.
 *
 * It is deliberately narrow. Fading is legitimate for graphics and for inactive controls, so the
 * rule targets *foreground text tokens* only, and exempts the cases WCAG itself exempts.
 */

const ROOT = process.argv[2] ?? 'ui';

/** Tokens whose whole purpose is readable text. Fading one is the defect this rule describes. */
const FOREGROUND_TOKENS = [
  'foreground',
  'muted-foreground',
  'card-foreground',
  'popover-foreground',
  'primary-strong',
  'secondary-foreground',
  'accent-foreground',
  'success-strong',
  'warning-strong',
  'info-strong',
  'destructive-strong',
];

const PATTERN = new RegExp(`text-(${FOREGROUND_TOKENS.join('|')})\\/(\\d{1,3})\\b`, 'g');

/**
 * Exempt because WCAG 1.4.3 exempts them, not because they were inconvenient.
 *
 * `disabled:` and `data-[disabled]:` mark an inactive user-interface component, which the success
 * criterion excludes explicitly. The exemption is matched on the *variant prefix* attached to the
 * class, so a faded token on active text cannot borrow it.
 */
const EXEMPT_PREFIX = /(disabled|data-\[disabled[^\]]*\]|aria-disabled):$/;

/**
 * The same exemption, expressed the way this codebase actually writes it.
 *
 * `Calendar` guards its inactive day with `disabled && 'cursor-not-allowed text-muted-foreground/30'`
 * on an element carrying `aria-disabled`, rather than with a `disabled:` Tailwind variant. That is
 * still an inactive user-interface component and still exempt under 1.4.3, so the rule recognises
 * the conditional form — narrowly, on the same line, and only for a condition that names `disabled`.
 * Widening this to any conditional would let the exemption swallow the rule.
 */
const EXEMPT_CONDITION = /\b(is)?[dD]isabled\b[^&|]*&&/;

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      yield* walk(path);
    } else if (/\.tsx?$/.test(path) && !/\.(test|stories)\.tsx?$/.test(path)) {
      yield path;
    }
  }
}

const findings = [];
for (const file of walk(ROOT)) {
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, index) => {
    for (const match of line.matchAll(PATTERN)) {
      const before = line.slice(0, match.index);
      const prefix = /([\w-]+(?:\[[^\]]*\])?:)$/.exec(before)?.[1] ?? '';
      if (EXEMPT_PREFIX.test(prefix)) continue;
      if (EXEMPT_CONDITION.test(line)) continue;
      findings.push({
        file: relative(process.cwd(), file),
        line: index + 1,
        className: match[0],
        token: match[1],
        opacity: Number(match[2]),
      });
    }
  });
}

if (findings.length > 0) {
  console.error('Accessibility rule:');
  console.error('Readable semantic foreground text must not use an opacity modifier.\n');
  console.error('Found:');
  for (const finding of findings) {
    console.error(`  ${finding.file}:${String(finding.line)}`);
    console.error(
      `  ${finding.className}   token=${finding.token} opacity=${String(finding.opacity)}%\n`,
    );
  }
  console.error(
    'Use the token at full strength. Every occurrence of this pattern found in Phases 8.2\n' +
      'and 8.4 measured between 1.71:1 and 2.79:1 against its own surface.\n' +
      'If the element is genuinely decorative or an inactive control, express that with a\n' +
      '`disabled:` variant or fade a non-text property instead.',
  );
  process.exit(1);
}

console.log(`no faded foreground text found in ${ROOT}`);
