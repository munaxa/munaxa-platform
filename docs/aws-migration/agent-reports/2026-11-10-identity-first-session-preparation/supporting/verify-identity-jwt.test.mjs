// node --test verify-identity-jwt.test.mjs   (Node 18+; no dependencies)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign, createPublicKey } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { verifyIdentityToken, EXPECTED, COMMITTED_PUBLIC_KEY_PEM } from './verify-identity-jwt.mjs';

const NOW = 1_800_000_000;
const pair = () => {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  return { privateKey, pem: publicKey.export({ type: 'spki', format: 'pem' }) };
};
const KEYS = pair();
const OTHER = pair();
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const goodHeader = { alg: 'ES256', typ: 'JWT', kid: EXPECTED.kid };
const goodPayload = {
  sub: 'usr_x', tid: 'ten_x', iss: EXPECTED.iss, aud: ['munaxa-work', 'munaxa-control'],
  iat: NOW - 60, exp: NOW - 60 + 900, jti: 'jti_x', ver: 1,
};
const mint = ({ header = goodHeader, payload = goodPayload, key = KEYS.privateKey } = {}) => {
  const input = `${b64(header)}.${b64(payload)}`;
  const sig = sign('sha256', Buffer.from(input), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  return `${input}.${sig}`;
};
const run = (token, opts = {}) => verifyIdentityToken(token, { publicKeyPem: KEYS.pem, nowSeconds: NOW, ...opts });
const failed = (r) => r.checks.filter((c) => !c.ok).map((c) => c.name);

test('committed public key loads as P-256', () => {
  assert.equal(createPublicKey(COMMITTED_PUBLIC_KEY_PEM).asymmetricKeyDetails.namedCurve, 'prime256v1');
});

test('valid token passes every check', () => {
  const r = run(mint());
  assert.equal(r.pass, true, JSON.stringify(r.checks));
  assert.deepEqual(r.summary.aud, ['munaxa-work', 'munaxa-control']);
});

test('audience order does not matter', () => {
  assert.equal(run(mint({ payload: { ...goodPayload, aud: ['munaxa-control', 'munaxa-work'] } })).pass, true);
});

test('signature from another key fails', () => {
  assert.deepEqual(failed(run(mint({ key: OTHER.privateKey }))), ['signature (ES256, committed key)']);
});

test('same token against the committed key fails (no false PASS)', () => {
  const r = verifyIdentityToken(mint(), { nowSeconds: NOW });
  assert.equal(r.pass, false);
  assert.ok(failed(r).includes('signature (ES256, committed key)'));
});

test('tampered payload fails the signature', () => {
  const [h, , s] = mint().split('.');
  const r = run(`${h}.${b64({ ...goodPayload, iss: EXPECTED.iss })}x.${s}`);
  assert.equal(r.pass, false);
});

for (const [name, change, expectFail] of [
  ['wrong kid', { header: { ...goodHeader, kid: 'identity-nonprod-2026-10' } }, 'kid'],
  ['wrong iss (trailing slash)', { payload: { ...goodPayload, iss: `${EXPECTED.iss}/` } }, 'iss'],
  ['aud missing', { payload: { ...goodPayload, aud: undefined } }, 'aud'],
  ['aud as a string', { payload: { ...goodPayload, aud: 'munaxa-work,munaxa-control' } }, 'aud'],
  ['aud only munaxa-work', { payload: { ...goodPayload, aud: ['munaxa-work'] } }, 'aud'],
  ['aud with an extra entry', { payload: { ...goodPayload, aud: ['munaxa-work', 'munaxa-control', 'munaxa-school'] } }, 'aud'],
  ['aud duplicated', { payload: { ...goodPayload, aud: ['munaxa-work', 'munaxa-work'] } }, 'aud'],
  ['expired', { payload: { ...goodPayload, iat: NOW - 1000, exp: NOW - 100 } }, 'exp in the future'],
  ['exp equal to now', { payload: { ...goodPayload, iat: NOW - 900, exp: NOW } }, 'exp in the future'],
  ['iat in the future', { payload: { ...goodPayload, iat: NOW + 120, exp: NOW + 1020 } }, 'iat not in the future'],
  ['lifetime 3600 s', { payload: { ...goodPayload, exp: goodPayload.iat + 3600 } }, 'lifetime 900s'],
  ['exp missing', { payload: { ...goodPayload, exp: undefined } }, 'exp in the future'],
]) {
  test(`${name} fails`, () => {
    const r = run(mint(change));
    assert.equal(r.pass, false);
    assert.ok(failed(r).includes(expectFail), `${failed(r)}`);
  });
}

test('alg none and HS256 are refused', () => {
  const p = b64(goodPayload);
  for (const alg of ['none', 'HS256']) {
    const r = run(`${b64({ ...goodHeader, alg })}.${p}.c2ln`);
    assert.equal(r.pass, false);
    assert.ok(failed(r).includes('alg') && failed(r).includes('signature (ES256, committed key)'));
  }
});

for (const bad of ['', 'abc', 'a.b', 'a.b.c', '..', 'eyJ.eyJ.']) {
  test(`malformed token ${JSON.stringify(bad)} fails without throwing`, () => {
    assert.equal(run(bad).pass, false);
  });
}

test('CLI: exit 0 on PASS, 1 on FAIL, 2 without a token; prints no subject', () => {
  const script = fileURLToPath(new URL('./verify-identity-jwt.mjs', import.meta.url));
  const now = Math.floor(Date.now() / 1000);
  const live = mint({ payload: { ...goodPayload, iat: now - 10, exp: now - 10 + 900 } });
  const out = execFileSync(process.execPath, [script], { env: { TOKEN: live, PUBLIC_KEY_PEM: KEYS.pem } }).toString();
  assert.match(out, /PASS\n$/);
  assert.doesNotMatch(out, /usr_x|ten_x/);
  assert.throws(() => execFileSync(process.execPath, [script], { env: { TOKEN: live }, stdio: 'pipe' }), (e) => e.status === 1);
  assert.throws(() => execFileSync(process.execPath, [script], { env: {}, stdio: 'pipe' }), (e) => e.status === 2);
});
