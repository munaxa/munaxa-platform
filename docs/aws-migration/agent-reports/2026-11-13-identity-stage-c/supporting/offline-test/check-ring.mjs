// Feeds the ring the script wrote (fake run) to Identity 2db6ed9's own configuration loader, in the
// production-mode environment P-5 renders for the Identity task. Prints no value.
import { readFileSync } from 'node:fs';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { loadEnvironment, parseMfaKeys, reusesSecret } from './build/identity-config-2db6ed9.mjs';
const put = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const t = readFileSync('build/id-p5.txt', 'utf8');
const td = JSON.parse(t.slice(t.indexOf('['), t.lastIndexOf('ENDDUMP')).trim())[0];
const env = Object.fromEntries(td.environment.map((e) => [e.name, e.value]));
const names = td.secrets.map((s) => s.name);
const ring = put.MFA_ENCRYPTION_KEYS;
const p = parseMfaKeys(ring);
const key = p.entries[0]?.key;
console.log('written key names      ', Object.keys(put).join(','));
console.log('task secret names      ', names.join(','));
console.log('task env MFA/RESET     ', `MFA_ENCRYPTION_PRIMARY_KID=${env.MFA_ENCRYPTION_PRIMARY_KID} MFA_POLICY=${env.MFA_POLICY} IDENTITY_PASSWORD_RESET=${env.IDENTITY_PASSWORD_RESET} NODE_ENV=${env.NODE_ENV}`);
console.log('parseMfaKeys           ', `entries=${p.entries.length} kid=${p.entries[0]?.kid} keyBytes=${key?.length} problems=${p.problems.length}`);
console.log('ring text shape        ', `kid=<43 base64url chars>: ${/^mfa-nonprod-2026-11=[A-Za-z0-9_-]{43}$/.test(ring)}`);
console.log('reusesSecret(signing)  ', reusesSecret(key, put.IDENTITY_SIGNING_SECRET), reusesSecret(key, put.IDENTITY_SIGNING_PRIVATE_KEY));
// loadEnvironment needs a real signing key: replace the fake PEM/pepper/URLs with ephemeral values,
// keep the ring exactly as written.
const pem = generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey.export({ type: 'pkcs8', format: 'pem' });
const sec = { DATABASE_URL: 'postgresql://identity_app:x@db.invalid:5432/identity', IDENTITY_SIGNING_PRIVATE_KEY: pem,
  IDENTITY_SIGNING_SECRET: randomBytes(48).toString('base64url'), REDIS_URL: 'redis://:x@127.0.0.1:6379', REDIS_PASSWORD: 'x', MFA_ENCRYPTION_KEYS: ring };
let outcome = 'starts';
try { loadEnvironment({ ...env, ...Object.fromEntries(names.map((n) => [n, sec[n]])) }); } catch (e) {
  outcome = 'refused: ' + [...new Set([...String(e.message).matchAll(/([A-Z][A-Z0-9_]{3,}):/g)].map((m) => m[1]))].join(',');
}
console.log('loadEnvironment (prod) ', outcome);
