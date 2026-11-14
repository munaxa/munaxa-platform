// Unit tests for identity-probe-loader.mjs: node --test infra/aws/stack/scripts/
// No network: each case runs the loader exactly as the task definition does
// (`node --input-type=module -e <text>`), with the pin written in the way Terraform writes it, and
// with global fetch replaced by a stub preloaded through --import.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

function run(program, { body = '', status = 200, env = {}, throws = false, cwd } = {}) {
  const childEnv = { PATH: process.env.PATH, STUB_STATUS: String(status), ...env };
  childEnv.STUB_BODY_FILE = join(WORK, `body-${++bodies}`);
  writeFileSync(childEnv.STUB_BODY_FILE, body);
  if (throws) childEnv.STUB_THROW = '1';
  const r = spawnSync(
    process.execPath,
    ['--import', PRELOAD, '--input-type=module', '-e', program],
    { env: childEnv, encoding: 'utf8', timeout: 20000, ...(cwd === undefined ? {} : { cwd }) },
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

// --- Throwaway mode (BE-3, BE-4) ------------------------------------------------------------------
//
// A stub scripts/bootstrap-account.mjs in a temporary working directory stands in for the image's
// script. It records what it received (argv and environment names, and whether the URL arrived)
// into its own directory and prints what the real script prints, or fails as told by its own text.

const DB_URL = 'postgresql://identity_owner:synthetic-db-password@db.invalid:5432/identity';
const SUB = '3f2b9c1e-8d7a-4b6c-9e5f-0a1b2c3d4e5f';

function workdir(behaviour) {
  const dir = mkdtempSync(join(WORK, 'cwd-'));
  const scripts = join(dir, 'scripts');
  mkdirSync(scripts);
  writeFileSync(
    join(scripts, 'bootstrap-account.mjs'),
    `import { writeFileSync } from 'node:fs';
const behaviour = ${JSON.stringify(behaviour)};
const env = process.env;
writeFileSync(new URL('./received.json', import.meta.url), JSON.stringify({
  argv: process.argv.slice(2), names: Object.keys(env).sort(), url: env.DIRECT_DATABASE_URL,
  email: env.IDENTITY_OWNER_EMAIL, passwordLength: (env.IDENTITY_OWNER_PASSWORD ?? '').length,
}));
process.stderr.write('stderr noise ' + env.DIRECT_DATABASE_URL + '\\n');
if (behaviour.exit) { process.stdout.write('IDENTITY_OWNER_PASSWORD does not meet the password policy\\n'); process.exit(1); }
const created = behaviour.already ? 'Already bootstrapped.' : 'Created ' + env.IDENTITY_OWNER_EMAIL + ' in organisation munaxa-stage-e-checks.';
process.stdout.write(created + '\\n\\n  organisation  aaaaaaaa-0000-4000-8000-000000000000  (munaxa-stage-e-checks)\\n  sub           ' + (behaviour.sub ?? '${SUB}') + '\\n\\n');
`,
  );
  return { dir, received: () => JSON.parse(readFileSync(join(scripts, 'received.json'), 'utf8')) };
}

// The probe stub reports what it was called with: the credential's shape, never its value, and
// whether any database URL reached it through the env object or process.env.
const PROBE_ECHO = `export default async function main(env) {
  const leaked = ['DIRECT_DATABASE_URL', 'DATABASE_URL', 'DATABASE_MIGRATION_URL'].filter((n) => n in env || n in process.env);
  const shape = /^stage-e-[0-9a-f]{16}@stage-e\\.invalid$/.test(env.IDENTITY_OWNER_EMAIL ?? '') ? 'throwaway' : 'none';
  const inProcess = 'IDENTITY_OWNER_PASSWORD' in process.env ? 'yes' : 'no';
  process.stdout.write('PASS demo ' + shape + ' pw=' + (env.IDENTITY_OWNER_PASSWORD ?? '').length + ' leaked=' + leaked.join('+') + ' in-process=' + inProcess + '\\n');
  return 0;
}`;

test('throwaway mode: the account is created before the probe runs, the URL never reaches it', () => {
  const w = workdir({});
  const r = run(pinned(COMMIT, sha256(PROBE_ECHO)), {
    body: PROBE_ECHO,
    cwd: w.dir,
    env: { PROBE_ACCOUNT: 'throwaway', DIRECT_DATABASE_URL: DB_URL },
  });
  assert.equal(r.code, 0);
  assert.equal(r.stdout, `INFO throwaway-sub ${SUB}\nPASS demo throwaway pw=36 leaked= in-process=no\n`);
  const got = w.received();
  assert.deepEqual(got.argv, ['scripts/bootstrap-account.mjs', '--organisation', 'munaxa-stage-e-checks', '--organisation-name', 'Stage E checks'].slice(1));
  assert.equal(got.url, DB_URL);
  assert.match(got.email, /^stage-e-[0-9a-f]{16}@stage-e\.invalid$/);
  assert.equal(got.passwordLength, 36);
  // The child gets five names and nothing else from the task's environment.
  assert.deepEqual(got.names, ['DIRECT_DATABASE_URL', 'IDENTITY_OWNER_EMAIL', 'IDENTITY_OWNER_PASSWORD', 'NODE_ENV', 'PATH']);
  // The child's output, including its stderr, never reaches the task's log.
  assert.ok(!r.stdout.includes('synthetic-db-password') && !r.stderr.includes('synthetic-db-password'));
  assert.ok(!r.stdout.includes(got.email));
});

const throwawayRefusals = [
  ['no database URL', {}, {}, 'no-database-url'],
  ['a URL that is not PostgreSQL', {}, { DIRECT_DATABASE_URL: 'https://db.invalid/' }, 'no-database-url'],
  ['a bootstrap that exits non-zero (twice)', { exit: true }, { DIRECT_DATABASE_URL: DB_URL }, 'bootstrap-exit'],
  ['an account that already existed', { already: true }, { DIRECT_DATABASE_URL: DB_URL }, 'bootstrap-not-created'],
  ['a sub that is not a UUID', { sub: 'not-a-uuid' }, { DIRECT_DATABASE_URL: DB_URL }, 'bootstrap-no-sub'],
];

for (const [name, behaviour, env, code] of throwawayRefusals) {
  test(`throwaway mode refuses ${name}: one line, exit 3, probe not imported`, () => {
    const w = workdir(behaviour);
    const r = run(pinned(COMMIT, sha256(PROBE_ECHO)), { body: PROBE_ECHO, cwd: w.dir, env: { PROBE_ACCOUNT: 'throwaway', ...env } });
    assert.equal(r.code, 3);
    assert.equal(r.stdout, `FAIL throwaway-account ${code}\n`);
    assert.ok(!r.stdout.includes('synthetic-db-password'));
  });
}

test('throwaway mode creates nothing when the probe source is refused', () => {
  const w = workdir({});
  const r = run(pinned(COMMIT, sha256(PROBE_ECHO)), {
    body: PROBE_ECHO + '\n// changed',
    cwd: w.dir,
    env: { PROBE_ACCOUNT: 'throwaway', DIRECT_DATABASE_URL: DB_URL },
  });
  assert.equal(r.stdout, 'FAIL probe-source checksum\n');
  assert.equal(existsSync(join(w.dir, 'scripts', 'received.json')), false);
});

test('operator mode never runs the bootstrap and passes no database URL to the probe', () => {
  const w = workdir({});
  const r = run(pinned(COMMIT, sha256(PROBE_ECHO)), {
    body: PROBE_ECHO,
    cwd: w.dir,
    env: { DIRECT_DATABASE_URL: DB_URL, IDENTITY_OWNER_EMAIL: 'operator@example.invalid', IDENTITY_OWNER_PASSWORD: 'x' },
  });
  assert.equal(r.code, 0);
  assert.equal(r.stdout, 'PASS demo none pw=1 leaked= in-process=yes\n');
  assert.equal(existsSync(join(w.dir, 'scripts', 'received.json')), false);
});
