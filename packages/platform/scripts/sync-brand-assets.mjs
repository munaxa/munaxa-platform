#!/usr/bin/env node
/**
 * Copy a product's approved brand artwork out of the platform and into an application's `public/`.
 *
 *   node node_modules/@munaxa/platform/scripts/sync-brand-assets.mjs <product> <public-dir>
 *
 * Run it from a `prebuild`, so the artwork an application serves is always the artwork the
 * installed version of the platform ships — a stale logo committed into `public/` months ago is
 * exactly the drift the shared package exists to prevent.
 *
 * The destination mirrors `DEFAULT_ASSET_BASE` in `brand/products.ts`:
 *
 *   <public-dir>/branding/<product>/{logos,favicon,social}/…
 *
 * Copying rather than importing is deliberate. The platform is the *source* of the artwork, not a
 * runtime CDN: the application owns caching, hashing and its own asset pipeline, and nothing in a
 * bundle ever resolves a PNG out of `node_modules`.
 */
import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// `group` is the corporate identity: the mark and the icons, no lockup. It is copied the same
// way, because a corporate site needs a favicon as much as a product does.
const PRODUCTS = ['group', 'school', 'work', 'docs'];
const BUCKETS = ['logos', 'favicon', 'social'];

const [product, publicDir] = process.argv.slice(2);

if (!product || !publicDir) {
  console.error('usage: sync-brand-assets.mjs <product> <public-dir>');
  process.exit(2);
}

if (!PRODUCTS.includes(product)) {
  console.error(`unknown brand "${product}" — expected one of ${PRODUCTS.join(', ')}`);
  process.exit(2);
}

const source = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'assets', product);
const destination = resolve(publicDir, 'branding', product);

if (!existsSync(source)) {
  console.error(`no artwork at ${source}`);
  process.exit(1);
}

// Replaced rather than merged: a bucket that has lost a file upstream must lose it here too,
// otherwise a renamed asset lingers and a stale path keeps resolving long after it stopped
// being the approved one.
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });

let copied = 0;
for (const bucket of BUCKETS) {
  const from = join(source, bucket);
  if (!existsSync(from)) continue;
  const files = (await readdir(from)).filter((name) => name.endsWith('.png'));
  if (files.length === 0) continue;
  await mkdir(join(destination, bucket), { recursive: true });
  for (const file of files) {
    await cp(join(from, file), join(destination, bucket, file));
    copied += 1;
  }
}

console.log(`branding: ${copied} ${product} assets → ${destination}`);
