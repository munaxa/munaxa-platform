// Throwaway read-only npm registry on 127.0.0.1 for LOCAL compatibility testing only.
// Serves @munaxa/* packuments built from the tarballs in the given directories. Nothing is
// published anywhere; no write endpoint exists (PUT is refused).
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
const port = Number(process.env.PORT ?? 4873);
const dirs = process.argv.slice(2);
const pk = new Map(); const files = new Map();
for (const d of dirs) for (const f of readdirSync(d).filter((f) => f.endsWith('.tgz'))) {
  const p = path.join(d, f); const buf = readFileSync(p);
  const man = JSON.parse(execFileSync('tar', ['xzOf', p, 'package/package.json']));
  const key = `${man.name}/${man.version}`; files.set(`/tarballs/${f}`, buf);
  const doc = pk.get(man.name) ?? { name: man.name, versions: {}, 'dist-tags': {} };
  doc.versions[man.version] = { ...man, dist: {
    tarball: `http://127.0.0.1:${port}/tarballs/${f}`,
    shasum: createHash('sha1').update(buf).digest('hex'),
    integrity: 'sha512-' + createHash('sha512').update(buf).digest('base64') } };
  const vs = Object.keys(doc.versions).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  doc['dist-tags'].latest = vs.at(-1); pk.set(man.name, doc); console.error('serving', key);
}
createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return; }
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (files.has(url)) { res.writeHead(200, { 'content-type': 'application/octet-stream' }).end(files.get(url)); return; }
  const doc = pk.get(url.slice(1));
  if (doc) { res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(doc)); return; }
  res.writeHead(404, { 'content-type': 'application/json' }).end('{"error":"not found"}');
}).listen(port, '127.0.0.1', () => console.error(`local registry on 127.0.0.1:${port}`));
