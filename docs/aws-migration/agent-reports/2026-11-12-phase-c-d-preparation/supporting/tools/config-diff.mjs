// Configuration-level comparison of two plan JSONs: for every resource and data source in the
// configuration (root and modules), whether its expressions (including count/for_each) differ.
// Used with plan-diff.mjs: an attribute that is unknown in an empty-state plan can still be seen
// to have a changed expression here.
import { readFileSync } from 'node:fs';
const walk = (mod, prefix, out, calls) => {
  for (const r of mod.resources ?? []) out.set(prefix + r.address, JSON.stringify({ e: r.expressions, c: r.count_expression, f: r.for_each_expression }));
  for (const [name, call] of Object.entries(mod.module_calls ?? {})) {
    calls.set(prefix + 'module.' + name, JSON.stringify({ e: call.expressions, c: call.count_expression, f: call.for_each_expression, s: call.source }));
    walk(call.module, prefix + 'module.' + name + '.', out, calls);
  }
};
const load = (f) => { const j = JSON.parse(readFileSync(f, 'utf8')); const r = new Map(), c = new Map(); walk(j.configuration.root_module, '', r, c); return { r, c }; };
const A = load(process.argv[2]), B = load(process.argv[3]);
const filter = process.argv[4] ? new RegExp(process.argv[4]) : null;
for (const [label, a, b] of [['module call', A.c, B.c], ['resource/data', A.r, B.r]]) {
  const keys = [...new Set([...a.keys(), ...b.keys()])].sort().filter((k) => !filter || filter.test(k));
  for (const k of keys) {
    if (!a.has(k)) console.log(`+ ${label} ${k}`);
    else if (!b.has(k)) console.log(`- ${label} ${k}`);
    else if (a.get(k) !== b.get(k)) console.log(`~ ${label} ${k}`);
  }
}
