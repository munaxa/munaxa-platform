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
// Throwaway mode (PROBE_ACCOUNT=throwaway; Stage E blockers BE-3 and BE-4, report
// 2026-11-14-identity-stage-e-blockers-remediation, files 03 and 04). After the probe source is
// verified and before it is imported, the loader creates one synthetic account with the image's own
// scripts/bootstrap-account.mjs (Identity 2db6ed9): identifier stage-e-<16 hex>@stage-e.invalid, a
// random password, organisation munaxa-stage-e-checks, no role. DIRECT_DATABASE_URL (the
// identity-migrate owner URL, the task's only secret) goes to that child process only and is
// deleted from this process's environment first, so the downloaded probe never receives it. The
// child's output is read, never printed. The credential reaches the probe in the env object it is
// called with, never in process.env. The loader prints `INFO throwaway-sub <uuid>` (a public id) so
// the account can be disabled afterwards, or `FAIL throwaway-account <code>` and exit 3.
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';

const COMMIT = '__PROBE_COMMIT__';
const SHA256 = '__PROBE_SHA256__';
const SOURCE = 'https://raw.githubusercontent.com/munaxa/munaxa-platform';
const PATH = 'infra/aws/stack/supporting/identity-session-probe.mjs';
const MAX_BYTES = 262144;
const THROWAWAY_ORGANISATION = 'munaxa-stage-e-checks';
const DATABASE_ENV = ['DIRECT_DATABASE_URL', 'DATABASE_URL', 'DATABASE_MIGRATION_URL'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

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
      child = spawn(process.execPath, ['scripts/bootstrap-account.mjs', '--organisation', THROWAWAY_ORGANISATION, '--organisation-name', 'Stage E checks'], {
        env: {
          PATH: process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin',
          NODE_ENV: 'production',
          DIRECT_DATABASE_URL: databaseUrl,
          IDENTITY_OWNER_EMAIL: email,
          IDENTITY_OWNER_PASSWORD: password,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 60000,
      });
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
      if (signal !== null) return resolve({ code: 'bootstrap-killed' });
      if (status !== 0) return resolve({ code: 'bootstrap-exit' });
      const out = Buffer.concat(chunks).toString('utf8');
      if (!out.includes(`Created ${email} in organisation ${THROWAWAY_ORGANISATION}.`)) return resolve({ code: 'bootstrap-not-created' });
      const sub = /^\s+sub\s+(\S+)\s*$/m.exec(out)?.[1] ?? '';
      if (!UUID.test(sub)) return resolve({ code: 'bootstrap-no-sub' });
      return resolve({ sub });
    });
  });
}

// Creates the throwaway account. The database URL is taken and deleted from process.env first,
// whatever happens next.
async function throwaway() {
  const databaseUrl = process.env.DIRECT_DATABASE_URL ?? '';
  for (const name of DATABASE_ENV) delete process.env[name];
  if (!/^postgres(ql)?:\/\//.test(databaseUrl)) return { code: 'no-database-url' };
  const email = `stage-e-${randomBytes(8).toString('hex')}@stage-e.invalid`;
  // 32 random base64url characters plus fixed classes; bootstrap-account.mjs checks the real
  // policy before it writes, so a refused password creates nothing and is tried once more.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const password = `Se7-${randomBytes(24).toString('base64url')}`;
    const made = await bootstrap(databaseUrl, email, password);
    if (made.sub !== undefined) return { email, password, sub: made.sub };
    if (made.code !== 'bootstrap-exit') return made;
  }
  return { code: 'bootstrap-exit' };
}

async function main() {
  if (!process.versions.node.startsWith('22.')) return fail('probe-source', 'node-version');
  if (!/^[0-9a-f]{40}$/.test(COMMIT)) return fail('probe-source', 'commit');
  if (!/^[0-9a-f]{64}$/.test(SHA256)) return fail('probe-source', 'sha256-format');
  if (process.env.NODE_TLS_REJECT_UNAUTHORIZED !== undefined || process.env.NODE_OPTIONS) {
    return fail('probe-source', 'unsafe-environment');
  }
  const source = await download();
  if (source === undefined) return;
  if (source === null) return fail('probe-source', 'download');
  if (createHash('sha256').update(source).digest('hex') !== SHA256) {
    return fail('probe-source', 'checksum');
  }
  let env = process.env;
  if (process.env.PROBE_ACCOUNT === 'throwaway') {
    const account = await throwaway();
    if (account.sub === undefined) {
      process.stdout.write(`FAIL throwaway-account ${account.code}\n`);
      process.exitCode = 3;
      return;
    }
    process.stdout.write(`INFO throwaway-sub ${account.sub}\n`);
    env = { ...process.env, IDENTITY_OWNER_EMAIL: account.email, IDENTITY_OWNER_PASSWORD: account.password };
  } else {
    // Operator mode never holds a database URL: the task definition gives none, and none passes.
    for (const name of DATABASE_ENV) delete process.env[name];
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
