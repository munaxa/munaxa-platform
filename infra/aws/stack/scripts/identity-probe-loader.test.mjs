// Unit tests for identity-probe-loader.mjs: node --test infra/aws/stack/scripts/
// No network: each case runs the loader exactly as the task definition does
// (`node --input-type=module -e <text>`), with the pin written in the way Terraform writes it, and
// with global fetch replaced by a stub preloaded through --import.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';

const LOADER = readFileSync(new URL('./identity-probe-loader.mjs', import.meta.url), 'utf8');
const COMMIT = '0123456789abcdef0123456789abcdef01234567';
const URL_EXPECTED = `https://raw.githubusercontent.com/munaxa/munaxa-platform/${COMMIT}/infra/aws/stack/supporting/identity-session-probe.mjs`;

// The stub serves the file STUB_BODY_FILE with STUB_STATUS, or throws when STUB_THROW is set, and reports
// each request on stderr so the test can check the URL and options.
const STUB = `
globalThis.fetch = async (url, options) => {
  process.stderr.write('FETCH ' + JSON.stringify({ url, redirect: options?.redirect, signal: !!options?.signal }) + '\\n');
  if (process.env.STUB_THROW) throw new Error('network down');
  const body = (await import('node:fs')).readFileSync(process.env.STUB_BODY_FILE);
  return new Response(body, { status: Number(process.env.STUB_STATUS ?? 200) });
};
`;
const PRELOAD = `data:text/javascript;base64,${Buffer.from(STUB).toString('base64')}`;

// Test fixtures only; the loader itself never writes a file.
const WORK = mkdtempSync(join(tmpdir(), 'probe-loader-'));
let bodies = 0;
after(() => rmSync(WORK, { recursive: true, force: true }));

const sha256 = (text) => createHash('sha256').update(text).digest('hex');

// What Terraform does (identity-probe.tf, local.identity_probe_loader).
const pinned = (commit, digest) =>
  LOADER.replace('__PROBE_COMMIT__', commit).replace('__PROBE_SHA256__', digest);

function run(program, { body = '', status = 200, env = {}, throws = false } = {}) {
  const childEnv = { PATH: process.env.PATH, STUB_STATUS: String(status), ...env };
  childEnv.STUB_BODY_FILE = join(WORK, `body-${++bodies}`);
  writeFileSync(childEnv.STUB_BODY_FILE, body);
  if (throws) childEnv.STUB_THROW = '1';
  const r = spawnSync(
    process.execPath,
    ['--import', PRELOAD, '--input-type=module', '-e', program],
    { env: childEnv, encoding: 'utf8', timeout: 20000 },
  );
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

const PROBE_OK = `export default async function main(env) {
  process.stdout.write('PASS demo ' + (env.PROBE_HOST ?? '-') + '\\n');
  return 0;
}`;

test('the loader is written for Node 22', () => {
  assert.ok(
    process.versions.node.startsWith('22.'),
    `run these tests on Node 22, not ${process.version}`,
  );
});

test('a verified probe is imported from memory and its exit code is kept', () => {
  const r = run(pinned(COMMIT, sha256(PROBE_OK)), {
    body: PROBE_OK,
    env: { PROBE_HOST: 'id.test.munaxa.com' },
  });
  assert.equal(r.code, 0);
  assert.equal(r.stdout, 'PASS demo id.test.munaxa.com\n');
  const fetches = r.stderr.split('\n').filter((l) => l.startsWith('FETCH '));
  assert.equal(fetches.length, 1);
  assert.deepEqual(JSON.parse(fetches[0].slice(6)), {
    url: URL_EXPECTED,
    redirect: 'error',
    signal: true,
  });
});

test('a failing probe keeps its own exit code', () => {
  const probe = 'export default async () => { process.stdout.write("FAIL demo x\\n"); return 1; };';
  const r = run(pinned(COMMIT, sha256(probe)), { body: probe });
  assert.equal(r.code, 1);
  assert.equal(r.stdout, 'FAIL demo x\n');
});

test('a non-integer return is a failure', () => {
  const probe = 'export default async () => "ok";';
  assert.equal(run(pinned(COMMIT, sha256(probe)), { body: probe }).code, 1);
});

test('the probe may import node: built-ins from its data: URL', () => {
  const probe =
    "import https from 'node:https'; import { X509Certificate } from 'node:crypto';\n" +
    'export default async () => (typeof https.request === "function" && typeof X509Certificate === "function" ? 0 : 1);';
  assert.equal(run(pinned(COMMIT, sha256(probe)), { body: probe }).code, 0);
});

const refusals = [
  ['an unpinned loader (placeholders left in)', () => run(LOADER, { body: PROBE_OK }), 'commit'],
  ['a short commit', () => run(pinned('0123456', sha256(PROBE_OK)), { body: PROBE_OK }), 'commit'],
  [
    'an uppercase SHA-256',
    () => run(pinned(COMMIT, sha256(PROBE_OK).toUpperCase()), { body: PROBE_OK }),
    'sha256-format',
  ],
  [
    'a checksum mismatch',
    () => run(pinned(COMMIT, sha256(PROBE_OK)), { body: PROBE_OK + '\n// changed' }),
    'checksum',
  ],
  [
    'a 404',
    () => run(pinned(COMMIT, sha256(PROBE_OK)), { body: 'Not Found', status: 404 }),
    'status-404',
  ],
  ['a network error', () => run(pinned(COMMIT, sha256(PROBE_OK)), { throws: true }), 'download'],
  [
    'a body over 256 KiB',
    () => {
      const big = 'x'.repeat(262145);
      return run(pinned(COMMIT, sha256(big)), { body: big });
    },
    'too-large',
  ],
  [
    'a module without a default export',
    () => {
      const probe = 'export const x = 1;';
      return run(pinned(COMMIT, sha256(probe)), { body: probe });
    },
    'no-entry',
  ],
  [
    'a module that does not parse',
    () => {
      const probe = 'export default (';
      return run(pinned(COMMIT, sha256(probe)), { body: probe });
    },
    'import',
  ],
  [
    'NODE_TLS_REJECT_UNAUTHORIZED in the environment',
    () =>
      run(pinned(COMMIT, sha256(PROBE_OK)), {
        body: PROBE_OK,
        env: { NODE_TLS_REJECT_UNAUTHORIZED: '0' },
      }),
    'unsafe-environment',
  ],
];

for (const [name, go, code] of refusals) {
  test(`refuses ${name}: one sanitised line, exit 3, probe not run`, () => {
    const r = go();
    assert.equal(r.code, 3);
    assert.equal(r.stdout, `FAIL probe-source ${code}\n`);
  });
}

test('a refused checksum never imports, so a tampered probe cannot print', () => {
  const evil = 'process.stdout.write("LEAK\\n"); export default async () => 0;';
  const r = run(pinned(COMMIT, sha256(PROBE_OK)), { body: evil });
  assert.equal(r.stdout, 'FAIL probe-source checksum\n');
});

test('a probe that throws prints one line, never the error or its message', () => {
  const probe = 'export default async () => { throw new Error("secret-in-message"); };';
  const r = run(pinned(COMMIT, sha256(probe)), { body: probe });
  assert.equal(r.code, 3);
  assert.equal(r.stdout, 'FAIL probe unhandled\n');
  assert.ok(!r.stderr.includes('secret-in-message'));
});

test('the loader text never disables certificate checks and never prints the environment', () => {
  for (const banned of [
    'rejectUnauthorized',
    'NODE_TLS_REJECT_UNAUTHORIZED = ',
    'console.',
    'JSON.stringify(process.env',
    'writeFile',
  ]) {
    assert.ok(!LOADER.includes(banned), `loader must not contain ${banned}`);
  }
  assert.equal((LOADER.match(/__PROBE_COMMIT__/g) ?? []).length, 1);
  assert.equal((LOADER.match(/__PROBE_SHA256__/g) ?? []).length, 1);
});
