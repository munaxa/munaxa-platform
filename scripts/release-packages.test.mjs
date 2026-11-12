// node --test scripts/release-packages.test.mjs
//
// The release publishes exactly the 13 lockstep packages, and the workflow cannot publish anything
// else, from anywhere but main, or in a dry run. No network, no registry, no dispatch.
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { EXPECTED_COUNT, gateLockstep, releasePackages } from './release-packages.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const THIRTEEN = [
  '@munaxa/types',
  '@munaxa/interfaces',
  '@munaxa/crypto',
  '@munaxa/config',
  '@munaxa/cache',
  '@munaxa/logging',
  '@munaxa/audit',
  '@munaxa/rbac',
  '@munaxa/session',
  '@munaxa/security',
  '@munaxa/notifications',
  '@munaxa/auth',
  '@munaxa/conformance',
];

test('the repository releases exactly the 13 lockstep packages at one version', () => {
  const { packages, problems } = releasePackages(ROOT);
  assert.deepEqual(problems, []);
  assert.equal(EXPECTED_COUNT, 13);
  assert.deepEqual(packages.map((p) => p.name).sort(), [...THIRTEEN].sort());
  assert.equal(new Set(packages.map((p) => p.version)).size, 1);
  for (const p of packages) assert.match(p.dir, /^packages\/platform\//);
});

test('licensing, the platform, the façades and the tooling packages are never in the release', () => {
  const names = releasePackages(ROOT).packages.map((p) => p.name);
  for (const outside of [
    '@munaxa/licensing',
    '@munaxa/platform',
    '@munaxa/ui',
    '@munaxa/icons',
    '@munaxa/theme',
    '@munaxa/tokens',
    '@munaxa/typography',
    '@munaxa/utils',
    '@munaxa/config-eslint',
    '@munaxa/config-typescript',
  ]) {
    assert.ok(!names.includes(outside), `${outside} must not be released`);
  }
});

test('the release gate (verify-release LOCKSTEP) lists the same 13', () => {
  assert.deepEqual(gateLockstep(ROOT).sort(), [...THIRTEEN].sort());
});

// --- The rules, on a scratch copy -------------------------------------------------------------

const scratch = (edit) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'release-packages-'));
  mkdirSync(path.join(dir, '.changeset'));
  mkdirSync(path.join(dir, 'scripts'));
  cpSync(path.join(ROOT, '.changeset/config.json'), path.join(dir, '.changeset/config.json'));
  cpSync(
    path.join(ROOT, 'scripts/verify-release.mjs'),
    path.join(dir, 'scripts/verify-release.mjs'),
  );
  for (const name of [...THIRTEEN, '@munaxa/licensing']) {
    const short = name.split('/')[1];
    const pkgDir = path.join(dir, 'packages/platform', short);
    mkdirSync(pkgDir, { recursive: true });
    const version = short === 'licensing' ? '0.2.0' : '2.5.0';
    writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify({ name, version }));
  }
  edit(dir);
  try {
    return releasePackages(dir).problems.join('\n');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};
const editJson = (file, change) =>
  writeFileSync(file, JSON.stringify(change(JSON.parse(readFileSync(file, 'utf8')))));

test('a scratch copy of the real layout passes', () => {
  assert.equal(
    scratch(() => undefined),
    '',
  );
});

test('a 14th package in the changeset group is refused', () => {
  const problems = scratch((dir) =>
    editJson(path.join(dir, '.changeset/config.json'), (c) => ({
      ...c,
      fixed: [[...c.fixed[0], '@munaxa/licensing']],
    })),
  );
  assert.match(problems, /approved for 13/);
  assert.match(problems, /LOCKSTEP differ/);
});

test('a package missing from the changeset group is refused', () => {
  const problems = scratch((dir) =>
    editJson(path.join(dir, '.changeset/config.json'), (c) => ({
      ...c,
      fixed: [c.fixed[0].slice(1)],
    })),
  );
  assert.match(problems, /approved for 13/);
});

test('a private lockstep package is refused', () => {
  const problems = scratch((dir) =>
    editJson(path.join(dir, 'packages/platform/auth/package.json'), (p) => ({
      ...p,
      private: true,
    })),
  );
  assert.match(problems, /@munaxa\/auth is private/);
});

test('lockstep packages at two versions are refused', () => {
  const problems = scratch((dir) =>
    editJson(path.join(dir, 'packages/platform/security/package.json'), (p) => ({
      ...p,
      version: '2.4.1',
    })),
  );
  assert.match(problems, /several versions/);
});

test('a lockstep name outside packages/platform is refused', () => {
  const problems = scratch((dir) => {
    rmSync(path.join(dir, 'packages/platform/cache'), { recursive: true });
    mkdirSync(path.join(dir, 'tooling/cache'), { recursive: true });
    writeFileSync(
      path.join(dir, 'tooling/cache/package.json'),
      JSON.stringify({ name: '@munaxa/cache', version: '2.5.0' }),
    );
  });
  assert.match(problems, /not under packages\/platform/);
});

// --- The workflow -----------------------------------------------------------------------------

const workflow = readFileSync(path.join(ROOT, '.github/workflows/release.yml'), 'utf8');
/** Steps of the one job, split at their `- name:` / `- uses:` lines. */
const steps = workflow
  .split(/\n(?= {6}- (?:name|uses):)/)
  .slice(1)
  .map((s) => s.trim());
const step = (name) => {
  const found = steps.filter((s) => s.startsWith(`- name: ${name}`));
  assert.equal(found.length, 1, `exactly one step named ${name}`);
  return found[0];
};

test('the workflow runs only on a manual dispatch', () => {
  const on = workflow.slice(workflow.indexOf('\non:'), workflow.indexOf('\nconcurrency:'));
  assert.match(on, /workflow_dispatch:/);
  for (const trigger of [
    'push:',
    'pull_request',
    'release:',
    'schedule:',
    'workflow_run',
    'tags',
  ]) {
    assert.ok(!on.includes(trigger), `no ${trigger} trigger`);
  }
  assert.match(on, /dry_run:[\s\S]*default: true/);
});

test('nothing is published or packed by a path glob', () => {
  assert.ok(
    !/--filter\s+['"]?\.\/(packages|tooling)/.test(workflow),
    'no ./packages/** or ./tooling/** filter',
  );
  assert.ok(
    !/changeset publish|pnpm (run )?release(\s|$)/m.test(workflow),
    'no changeset publish (it publishes every unpublished package)',
  );
});

test('publishing is refused off main or off a dispatch, before anything else runs', () => {
  const guard = step('Refuse to publish from a ref other than main');
  assert.equal(steps[0], guard, 'the guard is the first step');
  assert.match(guard, /!inputs\.dry_run/);
  assert.match(guard, /github\.ref != 'refs\/heads\/main'/);
  assert.match(guard, /github\.event_name != 'workflow_dispatch'/);
  assert.match(guard, /exit 1/);
});

test('the publish step publishes the 13 only, only from main, only when not a dry run', () => {
  const publish = step('Publish');
  assert.match(
    publish,
    /if: \$\{\{ !inputs\.dry_run && github\.event_name == 'workflow_dispatch' && github\.ref == 'refs\/heads\/main' \}\}/,
  );
  assert.match(publish, /FILTERS: \$\{\{ steps\.packages\.outputs\.filters \}\}/);
  assert.match(publish, /pnpm -r \$FILTERS publish --no-git-checks --access restricted/);
  assert.equal(
    (workflow.match(/ publish --no-git-checks/g) ?? []).length,
    1,
    'one publish command',
  );
});

test('the dry run packs the same 13 and holds no registry token', () => {
  const pack = step('Pack only (dry run)');
  assert.match(pack, /if: \$\{\{ inputs\.dry_run \}\}/);
  assert.match(pack, /pnpm -r \$FILTERS exec npm pack --dry-run/);
  assert.ok(!pack.includes('NODE_AUTH_TOKEN'), 'no token in the dry run');
  assert.ok(
    !/\bpublish\b/.test(pack.replace(/^- name:.*$/m, '')),
    'the dry run never calls publish',
  );
});

test('the release gate and the package list run before either mode', () => {
  const order = steps.map((s) => s.split('\n')[0]);
  const at = (name) => order.findIndex((l) => l === `- name: ${name}`);
  assert.ok(at('Release manifest check') > 0);
  assert.ok(at('The packages of this release') > at('Release manifest check'));
  assert.ok(at('Pack only (dry run)') > at('The packages of this release'));
  assert.ok(at('Publish') > at('The packages of this release'));
  assert.match(
    step('The packages of this release'),
    /node scripts\/release-packages\.mjs --filters/,
  );
});

test('the checkout keeps no credential and a release cannot run twice at once', () => {
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /concurrency:\n {2}group: release\n {2}cancel-in-progress: false/);
});
