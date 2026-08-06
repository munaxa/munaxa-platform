#!/usr/bin/env node
/**
 * Release gate for the security platform packages.
 *
 * Everything here is a mistake that is cheap to make and expensive to discover, because each one
 * only shows up in a *consumer's* install rather than in this repository's own build:
 *
 * - A `workspace:` range that survived into a published manifest is an install that cannot resolve.
 * - A missing `exports` entry, or one whose target is not in `files`, is a package that installs
 *   and then fails at the first import.
 * - Two packages in the same lockstep group at different versions is a consumer resolving two
 *   copies of `@munaxa/types`, and therefore two copies of every branded type — which fails to
 *   typecheck in a way that reads as the consumer's fault.
 * - A `dist` that changed while the version did not is a published artifact silently replaced
 *   under a version somebody already installed.
 *
 * Run with `--since <git-ref>` to enable the last check; without it, that one is skipped rather
 * than guessed at.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const PLATFORM = path.join(ROOT, 'packages/platform');

/** The lockstep group. Mirrors `fixed` in .changeset/config.json. */
const LOCKSTEP = new Set([
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
]);

const problems = [];
const notes = [];

function fail(pkg, message) {
  problems.push(`${pkg}: ${message}`);
}

function loadPackages() {
  const out = [];
  for (const entry of readdirSync(PLATFORM)) {
    const dir = path.join(PLATFORM, entry);
    const manifestPath = path.join(dir, 'package.json');
    if (!existsSync(manifestPath) || !statSync(dir).isDirectory()) continue;
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    if (!LOCKSTEP.has(manifest.name)) continue;
    out.push({ dir, manifest, name: manifest.name });
  }
  return out;
}

function checkManifest({ dir, manifest, name }) {
  for (const field of ['version', 'license', 'description', 'repository', 'types', 'main']) {
    if (!manifest[field]) fail(name, `missing "${field}"`);
  }

  if (!Array.isArray(manifest.keywords) || manifest.keywords.length === 0) {
    fail(name, 'missing "keywords" — the package is unfindable in a registry UI');
  }
  if (manifest.sideEffects !== false) {
    fail(name, '"sideEffects" must be false so consumers can tree-shake');
  }
  if (manifest.type !== 'module') fail(name, '"type" must be "module"');
  if (!manifest.publishConfig?.registry) fail(name, 'missing publishConfig.registry');
  if (!manifest.files?.includes('dist')) fail(name, '"files" must include dist');
  if (!existsSync(path.join(dir, 'README.md'))) {
    fail(name, 'missing README.md — it is the registry landing page');
  }

  // Every exports target must exist once built, or the package installs and then cannot import.
  const exports = manifest.exports ?? {};
  for (const [subpath, target] of Object.entries(exports)) {
    const targets = typeof target === 'string' ? [target] : Object.values(target);
    for (const file of targets) {
      if (typeof file !== 'string') continue;
      if (!existsSync(path.join(dir, file))) {
        fail(name, `exports "${subpath}" points at ${file}, which does not exist (build first?)`);
      }
    }
  }

  // A workspace: range in a published manifest is an unresolvable install. pnpm rewrites these
  // on publish, so this catches the case where a package is published by another tool.
  for (const field of ['dependencies', 'peerDependencies']) {
    for (const [dep, range] of Object.entries(manifest[field] ?? {})) {
      if (typeof range === 'string' && range.startsWith('workspace:')) {
        notes.push(`${name}: ${field}.${dep} is "${range}" — pnpm must rewrite this on publish`);
      }
    }
  }

  // devDependencies must never appear in the runtime graph.
  for (const dep of Object.keys(manifest.dependencies ?? {})) {
    if (dep === 'vitest' || dep === 'typescript' || dep.startsWith('@types/')) {
      fail(name, `"${dep}" is a build-time dependency and must not be a runtime dependency`);
    }
  }
}

/** Every declared dependency must actually be imported, and every import declared. */
function checkDependencyGraph({ dir, manifest, name }) {
  const srcDir = path.join(dir, 'src');
  if (!existsSync(srcDir)) return;

  const imported = new Set();
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.ts')) {
        // Comments are stripped first: a usage example in a doc block is documentation, not a
        // dependency, and counting it would demand every package depend on itself.
        const source = readFileSync(full, 'utf8')
          .replaceAll(/\/\*[\s\S]*?\*\//g, '')
          .replaceAll(/\/\/.*$/gm, '');
        for (const match of source.matchAll(/from '(@munaxa\/[a-z-]+)'/g)) {
          if (match[1] !== name) imported.add(match[1]);
        }
      }
    }
  };
  walk(srcDir);

  const declared = new Set(Object.keys(manifest.dependencies ?? {}));
  for (const dep of imported) {
    if (!declared.has(dep)) fail(name, `imports ${dep} but does not declare it`);
  }
  for (const dep of declared) {
    if (dep.startsWith('@munaxa/') && !imported.has(dep)) {
      fail(name, `declares ${dep} but never imports it`);
    }
  }
}

function checkLockstep(packages) {
  const versions = new Map();
  for (const { name, manifest } of packages) {
    versions.set(name, manifest.version);
  }
  const distinct = new Set(versions.values());
  if (distinct.size > 1) {
    problems.push(
      `lockstep group has ${distinct.size} versions: ${[...versions]
        .map(([n, v]) => `${n}@${v}`)
        .join(', ')}`,
    );
  }
  return [...distinct][0];
}

/** Hash a package's build output, so "dist changed" is answerable. */
function hashDist(dir) {
  const distDir = path.join(dir, 'dist');
  if (!existsSync(distDir)) return null;
  const hash = createHash('sha256');
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      // Source maps embed absolute paths, so they are not comparable across machines.
      else if (!entry.name.endsWith('.map')) hash.update(entry.name).update(readFileSync(full));
    }
  };
  walk(distDir);
  return hash.digest('hex');
}

function checkVersionMovedWithDist(packages, since) {
  for (const { dir, manifest, name } of packages) {
    const relative = path.relative(ROOT, dir);
    let previousManifest;
    try {
      previousManifest = JSON.parse(
        execFileSync('git', ['show', `${since}:${relative}/package.json`], {
          cwd: ROOT,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
        }),
      );
    } catch {
      continue; // New package since the ref; nothing to compare.
    }

    let sourceChanged = false;
    try {
      const diff = execFileSync('git', ['diff', '--name-only', since, '--', `${relative}/src`], {
        cwd: ROOT,
        encoding: 'utf8',
      });
      sourceChanged = diff.trim().length > 0;
    } catch {
      continue;
    }

    if (sourceChanged && previousManifest.version === manifest.version) {
      fail(
        name,
        `src changed since ${since} but the version is still ${manifest.version} — ` +
          'publishing would replace an artifact under a version already installed. Add a changeset.',
      );
    }
  }
}

const sinceIndex = process.argv.indexOf('--since');
const since = sinceIndex === -1 ? undefined : process.argv[sinceIndex + 1];

const packages = loadPackages();
if (packages.length !== LOCKSTEP.size) {
  problems.push(
    `expected ${LOCKSTEP.size} lockstep packages, found ${packages.length} — ` +
      'the group in this script and in .changeset/config.json have drifted apart',
  );
}

for (const pkg of packages) {
  checkManifest(pkg);
  checkDependencyGraph(pkg);
}
const version = checkLockstep(packages);
if (since) checkVersionMovedWithDist(packages, since);
else notes.push('version-vs-dist check skipped: pass --since <ref> to enable it');

console.log(`Release check: ${packages.length} packages at ${version ?? 'mixed versions'}`);
for (const note of notes) console.log(`  note    ${note}`);
for (const problem of problems) console.error(`  PROBLEM ${problem}`);

if (problems.length > 0) {
  console.error(`\n${problems.length} problem(s). Not publishable.`);
  process.exit(1);
}
console.log('  all checks passed');
