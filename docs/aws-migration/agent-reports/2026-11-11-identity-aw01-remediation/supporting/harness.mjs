// AW-01 offline harness: the rendered Identity task environment (mocked Terraform plan) against
// munaxa-identity main's own configuration loader. Every secret is ephemeral, generated in memory
// for this process only, never printed or written.
import { readFileSync } from 'node:fs';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { loadEnvironment } from './identity-config.mjs';

const dump = (f) => {
  const t = readFileSync(f, 'utf8');
  const s = t.slice(t.indexOf('['), t.lastIndexOf('ENDDUMP')).trim();
  return JSON.parse(s)[0];
};
const envOf = (c) => Object.fromEntries(c.environment.map((e) => [e.name, e.value]));
const hardened = dump(process.argv[2]);
const legacy = dump(process.argv[3]);

const pem = generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey.export({
  type: 'pkcs8',
  format: 'pem',
});
const signingSecret = randomBytes(48).toString('base64url');
const mfaKey = randomBytes(32).toString('base64url');
const bundle = (names, extra = {}) => {
  const all = {
    DATABASE_URL: 'postgresql://identity_app:x@db.invalid:5432/identity',
    IDENTITY_SIGNING_PRIVATE_KEY: pem,
    IDENTITY_SIGNING_SECRET: signingSecret,
    REDIS_URL: 'redis://:x@127.0.0.1:6379',
    REDIS_PASSWORD: 'x',
    MFA_ENCRYPTION_KEYS: `nonprod-2026-11=${mfaKey}`,
    ...extra,
  };
  return Object.fromEntries(names.map((n) => [n, all[n]]));
};
const names = (c) => c.secrets.map((s) => s.name);

const cases = [];
const run = (label, env, expect, pattern) => {
  let outcome,
    message = '';
  try {
    loadEnvironment(env);
    outcome = 'starts';
  } catch (e) {
    outcome = 'refused';
    message = String(e.message);
  }
  const ok = outcome === expect && (pattern === undefined || pattern.test(message));
  // Problems are reported by name only; strip anything after the key names for the evidence.
  const keys = [...new Set([...message.matchAll(/([A-Z][A-Z0-9_]{3,}):/g)].map((m) => m[1]))];
  cases.push({ label, expect, outcome, refusedKeys: keys, ok });
};

const H = envOf(hardened),
  L = envOf(legacy);
run('H1 hardened task definition + full bundle', { ...H, ...bundle(names(hardened)) }, 'starts');
run(
  'H2 hardened, MFA_ENCRYPTION_KEYS missing from bundle',
  { ...H, ...bundle(names(hardened).filter((n) => n !== 'MFA_ENCRYPTION_KEYS')) },
  'refused',
  /MFA_ENCRYPTION_KEYS/,
);
run(
  'H3 hardened, primary kid not in the ring',
  { ...H, ...bundle(names(hardened), { MFA_ENCRYPTION_KEYS: `other-kid=${mfaKey}` }) },
  'refused',
  /MFA_ENCRYPTION_PRIMARY_KID/,
);
run(
  'H4 hardened, ring not kid=key',
  { ...H, ...bundle(names(hardened), { MFA_ENCRYPTION_KEYS: mfaKey }) },
  'refused',
  /MFA_ENCRYPTION_KEYS/,
);
run(
  'H5 hardened, key not 32 bytes',
  {
    ...H,
    ...bundle(names(hardened), {
      MFA_ENCRYPTION_KEYS: `nonprod-2026-11=${randomBytes(16).toString('base64url')}`,
    }),
  },
  'refused',
  /MFA_ENCRYPTION_KEYS/,
);
run(
  'H6 hardened, MFA key is IDENTITY_SIGNING_SECRET',
  { ...H, ...bundle(names(hardened), { IDENTITY_SIGNING_SECRET: mfaKey }) },
  'refused',
  /MFA_ENCRYPTION_KEYS/,
);
const noReset = { ...H };
delete noReset.IDENTITY_PASSWORD_RESET;
run(
  'H7 hardened without IDENTITY_PASSWORD_RESET (default enabled)',
  { ...noReset, ...bundle(names(hardened)) },
  'refused',
  /IDENTITY_PASSWORD_RESET/,
);
run(
  'H8 hardened with IDENTITY_PASSWORD_RESET=enabled',
  { ...H, IDENTITY_PASSWORD_RESET: 'enabled', ...bundle(names(hardened)) },
  'refused',
  /IDENTITY_PASSWORD_RESET/,
);
run(
  'H9 MFA_POLICY=privileged without MFA_PRIVILEGED_ROLES',
  { ...H, MFA_POLICY: 'privileged', ...bundle(names(hardened)) },
  'refused',
  /MFA_PRIVILEGED_ROLES/,
);
run(
  'H10 MFA_POLICY=privileged with role keys',
  {
    ...H,
    MFA_POLICY: 'privileged',
    MFA_PRIVILEGED_ROLES: 'role-a,role-b',
    ...bundle(names(hardened)),
  },
  'starts',
);
run(
  'L1 AW-01 reproduced: 5277d71 task definition, hardened image',
  { ...L, ...bundle(names(legacy)) },
  'refused',
  /MFA_ENCRYPTION_KEYS[\s\S]*IDENTITY_PASSWORD_RESET|IDENTITY_PASSWORD_RESET[\s\S]*MFA_ENCRYPTION_KEYS/,
);

for (const c of cases)
  console.log(
    `${c.ok ? 'PASS' : 'FAIL'}  ${c.label}: expected ${c.expect}, got ${c.outcome}${c.refusedKeys.length ? ` (${c.refusedKeys.join(', ')})` : ''}`,
  );
const failed = cases.filter((c) => !c.ok).length;
console.log(`${cases.length - failed}/${cases.length} as expected`);
process.exit(failed ? 1 : 0);
