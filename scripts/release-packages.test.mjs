// node --test scripts/release-packages.test.mjs
//
// The release publishes exactly the 13 lockstep packages, and the workflow cannot publish anything
// else, from anywhere but main, or in a dry run. No network, no registry, no dispatch.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
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
const jobsText = workflow.slice(workflow.indexOf('\njobs:\n'));
/** The text of one job: from its `  <id>:` line to the next job or the end. */
const job = (id) => {
  const start = jobsText.indexOf(`\n  ${id}:\n`);
  assert.ok(start >= 0, `job ${id} exists`);
  const rest = jobsText.slice(start + 1);
  const next = rest.slice(1).search(/\n {2}[a-z][a-z-]*:\n/);
  return next < 0 ? rest : rest.slice(0, next + 1);
};
/** Steps of one job, split at their `- name:` / `- uses:` lines. */
const stepsOf = (id) =>
  job(id)
    .split(/\n(?= {6}- (?:name|uses):)/)
    .slice(1)
    .map((s) => s.trim());
const stepOf = (id, name) => {
  const found = stepsOf(id).filter((s) => s.startsWith(`- name: ${name}`));
  assert.equal(found.length, 1, `exactly one step named ${name} in ${id}`);
  return found[0];
};
/** Shell lines of a step's `run:`, without comments. */
const commands = (stepText) =>
  stepText
    .split('\n')
    .filter(
      (l) =>
        /^\s{2,}\S/.test(l) &&
        !/^\s*#/.test(l) &&
        !/^\s*(- name|if|env|run|with|id|[A-Z_]+):/.test(l),
    );

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

test('there are exactly two jobs, one per mode', () => {
  assert.deepEqual(
    [...jobsText.matchAll(/\n {2}([a-z][a-z-]*):\n/g)].map((m) => m[1]),
    ['dry-run', 'publish'],
  );
  assert.match(job('dry-run'), /\n {4}if: \$\{\{ inputs\.dry_run \}\}\n/);
  assert.match(job('publish'), /\n {4}if: \$\{\{ !inputs\.dry_run \}\}\n/);
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

test('the dry run cannot write packages and never publishes', () => {
  const dry = job('dry-run');
  assert.match(dry, /\n {4}permissions:\n {6}contents: read\n {4}steps:/);
  assert.ok(!dry.includes('packages: write'), 'no packages: write in the dry run');
  assert.ok(!dry.includes('NODE_AUTH_TOKEN'), 'no registry token in the dry run');
  for (const s of stepsOf('dry-run')) {
    for (const line of commands(s)) {
      assert.ok(!/\bpublish\b/.test(line), `the dry run never runs publish: ${line}`);
    }
  }
  assert.match(
    stepOf('dry-run', 'Pack only (dry run)'),
    /pnpm -r \$FILTERS exec npm pack --dry-run/,
  );
});

test('publishing is refused off main or off a dispatch, before anything else runs', () => {
  const guard = stepOf('publish', 'Refuse to publish from a ref other than main');
  assert.equal(stepsOf('publish')[0], guard, 'the guard is the first step');
  assert.match(guard, /github\.ref != 'refs\/heads\/main'/);
  assert.match(guard, /github\.event_name != 'workflow_dispatch'/);
  assert.match(guard, /exit 1/);
});

test('the publish step publishes the 13 only, only from main, only when not a dry run', () => {
  const publish = stepOf('publish', 'Publish');
  assert.match(
    publish,
    /if: \$\{\{ !inputs\.dry_run && github\.event_name == 'workflow_dispatch' && github\.ref == 'refs\/heads\/main' \}\}/,
  );
  assert.match(publish, /FILTERS: \$\{\{ steps\.packages\.outputs\.filters \}\}/);
  assert.match(publish, /pnpm -r \$FILTERS publish --no-git-checks --access restricted/);
  // No other publish command anywhere, in any spelling (npm publish, pnpm publish, ...).
  for (const id of ['dry-run', 'publish']) {
    for (const s of stepsOf(id)) {
      if (id === 'publish' && s === publish) continue;
      for (const line of commands(s)) {
        assert.ok(!/\bpublish\b/.test(line), `publish only in the Publish step: ${line}`);
      }
    }
  }
  assert.equal(
    commands(publish).filter((l) => /\bpublish\b/.test(l)).length,
    1,
    'one publish command',
  );
});

test('the release gate and the package list run before either mode', () => {
  for (const [id, final] of [
    ['dry-run', 'Pack only (dry run)'],
    ['publish', 'Publish'],
  ]) {
    const order = stepsOf(id).map((s) => s.split('\n')[0]);
    const at = (name) => order.findIndex((l) => l === `- name: ${name}`);
    assert.ok(at('Release manifest check') > 0, id);
    assert.ok(at('The packages of this release') > at('Release manifest check'), id);
    assert.ok(at(final) > at('The packages of this release'), id);
    const list = stepOf(id, 'The packages of this release');
    assert.match(list, /filters="\$\(node scripts\/release-packages\.mjs --filters\)"/);
    // set -e does not see a failure inside `echo "...$(...)"`: the list must be assigned first.
    assert.ok(!/echo "[^"]*\$\(/.test(list), 'no command substitution inside echo');
  }
});

/** The empty-list guard of a step, run on its own in bash. */
const runGuard = (stepText, filters) => {
  const run = stepText.slice(stepText.indexOf('run: |') + 'run: |'.length);
  const body = run.split('\n').map((l) => l.replace(/^ {10}/, ''));
  const end = body.findIndex((l) => l.startsWith('fi'));
  assert.ok(end > 0, 'the step has the empty-list guard');
  const script = body.slice(0, end + 1).join('\n');
  return spawnSync('bash', ['-c', script], { env: { PATH: process.env.PATH, FILTERS: filters } })
    .status;
};

test('pack and publish refuse an empty or short package list instead of acting on the workspace', () => {
  const thirteen = releasePackages(ROOT)
    .packages.map((p) => `--filter ${p.name}`)
    .join(' ');
  const twelve = thirteen.split(' --filter ').slice(0, 12).join(' --filter ');
  for (const s of [stepOf('dry-run', 'Pack only (dry run)'), stepOf('publish', 'Publish')]) {
    assert.equal(runGuard(s, ''), 1, 'empty list refused');
    assert.equal(runGuard(s, twelve), 1, 'twelve refused');
    assert.equal(runGuard(s, `${thirteen} --filter @munaxa/licensing`), 1, 'fourteen refused');
    assert.equal(runGuard(s, `${thirteen} --filter ./packages/**`), 1, 'an extra selector refused');
    assert.equal(runGuard(s, `${thirteen} --recursive`), 1, 'an extra flag refused');
    assert.equal(runGuard(s, `${thirteen} `), 1, 'trailing text refused');
    assert.equal(runGuard(s, thirteen), 0, 'the thirteen accepted');
  }
});

test('every action is pinned to a commit', () => {
  const uses = [...workflow.matchAll(/uses: (\S+)/g)].map((m) => m[1]);
  assert.ok(uses.length >= 6);
  for (const u of uses) assert.match(u, /@[0-9a-f]{40}$/, `${u} pinned by SHA`);
});

test('the checkout keeps no credential and a release cannot run twice at once', () => {
  assert.equal((workflow.match(/persist-credentials: false/g) ?? []).length, 2);
  assert.match(workflow, /concurrency:\n {2}group: release\n {2}cancel-in-progress: false/);
});
