// The identity-probe task's whole program (identity-probe.tf). Terraform writes the reviewed probe
// commit and SHA-256 into the two constants below and runs this text with
// `node --input-type=module -e`, so the pin is part of the task definition, not a run-task
// override. The root filesystem is read-only, so the probe is never written to disk: it is
// downloaded from that commit only, checked, and imported from memory.
//
// The probe (infra/aws/stack/supporting/identity-session-probe.mjs) must be one self-contained
// file that imports only node: built-ins. Its default export is called with process.env and
// returns the exit code (0 all pass, 1 a check failed, 2 configuration). This loader's own
// failures exit 3 and print only `FAIL probe-source <code>` (`FAIL probe unhandled` if the probe
// throws); it never prints a body, a header or the environment.
//
// PROBE_STAGE selects what this container does:
//
//   "probe"    verify and run the probe. Operator mode (PROBE_ACCOUNT=operator): the credential is
//              the task's IDENTITY_OWNER_* secrets. Throwaway mode: the credential is read from the
//              hand-off file the account container wrote, which is deleted at once. A probe
//              container never holds a database URL: any database variable refuses the run.
//   "account"  throwaway mode only (Stage E blockers BE-3 and BE-4, report
//              2026-11-14-identity-stage-e-blockers-remediation, files 03 and 04). A separate,
//              non-essential container of the same task, with DIRECT_DATABASE_URL (the
//              identity-migrate owner URL) as its only secret. It creates one synthetic account
//              with the image's own scripts/bootstrap-account.mjs (Identity 2db6ed9): identifier
//              stage-e-<16 hex>@stage-e.invalid, a random password, organisation
//              munaxa-stage-e-checks, no role; prints `INFO throwaway-sub <uuid>` (a public id) so
//              the account can be disabled afterwards; writes the identifier, password and sub to
//              the task's ephemeral hand-off volume (PROBE_HANDOFF_DIR) and exits 0. The probe
//              container starts only after that (dependsOn SUCCESS), in its own process and PID
//              namespace, so the downloaded probe can never read the database URL, not even from
//              /proc (security review finding S-1). The account container never downloads the
//              probe. The child's output is read, never printed.
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { readFile, unlink, writeFile } from 'node:fs/promises';

const COMMIT = '__PROBE_COMMIT__';
const SHA256 = '__PROBE_SHA256__';
const SOURCE = 'https://raw.githubusercontent.com/munaxa/munaxa-platform';
const PATH = 'infra/aws/stack/supporting/identity-session-probe.mjs';
const MAX_BYTES = 262144;
const THROWAWAY_ORGANISATION = 'munaxa-stage-e-checks';
const DATABASE_ENV = ['DIRECT_DATABASE_URL', 'DATABASE_URL', 'DATABASE_MIGRATION_URL'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const THROWAWAY_EMAIL = /^stage-e-[0-9a-f]{16}@stage-e\.invalid$/;
const THROWAWAY_PASSWORD = /^Se7-[A-Za-z0-9_-]{32}$/;
const HANDOFF_FILE = 'stage-e-account.json';
// The image sets these at image level (Identity's Dockerfile trusts the RDS CA bundle through
// NODE_EXTRA_CA_CERTS); Node reads them only at process start, so the child needs them passed.
const CA_ENV = ['NODE_EXTRA_CA_CERTS', 'SSL_CERT_FILE'];

const fail = (stage, code) => {
  process.stdout.write(`FAIL ${stage} ${code}\n`);
  process.exitCode = 3;
};

async function download() {
  let res;
  try {
    // Certificate checking stays on: no agent, no NODE_TLS_REJECT_UNAUTHORIZED, no redirect.
    res = await fetch(`${SOURCE}/${COMMIT}/${PATH}`, {
      redirect: 'error',
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    return null;
  }
  if (res.status !== 200) {
    fail('probe-source', `status-${res.status}`);
    return undefined;
  }
  const chunks = [];
  let size = 0;
  try {
    for await (const chunk of res.body) {
      size += chunk.length;
      if (size > MAX_BYTES) {
        fail('probe-source', 'too-large');
        return undefined;
      }
      chunks.push(chunk);
    }
  } catch {
    return null;
  }
  return Buffer.concat(chunks);
}

// Runs the image's bootstrap script once. Resolves { code } or { sub }; never rejects.
function bootstrap(databaseUrl, email, password) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(
        process.execPath,
        [
          'scripts/bootstrap-account.mjs',
          '--organisation',
          THROWAWAY_ORGANISATION,
          '--organisation-name',
          'Stage E checks',
        ],
        {
          env: {
            ...Object.fromEntries(
              CA_ENV.filter((name) => process.env[name]).map((name) => [name, process.env[name]]),
            ),
            PATH: process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin',
            NODE_ENV: 'production',
            DIRECT_DATABASE_URL: databaseUrl,
            IDENTITY_OWNER_EMAIL: email,
            IDENTITY_OWNER_PASSWORD: password,
          },
          stdio: ['ignore', 'pipe', 'pipe'],
          timeout: 60000,
        },
      );
    } catch {
      resolve({ code: 'spawn' });
      return;
    }
    const chunks = [];
    let size = 0;
    child.stdout.on('data', (chunk) => {
      size += chunk.length;
      if (size <= 16384) chunks.push(chunk);
    });
    child.stderr.resume(); // drained, never read or printed
    child.once('error', () => resolve({ code: 'spawn' }));
    child.once('close', (status, signal) => {
      const out = Buffer.concat(chunks).toString('utf8');
      const created = out.includes(`Created ${email} in organisation ${THROWAWAY_ORGANISATION}.`);
      const sub = /^\s+sub\s+(\S+)\s*$/m.exec(out)?.[1] ?? '';
      // Owner review A-8: an account the child created before it failed or was killed is still
      // named (its sub only), so it can be disabled, and is never followed by a retry.
      const createdSub = created && UUID.test(sub) ? sub : undefined;
      if (signal !== null) return resolve({ code: 'bootstrap-killed', created, createdSub });
      if (status !== 0) return resolve({ code: 'bootstrap-exit', created, createdSub });
      if (!created) return resolve({ code: 'bootstrap-not-created', created });
      if (!UUID.test(sub)) return resolve({ code: 'bootstrap-no-sub', created });
      return resolve({ sub });
    });
  });
}

// Creates the throwaway account (account container only). The database URL is taken and deleted
// from process.env first, whatever happens next.
async function throwaway() {
  const databaseUrl = process.env.DIRECT_DATABASE_URL ?? '';
  for (const name of DATABASE_ENV) delete process.env[name];
  if (!/^postgres(ql)?:\/\//.test(databaseUrl)) return { code: 'no-database-url' };
  // 32 random base64url characters plus fixed classes; bootstrap-account.mjs checks the real
  // policy before it writes, so a refused password creates nothing and is tried once more, with a
  // fresh address (owner review A-8: never the address of an account that may exist).
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const email = `stage-e-${randomBytes(8).toString('hex')}@stage-e.invalid`;
    const password = `Se7-${randomBytes(24).toString('base64url')}`;
    const made = await bootstrap(databaseUrl, email, password);
    if (made.sub !== undefined) return { email, password, sub: made.sub };
    if (made.created) return { code: made.code, created: true, createdSub: made.createdSub };
    if (made.code !== 'bootstrap-exit') return made;
  }
  return { code: 'bootstrap-exit' };
}

function handoffDir() {
  const dir = process.env.PROBE_HANDOFF_DIR ?? '';
  return /^\/[A-Za-z0-9/_.-]+$/.test(dir) && !dir.includes('..') ? dir : '';
}

// The account container. Exits 0 only when the account exists and the hand-off file is written.
async function account() {
  const failAccount = (code) => {
    process.stdout.write(`FAIL throwaway-account ${code}\n`);
    process.exitCode = 3;
  };
  if (process.env.PROBE_ACCOUNT !== 'throwaway') {
    for (const name of DATABASE_ENV) delete process.env[name];
    return failAccount('not-throwaway-mode');
  }
  const dir = handoffDir();
  if (dir === '') {
    for (const name of DATABASE_ENV) delete process.env[name];
    return failAccount('handoff-dir');
  }
  // Prove the hand-off volume is writable before anything is created.
  try {
    await writeFile(`${dir}/.stage-e-ready`, '', { flag: 'wx', mode: 0o600 });
    await unlink(`${dir}/.stage-e-ready`);
  } catch {
    for (const name of DATABASE_ENV) delete process.env[name];
    return failAccount('handoff-not-writable');
  }
  const made = await throwaway();
  if (made.sub === undefined) {
    // An account was created although the step failed: name it (sub only) for the disable step.
    if (made.createdSub !== undefined)
      process.stdout.write(`INFO throwaway-sub ${made.createdSub}\n`);
    // Pass C C-2: created, but no sub was printed: say so, never read as "nothing exists".
    else if (made.created) process.stdout.write('INFO throwaway-created-sub-unknown\n');
    return failAccount(made.code);
  }
  // Printed before the hand-off write, so a failed write still names the account to disable.
  process.stdout.write(`INFO throwaway-sub ${made.sub}\n`);
  try {
    await writeFile(
      `${dir}/${HANDOFF_FILE}`,
      JSON.stringify({ email: made.email, password: made.password, sub: made.sub }),
      // 0644: written by the account container (uid 0, the only writer of the root-owned volume) for the
      // probe container (the non-root identity user), which can read it but not delete it; the
      // volume dies with the task.
      { flag: 'wx', mode: 0o644 },
    );
  } catch {
    return failAccount('handoff-write');
  }
  process.exitCode = 0;
}

// The probe container's throwaway credential: read once, shape-checked, and deleted where the
// volume allows it (on the read-only task mount it stays until the task ends).
async function handoff() {
  const dir = handoffDir();
  if (dir === '') return { code: 'handoff-dir' };
  let text;
  try {
    text = await readFile(`${dir}/${HANDOFF_FILE}`, 'utf8');
  } catch {
    return { code: 'handoff-read' };
  } finally {
    await unlink(`${dir}/${HANDOFF_FILE}`).catch(() => {});
  }
  let got;
  try {
    got = JSON.parse(text);
  } catch {
    return { code: 'handoff-shape' };
  }
  if (
    !THROWAWAY_EMAIL.test(got?.email ?? '') ||
    !THROWAWAY_PASSWORD.test(got?.password ?? '') ||
    !UUID.test(got?.sub ?? '')
  ) {
    return { code: 'handoff-shape' };
  }
  return { email: got.email, password: got.password };
}

async function main() {
  if (!process.versions.node.startsWith('22.')) return fail('probe-source', 'node-version');
  if (!/^[0-9a-f]{40}$/.test(COMMIT)) return fail('probe-source', 'commit');
  if (!/^[0-9a-f]{64}$/.test(SHA256)) return fail('probe-source', 'sha256-format');
  if (process.env.NODE_TLS_REJECT_UNAUTHORIZED !== undefined || process.env.NODE_OPTIONS) {
    return fail('probe-source', 'unsafe-environment');
  }
  const stage = process.env.PROBE_STAGE;
  if (stage === 'account') return account();
  if (stage !== 'probe') return fail('probe-source', 'stage');
  // A probe container never holds a database URL (the task definition gives it none).
  if (DATABASE_ENV.some((name) => name in process.env)) {
    for (const name of DATABASE_ENV) delete process.env[name];
    return fail('probe-source', 'database-url-present');
  }
  const source = await download();
  if (source === undefined) return;
  if (source === null) return fail('probe-source', 'download');
  if (createHash('sha256').update(source).digest('hex') !== SHA256) {
    return fail('probe-source', 'checksum');
  }
  let env = process.env;
  if (process.env.PROBE_ACCOUNT === 'throwaway') {
    const credential = await handoff();
    if (credential.email === undefined) {
      process.stdout.write(`FAIL throwaway-account ${credential.code}\n`);
      process.exitCode = 3;
      return;
    }
    env = {
      ...process.env,
      IDENTITY_OWNER_EMAIL: credential.email,
      IDENTITY_OWNER_PASSWORD: credential.password,
    };
  }
  let probe;
  try {
    probe = await import(`data:text/javascript;base64,${source.toString('base64')}`);
  } catch {
    return fail('probe-source', 'import');
  }
  if (typeof probe.default !== 'function') return fail('probe-source', 'no-entry');
  try {
    const code = await probe.default(env);
    process.exitCode = Number.isInteger(code) ? code : 1;
  } catch {
    fail('probe', 'unhandled');
  }
}

await main();
