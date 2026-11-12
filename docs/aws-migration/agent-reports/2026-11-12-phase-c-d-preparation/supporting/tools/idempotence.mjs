// Identity's addressSubject output, passed through Platform 2.5.0's addressSubject (which the
// 2.5.0 RateLimiter now applies to every 'ip' rule), must come back unchanged.
const id = await import(process.argv[2]);
const plat = await import(process.argv[3]);
const inputs = ['203.0.113.7', ' 203.0.113.7 ', '::ffff:203.0.113.7', '2001:db8::1', '2001:DB8:0:0:1::1', '2001:db8:1:2:3:4:5:6',
  '::1', '::', 'fe80::1%eth0', '2001:db8:abcd:12::', '2001:0db8:0000:0012:0000:0000:0000:0001', '1::', '::2:3:4:5', 'not-an-address'];
let bad = 0;
for (const x of inputs) { const a = id.addressSubject(x); const b = plat.addressSubject(a); const c = plat.addressSubject(x);
  const ok = a === b; if (!ok) bad++; console.log(`${ok ? 'OK ' : 'BAD'} ${JSON.stringify(x)} identity=${a} platform(identity)=${b} platform(raw)=${c}${a === c ? '' : '  (differs from platform on raw)'}`); }
process.exit(bad ? 1 : 0);
