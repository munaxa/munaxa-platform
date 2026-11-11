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
import { createHash } from 'node:crypto';

const COMMIT = '__PROBE_COMMIT__';
const SHA256 = '__PROBE_SHA256__';
const SOURCE = 'https://raw.githubusercontent.com/munaxa/munaxa-platform';
const PATH = 'infra/aws/stack/supporting/identity-session-probe.mjs';
const MAX_BYTES = 262144;

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
  let probe;
  try {
    probe = await import(`data:text/javascript;base64,${source.toString('base64')}`);
  } catch {
    return fail('probe-source', 'import');
  }
  if (typeof probe.default !== 'function') return fail('probe-source', 'no-entry');
  try {
    const code = await probe.default(process.env);
    process.exitCode = Number.isInteger(code) ? code : 1;
  } catch {
    fail('probe', 'unhandled');
  }
}

await main();
