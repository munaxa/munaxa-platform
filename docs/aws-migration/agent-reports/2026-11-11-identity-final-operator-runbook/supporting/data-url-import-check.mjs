// Local check of the in-memory loading mechanism the probe loader relies on (runbook section 3.3).
// It does not download anything and is not the loader. Run: node data-url-import-check.mjs
// Exit 0 = every check passed.
import { createHash } from 'node:crypto';

const source = [
  "import { createHash } from 'node:crypto';",
  "import https from 'node:https';",
  "export default async function main(env) {",
  "  return typeof https.request === 'function' && createHash('sha256').update('x').digest('hex').length === 64 && env.MARK === 'ok' ? 0 : 1;",
  "}",
].join('\n');
const bytes = Buffer.from(source);
const pinned = createHash('sha256').update(bytes).digest('hex');

async function load(buf, expected) {
  const got = createHash('sha256').update(buf).digest('hex');
  if (got !== expected) return { loaded: false, reason: 'checksum' };
  const m = await import('data:text/javascript;base64,' + buf.toString('base64'));
  return { loaded: true, code: await m.default({ MARK: 'ok' }) };
}

const results = [];
const a = await load(bytes, pinned);
results.push(['pinned bytes load and can import node: built-ins', a.loaded && a.code === 0]);
const tampered = Buffer.from(source.replace("'x'", "'y'"));
const b = await load(tampered, pinned);
results.push(['one changed byte is refused before evaluation', !b.loaded && b.reason === 'checksum']);
for (const [name, ok] of results) console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
process.exitCode = results.every(([, ok]) => ok) ? 0 : 1;
