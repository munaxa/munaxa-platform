// Verifies an Identity Testing access token against the committed public key (envs/nonprod.tfvars)
// and the claims the Config A1 deployment must issue. Prints no token, no subject, no tenant.
//
//   TOKEN=<jwt> node verify-identity-jwt.mjs        exit 0 = PASS, 1 = FAIL, 2 = no JWT given
//
// Expected values, each derived from configuration on main, not chosen here:
//   alg  ES256                          services.tf IDENTITY_SIGNING_ALGORITHM
//   kid  identity-nonprod-2026-11       envs/nonprod.tfvars identity_signing_kid
//   iss  https://id.test.munaxa.com     services.tf IDENTITY_BASE_URL = "https://" + hosts.identity
//   aud  munaxa-work, munaxa-control    services.tf IDENTITY_AUTH_AUDIENCE "munaxa-work,munaxa-control";
//                                       Identity's config splits it on "," (@munaxa/config list()) and
//                                       @munaxa/auth TokenService writes it as the `aud` array
//   exp  in the future, exp - iat = 900 @munaxa/auth MUNAXA_ACCESS_TOKEN_TTL default 900 000 ms; the
//                                       task definition sets no ACCESS_TOKEN_TTL and Identity's
//                                       login passes no per-token ttl
//   iat  not in the future              30 s skew, as TokenService.verify
import { createPublicKey, verify } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export const COMMITTED_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE1PulSDhEOvX3B61NzQwO20+q4+42
0KcstlgmQccrRJy+byuVwhz2HiJp1itFmUBkugYOR087NqwNr2Kowk5fRQ==
-----END PUBLIC KEY-----`;

export const EXPECTED = Object.freeze({
  alg: 'ES256',
  kid: 'identity-nonprod-2026-11',
  iss: 'https://id.test.munaxa.com',
  aud: Object.freeze(['munaxa-work', 'munaxa-control']),
  lifetimeSeconds: 900,
  skewSeconds: 30,
});

const decode = (part) => JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));

/** Returns { pass, checks: [{ name, ok, detail }], summary } and never throws on bad input. */
export function verifyIdentityToken(
  token,
  { publicKeyPem = COMMITTED_PUBLIC_KEY_PEM, nowSeconds = Math.floor(Date.now() / 1000), expected = EXPECTED } = {},
) {
  const checks = [];
  const check = (name, ok, detail) => checks.push({ name, ok: Boolean(ok), detail });
  const parts = typeof token === 'string' ? token.split('.') : [];
  let header;
  let payload;
  try {
    if (parts.length !== 3 || parts.some((p) => p === '')) throw new Error('not three parts');
    header = decode(parts[0]);
    payload = decode(parts[1]);
  } catch (error) {
    check('well-formed JWT', false, String(error.message ?? error));
    return { pass: false, checks, summary: {} };
  }
  check('well-formed JWT', true, 'three base64url parts, JSON header and payload');

  const key = createPublicKey(publicKeyPem);
  check('public key is P-256', key.asymmetricKeyDetails?.namedCurve === 'prime256v1', key.asymmetricKeyDetails?.namedCurve);
  check('alg', header.alg === expected.alg, header.alg);
  check('kid', header.kid === expected.kid, header.kid);

  let signatureValid = false;
  if (header.alg === 'ES256') {
    try {
      signatureValid = verify(
        'sha256',
        Buffer.from(`${parts[0]}.${parts[1]}`),
        { key, dsaEncoding: 'ieee-p1363' },
        Buffer.from(parts[2], 'base64url'),
      );
    } catch {
      signatureValid = false;
    }
  }
  check('signature (ES256, committed key)', signatureValid, signatureValid ? 'valid' : 'invalid or not ES256');
  check('iss', payload.iss === expected.iss, payload.iss);

  const aud = payload.aud;
  const audOk =
    Array.isArray(aud) &&
    aud.length === expected.aud.length &&
    expected.aud.every((a) => aud.includes(a)) &&
    new Set(aud).size === aud.length;
  check('aud', audOk, Array.isArray(aud) ? aud.join(',') : JSON.stringify(aud));

  const { exp, iat } = payload;
  const numeric = Number.isInteger(exp) && Number.isInteger(iat);
  check('exp in the future', numeric && exp > nowSeconds, numeric ? `${exp - nowSeconds}s left` : 'exp or iat missing');
  check('iat not in the future', numeric && iat <= nowSeconds + expected.skewSeconds, numeric ? `iat ${iat}` : 'missing');
  check(`lifetime ${expected.lifetimeSeconds}s`, numeric && exp - iat === expected.lifetimeSeconds, numeric ? `${exp - iat}s` : 'missing');

  const summary = {
    alg: header.alg,
    kid: header.kid,
    iss: payload.iss,
    aud,
    issuedAt: Number.isInteger(iat) ? new Date(iat * 1000).toISOString() : undefined,
    expires: Number.isInteger(exp) ? new Date(exp * 1000).toISOString() : undefined,
  };
  return { pass: checks.every((c) => c.ok), checks, summary };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const token = process.env.TOKEN ?? '';
  if (token.split('.').length !== 3) {
    console.log('no JWT in TOKEN');
    process.exit(2);
  }
  const result = verifyIdentityToken(token, { publicKeyPem: process.env.PUBLIC_KEY_PEM ?? COMMITTED_PUBLIC_KEY_PEM });
  console.log(JSON.stringify(result.summary, null, 2));
  for (const c of result.checks) console.log(`${c.ok ? 'ok  ' : 'FAIL'} ${c.name}: ${c.detail}`);
  console.log(result.pass ? 'PASS' : 'FAIL');
  process.exit(result.pass ? 0 : 1);
}
