// Verifies an Identity access token against the committed public key (envs/nonprod.tfvars).
// Reads the token from the TOKEN environment variable; prints no token and no subject.
import { createPublicKey, verify } from 'node:crypto';
const pem = process.env.PUBLIC_KEY_PEM ?? `-----BEGIN PUBLIC KEY-----
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE1PulSDhEOvX3B61NzQwO20+q4+42
0KcstlgmQccrRJy+byuVwhz2HiJp1itFmUBkugYOR087NqwNr2Kowk5fRQ==
-----END PUBLIC KEY-----`;
const key = createPublicKey(pem);
const parts = (process.env.TOKEN ?? '').split('.');
if (parts.length !== 3) { console.log('no JWT in TOKEN'); process.exit(2); }
const header = JSON.parse(Buffer.from(parts[0], 'base64url'));
const payload = JSON.parse(Buffer.from(parts[1], 'base64url'));
const valid = verify('sha256', Buffer.from(`${parts[0]}.${parts[1]}`),
  { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(parts[2], 'base64url'));
const result = {
  curve: key.asymmetricKeyDetails?.namedCurve, alg: header.alg, kid: header.kid, iss: payload.iss, aud: payload.aud,
  expires: payload.exp ? new Date(payload.exp * 1000).toISOString() : undefined, signatureValid: valid,
};
console.log(JSON.stringify(result, null, 2));
const pass = valid && header.alg === 'ES256' && header.kid === 'identity-nonprod-2026-11' && payload.iss === 'https://id.test.munaxa.com';
console.log(pass ? 'PASS' : 'FAIL');
process.exit(pass ? 0 : 1);
