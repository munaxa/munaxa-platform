#!/usr/bin/env node
/**
 * The packages a release publishes, and nothing else.
 *
 * The release workflow used to publish every `packages/**` and `tooling/**` package whose version
 * was missing from the registry: the platform, the façades, the config packages and
 * `@munaxa/licensing` could go out by accident with a security release. A version can never be
 * republished, so an accident is permanent. This script is the one list the workflow publishes
 * and packs:
 *
 * - the lockstep group, `fixed[0]` of `.changeset/config.json` (13 packages);
 * - which must equal `LOCKSTEP` in `scripts/verify-release.mjs` (the release gate);
 * - each a workspace package under `packages/platform/`, not private, at one shared version.
 *
 * `@munaxa/licensing` (0.2.0) and every façade or tooling package are outside it on purpose:
 * releasing one of them is a separate, reviewed change to this list.
 *
 *   node scripts/release-packages.mjs              # names, one per line
 *   node scripts/release-packages.mjs --filters    # pnpm arguments: --filter <name> ...
 *   node scripts/release-packages.mjs --versions   # name@version, one per line
 *
 * Exits non-zero, printing why, when any rule above does not hold.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The number of packages the 2.x lockstep release is approved for. */
export const EXPECTED_COUNT = 13;

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));

/** Every workspace package: name → { dir, manifest }. */
export const workspacePackages = (root = ROOT) => {
  const found = new Map();
  for (const base of ['packages', 'packages/platform', 'tooling']) {
    const dir = path.join(root, base);
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir)) {
      const pkgDir = path.join(dir, entry);
      const manifestPath = path.join(pkgDir, 'package.json');
      if (!statSync(pkgDir).isDirectory() || !existsSync(manifestPath)) continue;
      const manifest = readJson(manifestPath);
      found.set(manifest.name, { dir: path.relative(root, pkgDir), manifest });
    }
  }
  return found;
};

/** The LOCKSTEP set declared in the release gate, read from its source. */
export const gateLockstep = (root = ROOT) => {
  const source = readFileSync(path.join(root, 'scripts/verify-release.mjs'), 'utf8');
  const block = source.match(/const LOCKSTEP = new Set\(\[([\s\S]*?)\]\)/);
  if (!block) throw new Error('scripts/verify-release.mjs: LOCKSTEP not found');
  return [...block[1].matchAll(/'(@munaxa\/[a-z-]+)'/g)].map((m) => m[1]);
};

export const releasePackages = (root = ROOT) => {
  const problems = [];
  const config = readJson(path.join(root, '.changeset/config.json'));
  const fixed = Array.isArray(config.fixed) && config.fixed.length === 1 ? config.fixed[0] : null;
  if (!fixed) problems.push('.changeset/config.json must have exactly one fixed group');
  const names = fixed ?? [];

  if (names.length !== EXPECTED_COUNT) {
    problems.push(
      `the fixed group has ${names.length} packages, the release is approved for ${EXPECTED_COUNT}`,
    );
  }
  if (new Set(names).size !== names.length) problems.push('the fixed group lists a package twice');

  const gate = gateLockstep(root);
  const missingFromGate = names.filter((n) => !gate.includes(n));
  const missingFromFixed = gate.filter((n) => !names.includes(n));
  if (missingFromGate.length || missingFromFixed.length) {
    problems.push(
      `the fixed group and verify-release LOCKSTEP differ (only in fixed: ${missingFromGate.join(', ') || 'none'}; only in LOCKSTEP: ${missingFromFixed.join(', ') || 'none'})`,
    );
  }

  const workspace = workspacePackages(root);
  const versions = new Set();
  const resolved = [];
  for (const name of names) {
    const pkg = workspace.get(name);
    if (!pkg) {
      problems.push(`${name} is not a workspace package`);
      continue;
    }
    if (!pkg.dir.startsWith(`packages${path.sep}platform${path.sep}`)) {
      problems.push(`${name} is in ${pkg.dir}, not under packages/platform/`);
    }
    if (pkg.manifest.private) problems.push(`${name} is private`);
    versions.add(pkg.manifest.version);
    resolved.push({ name, version: pkg.manifest.version, dir: pkg.dir });
  }
  if (versions.size > 1)
    problems.push(`the lockstep packages are at several versions: ${[...versions].join(', ')}`);

  return { packages: resolved, problems };
};

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const { packages, problems } = releasePackages();
  if (problems.length > 0) {
    for (const p of problems) console.error(`release-packages: ${p}`);
    process.exit(1);
  }
  const mode = process.argv[2] ?? '--names';
  if (mode === '--filters') console.log(packages.map((p) => `--filter ${p.name}`).join(' '));
  else if (mode === '--versions') for (const p of packages) console.log(`${p.name}@${p.version}`);
  else if (mode === '--names') for (const p of packages) console.log(p.name);
  else {
    console.error(`release-packages: unknown option ${mode}`);
    process.exit(2);
  }
}
