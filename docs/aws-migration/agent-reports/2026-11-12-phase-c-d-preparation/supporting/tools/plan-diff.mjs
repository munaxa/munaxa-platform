// Compare two offline plans (both against empty state): which addresses exist only in one, and
// which attributes of common addresses differ in their planned values. If the real state equals
// plan A's configuration (A was applied and a post-apply plan said "No changes"), the real plan of
// B shows exactly these: creates for B-only, destroys for A-only, updates/replacements for diffs.
import { readFileSync } from 'node:fs';
const load = (f) => new Map(JSON.parse(readFileSync(f, 'utf8')).resource_changes.map((r) => [r.address, r]));
const [a, b] = [load(process.argv[2]), load(process.argv[3])];
const onlyA = [...a.keys()].filter((k) => !b.has(k)).sort();
const onlyB = [...b.keys()].filter((k) => !a.has(k)).sort();
console.log(`A: ${a.size} resources, B: ${b.size} resources`);
console.log(`only in B (would be CREATED): ${onlyB.length}`); onlyB.forEach((k) => console.log('  + ' + k));
console.log(`only in A (would be DESTROYED): ${onlyA.length}`); onlyA.forEach((k) => console.log('  - ' + k));
const flat = (o, p = '', out = {}) => { if (o && typeof o === 'object') { for (const [k, v] of Object.entries(o)) flat(v, p ? `${p}.${k}` : k, out); } else out[p] = o; return out; };
let n = 0;
for (const [k, ra] of a) { const rb = b.get(k); if (!rb) continue;
  const fa = flat(ra.change.after ?? {}), fb = flat(rb.change.after ?? {});
  const ua = flat(ra.change.after_unknown ?? {}), ub = flat(rb.change.after_unknown ?? {});
  const keys = new Set([...Object.keys(fa), ...Object.keys(fb), ...Object.keys(ua), ...Object.keys(ub)]);
  const diffs = [...keys].filter((x) => JSON.stringify(fa[x]) !== JSON.stringify(fb[x]) || JSON.stringify(ua[x]) !== JSON.stringify(ub[x])).sort();
  if (diffs.length) { n++; console.log(`~ ${k}`); for (const d of diffs) { const s = (v) => { const t = JSON.stringify(v); return t && t.length > 160 ? t.slice(0, 160) + '…' : t; }; console.log(`    ${d}: ${s(fa[d])} -> ${s(fb[d])}${ub[d] ? ' (known after apply)' : ''}`); } }
}
console.log(`common resources with a different planned value (would be UPDATED or REPLACED): ${n}`);
