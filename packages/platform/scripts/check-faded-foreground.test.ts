import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * The faded-foreground guard, proven on cases rather than trusted — Phase 8.5.
 *
 * A static rule that never fires is indistinguishable from a static rule that cannot fire, which is
 * the failure Phase 8.3 found in a suppressed axe rule and Phase 8.4 found in a mis-scoped axe root.
 * So the guard is run against fixtures: one that must fail, one that must pass, and the real
 * exempt pattern from `Calendar` — which must pass for the reason WCAG gives, not for convenience.
 */

const SCRIPT = join(process.cwd(), 'scripts', 'check-faded-foreground.mjs');
const workspace = mkdtempSync(join(tmpdir(), 'faded-guard-'));

afterAll(() => {
  rmSync(workspace, { recursive: true, force: true });
});

function runGuard(name: string, source: string): { code: number; output: string } {
  const dir = join(workspace, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'component.tsx'), source);
  try {
    const output = execFileSync('node', [SCRIPT, dir], { encoding: 'utf8', stdio: 'pipe' });
    return { code: 0, output };
  } catch (error) {
    const failure = error as { status: number; stderr: string; stdout: string };
    return { code: failure.status, output: `${failure.stdout}${failure.stderr}` };
  }
}

describe('the faded foreground guard', () => {
  it('fails on a faded foreground token used for readable text', () => {
    const { code, output } = runGuard(
      'bad',
      `export const Example = () => (
        <p className="text-muted-foreground/70">Important information</p>
      );\n`,
    );
    expect(code, 'the guard passed source it exists to reject').toBe(1);
    expect(output).toContain('text-muted-foreground/70');
    expect(output).toContain('component.tsx:2');
    expect(output).toContain('opacity=70%');
  });

  it('passes the same text with the token at full strength', () => {
    const { code } = runGuard(
      'good',
      `export const Example = () => (
        <p className="text-muted-foreground">Important information</p>
      );\n`,
    );
    expect(code).toBe(0);
  });

  it('passes the inactive-control pattern Calendar actually uses', () => {
    /*
     * Copied from `calendar.tsx`, not invented for the test. The day is `aria-disabled` and the
     * fade applies only when it is inactive, which WCAG 1.4.3 excludes from the contrast
     * requirement. Phase 8.4 recorded this as deferred and Phase 8.5 must not "fix" it to raise a
     * ratio nobody is required to meet.
     */
    const { code } = runGuard(
      'exempt',
      `export const Example = ({ disabled }: { disabled: boolean }) => (
        <button
          aria-disabled={disabled || undefined}
          className={cn(disabled && 'cursor-not-allowed text-muted-foreground/30')}
        />
      );\n`,
    );
    expect(code).toBe(0);
  });

  it('does not let any conditional borrow the disabled exemption', () => {
    // The exemption is for inactive controls, not for "the class is behind an if".
    const { code, output } = runGuard(
      'not-exempt',
      `export const Example = ({ compact }: { compact: boolean }) => (
        <p className={cn(compact && 'text-muted-foreground/70')}>Readable metadata</p>
      );\n`,
    );
    expect(code, 'a non-disabled condition must not exempt faded text').toBe(1);
    expect(output).toContain('text-muted-foreground/70');
  });

  it('ignores a faded non-text property', () => {
    // Fading a border or a background is a graphic, judged at 3:1 under 1.4.11 — out of scope here.
    const { code } = runGuard(
      'graphic',
      `export const Example = () => <div className="border-primary/30 bg-primary/15" />;\n`,
    );
    expect(code).toBe(0);
  });
});
