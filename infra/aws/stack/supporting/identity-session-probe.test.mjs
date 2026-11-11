// Unit tests for identity-session-probe.mjs. Offline: a local HTTPS server stands in for the ALB and
// Identity, with its own throwaway certificate authority (made with openssl at test time) and its
// own ES256 key pair. No AWS call, no DNS, no network beyond 127.0.0.1.
//
//   node --test infra/aws/stack/supporting/
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash, generateKeyPairSync, sign as signData } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:https';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

import probe, {
  CHECKS,
  COMMITTED_PUBLIC_KEYS,
  EXPECTED,
  PINNED_ENV,
  ProbeError,
  cookieHeaderFor,
  formatLine,
  formatSummary,
  main,
  parseSetCookies,
  pathMatches,
  readConfig,
  runChecks,
  sanitizeError,
  verifyAccessToken,
} from './identity-session-probe.mjs';

const PROBE_PATH = fileURLToPath(new URL('./identity-session-probe.mjs', import.meta.url));
const PROBE_SOURCE = readFileSync(PROBE_PATH);
const EMAIL = 'operator.probe@example.invalid';
const PASSWORD = 'Correct-Horse-Battery-Staple-7731';
const ALB = 'internal-munaxa-nonprod-1234567890.eu-central-1.elb.amazonaws.com';

// --- Fixtures ------------------------------------------------------------------------------------

const keyPair = () => {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  return { privateKey, publicPem: publicKey.export({ type: 'spki', format: 'pem' }).toString() };
};
const SIGNER = keyPair();
const OTHER = keyPair();
const TEST_KEYS = [{ kid: EXPECTED.kid, publicKey: SIGNER.publicPem }];

const b64 = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');

function makeJwt({ header = {}, payload = {}, key = SIGNER.privateKey, now = Math.floor(Date.now() / 1000) } = {}) {
  const h = { alg: 'ES256', kid: EXPECTED.kid, typ: 'JWT', ...header };
  const p = {
    iss: EXPECTED.iss,
    aud: [...EXPECTED.aud],
    sub: 'acc_probe',
    tid: 'ten_probe',
    sid: 'ses_probe',
    iat: now,
    exp: now + 900,
    ...payload,
  };
  const input = `${b64(h)}.${b64(p)}`;
  const signature = signData('sha256', Buffer.from(input), { key, dsaEncoding: 'ieee-p1363' });
  return `${input}.${signature.toString('base64url')}`;
}

let dir;
let pki;

function openssl(args) {
  execFileSync('openssl', args, { cwd: dir, stdio: 'ignore' });
}

function makePki() {
  dir = mkdtempSync(join(tmpdir(), 'identity-probe-test-'));
  openssl(['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes', '-keyout', 'ca.key',
    '-out', 'ca.pem', '-days', '2', '-subj', '/CN=Probe Test CA']);
  const leaf = (name, sans, extra = []) => {
    writeFileSync(join(dir, `${name}.ext`), `subjectAltName=${sans}\nbasicConstraints=CA:FALSE\n`);
    openssl(['req', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes', '-keyout', `${name}.key`,
      '-out', `${name}.csr`, '-subj', `/CN=${name}`]);
    openssl(['x509', '-req', '-in', `${name}.csr`, '-CA', 'ca.pem', '-CAkey', 'ca.key', '-CAcreateserial',
      '-out', `${name}.pem`, '-extfile', `${name}.ext`, ...extra]);
    return { key: readFileSync(join(dir, `${name}.key`)), cert: readFileSync(join(dir, `${name}.pem`)) };
  };
  return {
    ca: readFileSync(join(dir, 'ca.pem')),
    good: leaf('good', 'DNS:*.test.munaxa.com,DNS:operator-test.munaxa.com', ['-days', '2']),
    wrongName: leaf('wrong', 'DNS:*.example.invalid', ['-days', '2']),
  };
}

// --- The mock ALB + Identity ---------------------------------------------------------------------

function startMock({ tls = 'good', behaviour = {} } = {}) {
  const log = { logins: [], wrongPasswordAttempts: 0, refreshes: [], logouts: [], requests: [] };
  const sessions = new Map(); // refresh token -> { sid, revoked }
  const revokedSids = new Set();
  let counter = 0;

  const sendJson = (res, status, body, cookies = []) => {
    if (cookies.length > 0) res.setHeader('set-cookie', cookies);
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  const fixed = (res, status, text) => {
    res.writeHead(status, { 'content-type': 'text/plain' });
    res.end(text);
  };
  const cookiesOf = (req) =>
    Object.fromEntries(
      (req.headers.cookie ?? '')
        .split(';')
        .map((c) => c.trim())
        .filter(Boolean)
        .map((c) => [c.slice(0, c.indexOf('=')), decodeURIComponent(c.slice(c.indexOf('=') + 1))]),
    );
  const issue = (sid) => {
    counter += 1;
    const access = behaviour.badAccessToken ?? makeJwt({ payload: { sid } });
    const refresh = `rt_${counter}_${Math.random().toString(36).slice(2)}`;
    sessions.set(refresh, { sid, used: false });
    return [
      `${EXPECTED.sessionCookie}=${encodeURIComponent(access)}; Path=/; Max-Age=900; Secure; HttpOnly; SameSite=Lax`,
      `${EXPECTED.refreshCookie}=${encodeURIComponent(refresh)}; Path=/api/auth/refresh; Max-Age=2592000; Secure; HttpOnly; SameSite=Strict`,
    ];
  };
  const cleared = [
    `${EXPECTED.sessionCookie}=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax`,
    `${EXPECTED.refreshCookie}=; Path=/api/auth/refresh; Max-Age=0; Secure; HttpOnly; SameSite=Strict`,
  ];

  const identity = (req, res, body) => {
    const path = req.url;
    const cookies = cookiesOf(req);
    const unsafe = req.method !== 'GET';
    if (unsafe && req.headers.origin !== EXPECTED.origin) return sendJson(res, 403, { code: 'ORIGIN_REJECTED' });
    if (req.method === 'GET' && path === '/api/auth/health/live') return sendJson(res, 200, { status: 'ok' });
    if (req.method === 'GET' && path === '/api/auth/health/ready') {
      return sendJson(res, 200, {
        status: 'ok',
        cache: behaviour.cache ?? 'redis',
        signingKid: behaviour.readyKid ?? EXPECTED.kid,
        sessionLimit: 'exact',
      });
    }
    if (req.method === 'GET' && path === '/api/auth/session') {
      const token = cookies[EXPECTED.sessionCookie];
      if (token === undefined) return sendJson(res, 200, { signedIn: false });
      const sid = JSON.parse(Buffer.from(token.split('.')[1], 'base64url')).sid;
      if (revokedSids.has(sid)) return sendJson(res, 200, { signedIn: false });
      return sendJson(res, 200, { signedIn: true, subject: 'acc_probe', expiresAt: Date.now() + 900_000 });
    }
    if (req.method === 'POST' && path === '/api/auth/login') {
      log.logins.push({ organisation: body.organisation, origin: req.headers.origin });
      if (body.organisation !== EXPECTED.organisation) return sendJson(res, 401, { code: 'AUTH_INVALID_CREDENTIALS' });
      if (body.identifier !== EMAIL || body.password !== PASSWORD) {
        log.wrongPasswordAttempts += 1;
        return sendJson(res, behaviour.wrongPasswordStatus ?? 401, { code: behaviour.wrongPasswordCode ?? 'AUTH_INVALID_CREDENTIALS' });
      }
      return sendJson(res, 200, { ok: true }, issue(`ses_${counter + 1}`));
    }
    if (req.method === 'POST' && path === '/api/auth/refresh') {
      log.refreshes.push({ organisation: body.organisation, hadRefreshCookie: cookies[EXPECTED.refreshCookie] !== undefined });
      const record = sessions.get(cookies[EXPECTED.refreshCookie]);
      const ok =
        body.organisation === EXPECTED.organisation &&
        record !== undefined &&
        !record.used &&
        (behaviour.replayAccepted === true || !revokedSids.has(record.sid));
      if (!ok) return sendJson(res, 401, { code: 'AUTH_INVALID_CREDENTIALS' }, cleared);
      record.used = true;
      return sendJson(res, 200, { ok: true }, behaviour.noRotation ? [] : issue(record.sid));
    }
    if (req.method === 'POST' && path === '/api/auth/logout') {
      log.logouts.push({ hadRefreshCookie: cookies[EXPECTED.refreshCookie] !== undefined });
      const token = cookies[EXPECTED.sessionCookie];
      if (token !== undefined) revokedSids.add(JSON.parse(Buffer.from(token.split('.')[1], 'base64url')).sid);
      return sendJson(res, 200, { ok: true }, cleared);
    }
    return sendJson(res, 404, { code: 'NOT_FOUND' });
  };

  const server = createServer(tls === 'wrong-name' ? pki.wrongName : pki.good, (req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      let body = {};
      try {
        body = chunks.length === 0 ? {} : JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch {
        body = {};
      }
      const host = (req.headers.host ?? '').toLowerCase();
      log.requests.push({ host, sni: req.socket.servername, method: req.method, path: req.url });
      // The listener rules, in priority order (edge.tf).
      if (host === EXPECTED.controlHost && /^\/api\/v1\/admin\//.test(req.url)) return fixed(res, 403, 'Forbidden');
      if (host === EXPECTED.controlHost) return fixed(res, behaviour.controlOpen ? 200 : 403, 'Forbidden');
      if (host === EXPECTED.operatorHost) return fixed(res, 403, 'Forbidden');
      if (host === EXPECTED.identityHost) return identity(req, res, body);
      return fixed(res, 404, 'Not found');
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port, log }));
  });
}

const configFor = (port, extra = {}) => ({
  albHost: '127.0.0.1',
  port,
  ca: pki.ca,
  email: EMAIL,
  password: PASSWORD,
  publicKeys: TEST_KEYS,
  ...extra,
});

async function withMock(options, fn) {
  const mock = await startMock(options);
  try {
    return await fn(mock);
  } finally {
    await new Promise((resolve) => mock.server.close(resolve));
  }
}

const byCheck = (results) => Object.fromEntries(results.map((r) => [r.check, r]));

before(() => {
  pki = makePki();
});
after(() => {
  if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
});

// --- Cookie extraction ---------------------------------------------------------------------------

describe('cookie extraction', () => {
  test('parses both Identity cookies with their attributes and decodes the value', () => {
    const jar = parseSetCookies([
      '__Host-mx_session=a%2Eb.c; Path=/; Max-Age=900; Secure; HttpOnly; SameSite=Lax',
      '__Secure-mx_refresh=rt%3D1; Path=/api/auth/refresh; Max-Age=60; secure; httponly; samesite=strict',
    ]);
    assert.deepEqual(jar['__Host-mx_session'], {
      value: 'a.b.c', path: '/', secure: true, httpOnly: true, sameSite: 'lax', maxAge: 900,
    });
    assert.equal(jar['__Secure-mx_refresh'].value, 'rt=1');
    assert.equal(jar['__Secure-mx_refresh'].path, '/api/auth/refresh');
    assert.equal(jar['__Secure-mx_refresh'].sameSite, 'strict');
  });

  test('accepts a single string, undefined, and ignores malformed entries', () => {
    assert.deepEqual(Object.keys(parseSetCookies('a=1; Path=/')), ['a']);
    assert.deepEqual(parseSetCookies(undefined), {});
    assert.deepEqual(parseSetCookies(['=novalue', 'noequals', 42]), {});
  });

  test('keeps a value that is not valid URI encoding', () => {
    assert.equal(parseSetCookies('a=%E0%A4%A; Path=/').a.value, '%E0%A4%A');
  });

  test('a cleared cookie has an empty value and Max-Age 0', () => {
    const jar = parseSetCookies('__Host-mx_session=; Path=/; Max-Age=0; Secure; HttpOnly');
    assert.equal(jar['__Host-mx_session'].value, '');
    assert.equal(jar['__Host-mx_session'].maxAge, 0);
  });

  test('path matching follows RFC 6265', () => {
    assert.equal(pathMatches('/', '/api/auth/logout'), true);
    assert.equal(pathMatches('/api/auth/refresh', '/api/auth/refresh'), true);
    assert.equal(pathMatches('/api/auth/refresh', '/api/auth/refresh/x'), true);
    assert.equal(pathMatches('/api/auth/refresh', '/api/auth/refreshx'), false);
    assert.equal(pathMatches('/api/auth/refresh', '/api/auth/logout'), false);
    assert.equal(pathMatches(undefined, '/x'), true);
  });

  test('the Cookie header is what a browser would send for each path', () => {
    const jar = parseSetCookies([
      '__Host-mx_session=tok; Path=/; Secure; HttpOnly',
      '__Secure-mx_refresh=r t; Path=/api/auth/refresh; Secure; HttpOnly',
    ]);
    assert.equal(cookieHeaderFor(jar, '/api/auth/session'), '__Host-mx_session=tok');
    assert.equal(cookieHeaderFor(jar, '/api/auth/logout'), '__Host-mx_session=tok');
    assert.equal(cookieHeaderFor(jar, '/api/auth/refresh'), '__Host-mx_session=tok; __Secure-mx_refresh=r%20t');
    assert.equal(cookieHeaderFor({}, '/'), undefined);
    assert.equal(cookieHeaderFor(parseSetCookies('a=; Path=/; Max-Age=0'), '/'), undefined);
  });
});

// --- JWT verification ----------------------------------------------------------------------------

describe('JWT verification', () => {
  const now = Math.floor(Date.now() / 1000);
  const verify = (token, extra = {}) => verifyAccessToken(token, { publicKeys: TEST_KEYS, nowSeconds: now, ...extra });

  test('a correct ES256 token passes', () => {
    assert.deepEqual(verify(makeJwt({ now })), { ok: true });
  });

  test('the committed key is the reviewed nonprod key (P-256, kid identity-nonprod-2026-11)', () => {
    assert.equal(COMMITTED_PUBLIC_KEYS.length, 1);
    assert.equal(COMMITTED_PUBLIC_KEYS[0].kid, 'identity-nonprod-2026-11');
    const tfvars = readFileSync(fileURLToPath(new URL('../envs/nonprod.tfvars', import.meta.url)), 'utf8');
    const line = tfvars.split('\n').find((l) => l.startsWith('identity_public_keys'));
    const fromTfvars = JSON.parse(JSON.parse(line.slice(line.indexOf('=') + 1).trim()));
    assert.deepEqual(fromTfvars, COMMITTED_PUBLIC_KEYS.map((k) => ({ ...k })));
    // A token signed by any other key fails against the committed one.
    assert.equal(verifyAccessToken(makeJwt({ now }), { nowSeconds: now }).code, 'jwt-signature');
  });

  test('invalid signatures fail', () => {
    assert.equal(verify(makeJwt({ now, key: OTHER.privateKey })).code, 'jwt-signature');
    const token = makeJwt({ now });
    const [h, , s] = token.split('.');
    const forged = `${h}.${b64({ iss: EXPECTED.iss, aud: [...EXPECTED.aud], iat: now, exp: now + 900, sub: 'acc_other' })}.${s}`;
    assert.equal(verify(forged).code, 'jwt-signature');
    assert.equal(verify(`${h}.${token.split('.')[1]}.${Buffer.alloc(64).toString('base64url')}`).code, 'jwt-signature');
    assert.equal(verify(`${h}.${token.split('.')[1]}.AAAA`).code, 'jwt-signature');
  });

  test('invalid key ids fail', () => {
    assert.equal(verify(makeJwt({ now, header: { kid: 'identity-nonprod-2026-10' } })).code, 'jwt-kid');
    assert.equal(verify(makeJwt({ now, header: { kid: undefined } })).code, 'jwt-kid');
    // The expected kid, but missing from the key set.
    assert.equal(verify(makeJwt({ now }), { publicKeys: [{ kid: 'other', publicKey: SIGNER.publicPem }] }).code, 'jwt-kid');
  });

  test('other algorithms fail before any key is used', () => {
    assert.equal(verify(makeJwt({ now, header: { alg: 'none' } })).code, 'jwt-alg');
    assert.equal(verify(makeJwt({ now, header: { alg: 'HS256' } })).code, 'jwt-alg');
    assert.equal(verify(makeJwt({ now, header: { alg: 'RS256' } })).code, 'jwt-alg');
  });

  test('expired tokens fail', () => {
    assert.equal(verify(makeJwt({ now: now - 901 })).code, 'jwt-expired');
    assert.equal(verify(makeJwt({ now, payload: { exp: now } })).code, 'jwt-expired');
  });

  test('a token issued in the future, or with another lifetime, fails', () => {
    assert.equal(verify(makeJwt({ now: now + 120 })).code, 'jwt-iat-future');
    assert.equal(verify(makeJwt({ now, payload: { exp: now + 3600 } })).code, 'jwt-lifetime');
    assert.equal(verify(makeJwt({ now, payload: { exp: undefined } })).code, 'jwt-time-claims');
    assert.equal(verify(makeJwt({ now, payload: { iat: 'x' } })).code, 'jwt-time-claims');
  });

  test('invalid audiences fail', () => {
    assert.equal(verify(makeJwt({ now, payload: { aud: ['munaxa-work'] } })).code, 'jwt-aud');
    assert.equal(verify(makeJwt({ now, payload: { aud: 'munaxa-work,munaxa-control' } })).code, 'jwt-aud');
    assert.equal(verify(makeJwt({ now, payload: { aud: ['munaxa-work', 'munaxa-control', 'munaxa-school'] } })).code, 'jwt-aud');
    assert.equal(verify(makeJwt({ now, payload: { aud: ['munaxa-work', 'munaxa-work'] } })).code, 'jwt-aud');
    assert.equal(verify(makeJwt({ now, payload: { aud: undefined } })).code, 'jwt-aud');
    assert.deepEqual(verify(makeJwt({ now, payload: { aud: ['munaxa-control', 'munaxa-work'] } })), { ok: true });
  });

  test('a wrong issuer fails', () => {
    assert.equal(verify(makeJwt({ now, payload: { iss: 'https://id.munaxa.com' } })).code, 'jwt-iss');
  });

  test('malformed input fails without throwing', () => {
    for (const bad of [undefined, null, 42, '', 'a.b', 'a.b.c.d', 'a..c', '!!.??.**', `${b64('x')}.${b64(1)}.AA`]) {
      assert.equal(verify(bad).code, 'jwt-malformed', String(bad));
    }
  });

  test('the result never carries a claim value', () => {
    const result = verify(makeJwt({ now, payload: { aud: ['munaxa-work'] } }));
    assert.deepEqual(Object.keys(result).sort(), ['code', 'ok']);
  });
});

// --- Safe output and error sanitisation ----------------------------------------------------------

describe('safe output formatting', () => {
  test('PASS and FAIL lines', () => {
    assert.equal(formatLine('login', true), 'PASS login');
    assert.equal(formatLine('refresh', false, 'status-401-invalid-credentials'), 'FAIL refresh status-401-invalid-credentials');
  });

  test('an unknown check name is never echoed', () => {
    assert.equal(formatLine(`login ${EMAIL}`, true), 'PASS probe');
    assert.equal(formatLine('__Host-mx_session=abc', false, 'x'), 'FAIL probe x');
  });

  test('an unsafe code is never echoed', () => {
    for (const code of [EMAIL, PASSWORD, 'has space', 'UPPER', 'eyJhbGciOi.x.y', 'a'.repeat(49), '', undefined, 7, '-lead']) {
      assert.equal(formatLine('login', false, code), 'FAIL login unsafe-code', String(code));
    }
  });

  test('summary counts and the overall result', () => {
    const all = CHECKS.map((check) => ({ check, ok: true }));
    assert.equal(formatSummary(all), 'SUMMARY pass=15 fail=0 total=15 result=PASS');
    all[3] = { check: CHECKS[3], ok: false, code: 'x' };
    assert.equal(formatSummary(all), 'SUMMARY pass=14 fail=1 total=15 result=FAIL');
    assert.equal(formatSummary(all.slice(0, 2)), 'SUMMARY pass=2 fail=0 total=15 result=FAIL');
    assert.equal(formatSummary([]), 'SUMMARY pass=0 fail=0 total=15 result=FAIL');
  });

  test('every line format the probe can print matches the allow-list', () => {
    const allowed = /^(PASS [a-z-]+|FAIL [a-z-]+ [a-z0-9][a-z0-9-]{0,47}|SUMMARY pass=\d+ fail=\d+ total=15 result=(PASS|FAIL))$/;
    for (const check of CHECKS) {
      assert.match(formatLine(check, true), allowed);
      assert.match(formatLine(check, false, 'status-503'), allowed);
    }
  });
});

describe('error sanitisation', () => {
  test('a message, stack or extra property never survives', () => {
    const error = new Error(`login failed for ${EMAIL} with ${PASSWORD}`);
    error.body = PASSWORD;
    assert.equal(sanitizeError(error), 'error');
    assert.equal(sanitizeError({ code: `E_${PASSWORD}` }), 'error');
    assert.equal(sanitizeError({ code: 'ENOTALLOWED' }), 'error');
    assert.equal(sanitizeError(PASSWORD), 'error');
    assert.equal(sanitizeError(undefined), 'error');
    assert.equal(sanitizeError(null), 'error');
  });

  test('known network and TLS codes map to fixed names', () => {
    assert.equal(sanitizeError(Object.assign(new Error('x'), { code: 'ECONNREFUSED' })), 'connection-refused');
    assert.equal(sanitizeError({ code: 'ERR_TLS_CERT_ALTNAME_INVALID' }), 'tls-name-mismatch');
    assert.equal(sanitizeError({ code: 'CERT_HAS_EXPIRED' }), 'tls-cert-expired');
    assert.equal(sanitizeError({ code: 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' }), 'tls-untrusted');
    assert.equal(sanitizeError({ name: 'AbortError' }), 'timeout');
  });

  test('a ProbeError keeps only a safe code', () => {
    assert.equal(sanitizeError(new ProbeError('status-401')), 'status-401');
    assert.equal(sanitizeError(new ProbeError(`bad ${EMAIL}`)), 'error');
  });
});

// --- Configuration -------------------------------------------------------------------------------

describe('configuration', () => {
  const baseEnv = () => ({
    PROBE_ALB_DNS: ALB,
    IDENTITY_OWNER_EMAIL: EMAIL,
    IDENTITY_OWNER_PASSWORD: PASSWORD,
    DIRECT_DATABASE_URL: 'postgres://owner:secret@db/identity',
    DATABASE_URL: 'postgres://x',
    DATABASE_MIGRATION_URL: 'postgres://y',
    NODE_ENV: 'production',
  });

  test('copies the credentials, then deletes them and every database URL from the environment', () => {
    const env = baseEnv();
    const result = readConfig(env);
    assert.equal(result.ok, true);
    assert.equal(result.config.email, EMAIL);
    assert.equal(result.config.albHost, ALB);
    assert.equal(result.config.port, 443);
    assert.equal(result.config.ca, undefined);
    for (const name of ['IDENTITY_OWNER_EMAIL', 'IDENTITY_OWNER_PASSWORD', 'DIRECT_DATABASE_URL', 'DATABASE_URL', 'DATABASE_MIGRATION_URL']) {
      assert.equal(name in env, false, name);
    }
  });

  test('deletes the credentials even when the configuration is refused', () => {
    const env = { ...baseEnv(), PROBE_ALB_DNS: '' };
    assert.deepEqual(readConfig(env), { ok: false, code: 'missing-alb-dns' });
    assert.equal('IDENTITY_OWNER_PASSWORD' in env, false);
  });

  test('refuses a run with certificate verification disabled', () => {
    assert.equal(readConfig({ ...baseEnv(), NODE_TLS_REJECT_UNAUTHORIZED: '0' }).code, 'tls-verification-disabled');
  });

  test('accepts only an eu-central-1 ELB DNS name', () => {
    for (const bad of ['id.test.munaxa.com', 'x.us-east-1.elb.amazonaws.com', '1.2.3.4', 'x.eu-central-1.elb.amazonaws.com.evil.example', 'a b.eu-central-1.elb.amazonaws.com']) {
      assert.equal(readConfig({ ...baseEnv(), PROBE_ALB_DNS: bad }).code, 'invalid-alb-dns', bad);
    }
    assert.equal(readConfig({ ...baseEnv(), PROBE_ALB_DNS: 'munaxa-nonprod-1.eu-central-1.elb.amazonaws.com' }).ok, true);
    assert.equal(readConfig({ ...baseEnv(), PROBE_ALB_DNS: ALB.toUpperCase() }).ok, true);
  });

  test('requires the operator email and password', () => {
    assert.equal(readConfig({ ...baseEnv(), IDENTITY_OWNER_EMAIL: '' }).code, 'missing-operator-email');
    assert.equal(readConfig({ ...baseEnv(), IDENTITY_OWNER_EMAIL: 'no-at-sign' }).code, 'missing-operator-email');
    assert.equal(readConfig({ ...baseEnv(), IDENTITY_OWNER_PASSWORD: undefined }).code, 'missing-operator-password');
  });

  test('accepts every baked task-definition value that equals the reviewed constant', () => {
    const env = {
      ...baseEnv(),
      PROBE_HOST: 'id.test.munaxa.com',
      PROBE_ORGANISATION: 'munaxa-group',
      PROBE_SIGNING_KID: 'identity-nonprod-2026-11',
      PROBE_ISSUER: 'https://id.test.munaxa.com',
      PROBE_AUDIENCES: 'munaxa-work,munaxa-control',
      PROBE_OPERATOR_HOST: 'operator-test.munaxa.com',
      PROBE_CONTROL_API_HOST: 'control-api.test.munaxa.com',
      PROBE_UNKNOWN_HOST: 'unknown.test.munaxa.com',
      PROBE_COMMIT: 'a'.repeat(40),
      PROBE_SHA256: 'b'.repeat(64),
      PROBE_PUBLIC_KEYS: JSON.stringify(COMMITTED_PUBLIC_KEYS),
    };
    assert.equal(readConfig(env).ok, true);
  });

  test('refuses any baked value that differs from the reviewed constant', () => {
    for (const [name, , code] of PINNED_ENV) {
      assert.equal(readConfig({ ...baseEnv(), [name]: 'other.example' }).code, code, name);
    }
    assert.equal(readConfig({ ...baseEnv(), PROBE_COMMIT: 'main' }).code, 'commit-format');
    assert.equal(readConfig({ ...baseEnv(), PROBE_SHA256: 'abc' }).code, 'sha256-format');
  });

  test('the public keys, when given, must be the committed key', () => {
    assert.equal(readConfig({ ...baseEnv(), PROBE_PUBLIC_KEYS: 'not json' }).code, 'public-keys-invalid');
    assert.equal(readConfig({ ...baseEnv(), PROBE_PUBLIC_KEYS: JSON.stringify(TEST_KEYS) }).code, 'public-keys-mismatch');
    assert.equal(readConfig({ ...baseEnv(), PROBE_PUBLIC_KEYS: '[]' }).code, 'public-keys-mismatch');
    // The same key in another PEM layout is still the same key.
    const reflowed = COMMITTED_PUBLIC_KEYS[0].publicKey.replace(/\n/g, '\r\n').concat('\r\n');
    assert.equal(readConfig({ ...baseEnv(), PROBE_PUBLIC_KEYS: JSON.stringify([{ kid: EXPECTED.kid, publicKey: reflowed }]) }).ok, true);
    // The checks always use the committed key, never the environment's.
    assert.equal(readConfig(baseEnv()).config.publicKeys, COMMITTED_PUBLIC_KEYS);
  });
});

// --- End to end against the mock -----------------------------------------------------------------

describe('the fifteen checks against a mock ALB and Identity', () => {
  test('all pass, in order, with Origin and organisation on login and refresh', async () => {
    await withMock({}, async ({ port, log }) => {
      const results = await runChecks(configFor(port));
      assert.deepEqual(results.map((r) => r.check), [...CHECKS]);
      assert.deepEqual(results.filter((r) => !r.ok), []);
      for (const login of log.logins) {
        assert.equal(login.organisation, 'munaxa-group');
        assert.equal(login.origin, 'https://id.test.munaxa.com');
      }
      assert.deepEqual(log.refreshes.map((r) => r.organisation), ['munaxa-group', 'munaxa-group']);
      // A browser does not send the refresh cookie to /api/auth/logout; neither does the probe.
      assert.deepEqual(log.logouts, [{ hadRefreshCookie: false }]);
      // SNI always equals Host, and no request reached any other host name.
      for (const r of log.requests) assert.equal(r.sni, r.host);
      assert.deepEqual(
        [...new Set(log.requests.map((r) => r.host))].sort(),
        ['control-api.test.munaxa.com', 'id.test.munaxa.com', 'operator-test.munaxa.com', 'unknown.test.munaxa.com'],
      );
    });
  });

  test('exactly one invalid-password attempt', async () => {
    await withMock({}, async ({ port, log }) => {
      await runChecks(configFor(port));
      assert.equal(log.wrongPasswordAttempts, 1);
      assert.equal(log.logins.length, 2);
    });
  });

  test('main prints only allow-listed lines and no credential, token or cookie', async () => {
    await withMock({}, async ({ port }) => {
      const lines = [];
      const env = { PROBE_ALB_DNS: ALB, IDENTITY_OWNER_EMAIL: EMAIL, IDENTITY_OWNER_PASSWORD: PASSWORD };
      const code = await main({
        env,
        write: (line) => lines.push(line),
        overrides: { albHost: '127.0.0.1', port, ca: pki.ca, publicKeys: TEST_KEYS },
      });
      assert.equal(code, 0);
      assert.equal(lines.length, 16);
      assert.equal(lines.at(-1), 'SUMMARY pass=15 fail=0 total=15 result=PASS');
      const text = lines.join('\n');
      for (const secret of [EMAIL, PASSWORD, 'eyJ', 'mx_session', 'mx_refresh', 'rt_', '@']) {
        assert.equal(text.includes(secret), false, secret);
      }
    });
  });

  test('a refresh token accepted after logout is a FAIL (replay-accepted)', async () => {
    await withMock({ behaviour: { replayAccepted: true } }, async ({ port }) => {
      const r = byCheck(await runChecks(configFor(port)));
      assert.deepEqual(r['refresh-replay-after-logout'], { check: 'refresh-replay-after-logout', ok: false, code: 'replay-accepted' });
    });
  });

  test('readiness without Redis or with another kid fails', async () => {
    await withMock({ behaviour: { cache: 'memory' } }, async ({ port }) => {
      assert.equal(byCheck(await runChecks(configFor(port)))['health-ready'].code, 'cache-not-redis');
    });
    await withMock({ behaviour: { readyKid: 'identity-nonprod-2026-10' } }, async ({ port }) => {
      assert.equal(byCheck(await runChecks(configFor(port)))['health-ready'].code, 'kid-mismatch');
    });
  });

  test('a token that does not verify fails jwt-verification and refresh', async () => {
    const bad = makeJwt({ key: OTHER.privateKey });
    await withMock({ behaviour: { badAccessToken: bad } }, async ({ port }) => {
      const r = byCheck(await runChecks(configFor(port)));
      assert.equal(r['jwt-verification'].code, 'jwt-signature');
      assert.equal(r.refresh.code, 'refreshed-jwt-signature');
    });
  });

  test('a refresh that does not rotate the token fails', async () => {
    await withMock({ behaviour: { noRotation: true } }, async ({ port }) => {
      assert.equal(byCheck(await runChecks(configFor(port))).refresh.code, 'no-refresh-cookie');
    });
  });

  test('a lockout on the wrong password reports a fixed code', async () => {
    await withMock({ behaviour: { wrongPasswordStatus: 429, wrongPasswordCode: 'AUTH_RATE_LIMITED' } }, async ({ port }) => {
      assert.equal(byCheck(await runChecks(configFor(port)))['invalid-password'].code, 'status-429-rate-limited');
    });
  });

  test('an open Control host fails control-other-path', async () => {
    await withMock({ behaviour: { controlOpen: true } }, async ({ port }) => {
      const r = byCheck(await runChecks(configFor(port)));
      assert.equal(r['control-other-path'].code, 'status-200');
      assert.equal(r['control-admin-path'].ok, true);
    });
  });

  test('a wrong password for the operator blocks the dependent checks', async () => {
    await withMock({}, async ({ port }) => {
      const r = byCheck(await runChecks(configFor(port, { password: 'not-the-password' })));
      assert.equal(r.login.code, 'status-401-invalid-credentials');
      for (const check of ['session-authenticated', 'jwt-verification', 'refresh', 'logout', 'refresh-replay-after-logout']) {
        assert.equal(r[check].code, 'blocked', check);
      }
      assert.equal(r['operator-host'].ok, true);
    });
  });
});

describe('certificate verification is never disabled', () => {
  test('a certificate for another name fails every check with tls-name-mismatch', async () => {
    await withMock({ tls: 'wrong-name' }, async ({ port }) => {
      const results = await runChecks(configFor(port));
      assert.equal(results.length, 15);
      assert.equal(byCheck(results)['tls-certificate'].code, 'tls-name-mismatch');
      assert.equal(byCheck(results)['health-live'].code, 'tls-name-mismatch');
      assert.equal(results.filter((r) => r.ok).length, 0);
    });
  });

  test('an untrusted authority fails (no test CA given: the system store is used)', async () => {
    await withMock({}, async ({ port }) => {
      const r = byCheck(await runChecks(configFor(port, { ca: undefined })));
      assert.equal(r['tls-certificate'].ok, false);
      assert.match(r['tls-certificate'].code, /^tls-/);
      assert.equal(r['health-live'].ok, false);
    });
  });

  test('a refused connection reports a fixed code', async () => {
    const results = await runChecks(configFor(1));
    assert.equal(byCheck(results)['tls-certificate'].code, 'connection-refused');
  });
});

// --- Static properties of the program ------------------------------------------------------------

describe('the probe source', () => {
  const source = PROBE_SOURCE.toString('utf8');
  const code = source
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//'))
    .join('\n');

  test('imports only node: built-in modules, with no relative import', () => {
    const imports = [...source.matchAll(/^\s*import\s[^'"]*['"]([^'"]+)['"]/gm)].map((m) => m[1]);
    assert.ok(imports.length > 0);
    for (const specifier of imports) assert.match(specifier, /^node:[a-z_/]+$/);
    assert.equal(/\bimport\(\s*['"]\.{1,2}\//.test(code), false);
    assert.equal(/\brequire\(/.test(code), false);
  });

  test('never disables or overrides certificate checking, and never logs freely', () => {
    assert.equal(/rejectUnauthorized/.test(code), false);
    assert.equal(/checkServerIdentity/.test(code), false);
    assert.equal(/NODE_TLS_REJECT_UNAUTHORIZED\s*=[^=]/.test(code), false);
    assert.equal(/console\./.test(code), false);
    assert.equal(/process\.stderr/.test(code), false);
  });

  test('makes no AWS call and names no URL beyond the expected origin', () => {
    assert.equal(/amazonaws\.com\/|aws-sdk|@aws-sdk/.test(code.replace(/elb\\\.amazonaws\\\.com/g, '')), false);
    const urls = [...code.matchAll(/https:\/\/[a-z0-9.-]+/g)].map((m) => m[0]);
    assert.deepEqual([...new Set(urls)].sort(), ['https://id.test.munaxa.com']);
  });

  test('fits the loader size cap', () => {
    assert.ok(PROBE_SOURCE.length < 262144);
  });

  test('importing the module runs nothing', async () => {
    const lines = [];
    const original = process.stdout.write;
    process.stdout.write = (chunk, ...rest) => {
      lines.push(String(chunk));
      return original.call(process.stdout, chunk, ...rest);
    };
    try {
      await import(`./identity-session-probe.mjs?inert=${Date.now()}`);
    } finally {
      process.stdout.write = original;
    }
    assert.equal(lines.some((l) => /^(PASS|FAIL|SUMMARY) /.test(l)), false);
    assert.equal(typeof probe, 'function');
  });
});

// --- Loading from memory ---------------------------------------------------------------------------
//
// The loader itself is Workstream 2's (infra/aws/stack/scripts/identity-probe-loader.mjs, tested
// there). These tests prove the probe meets the loader's contract: the exact bytes, imported from a
// data: URL in a fresh Node process, expose a default export that runs the checks once and returns
// the exit code, and print nothing on import.

describe('loading the probe from a data: URL', () => {
  const sha256Hex = (buffer) => createHash('sha256').update(buffer).digest('hex');
  // A minimal stand-in for the loader's last two steps, in a separate process.
  const stub = [
    "const b=Buffer.from(process.env.T_SRC,'base64');",
    "if((await import('node:crypto')).createHash('sha256').update(b).digest('hex')!==process.env.T_SHA)process.exit(9);",
    "const m=await import('data:text/javascript;base64,'+b.toString('base64'));",
    "if(typeof m.default!=='function')process.exit(8);",
    "process.exitCode=await m.default(process.env);",
  ].join('');
  const run = (env) =>
    spawnSync(process.execPath, ['--input-type=module', '-e', stub], {
      env: { PATH: process.env.PATH, T_SRC: PROBE_SOURCE.toString('base64'), T_SHA: sha256Hex(PROBE_SOURCE), ...env },
      encoding: 'utf8',
      timeout: 20_000,
    });

  test('the default export runs once and returns the exit code (config error without env)', () => {
    const result = run({});
    assert.equal(result.status, 2, result.stdout + result.stderr);
    assert.equal(result.stdout, 'FAIL config missing-alb-dns\nSUMMARY pass=0 fail=0 total=15 result=FAIL\n');
    assert.equal(result.stderr, '');
  });

  test('credentials given to a refused run are never printed', () => {
    const result = run({ PROBE_ALB_DNS: 'evil.example', IDENTITY_OWNER_EMAIL: EMAIL, IDENTITY_OWNER_PASSWORD: PASSWORD });
    assert.equal(result.status, 2);
    assert.equal(result.stdout, 'FAIL config invalid-alb-dns\nSUMMARY pass=0 fail=0 total=15 result=FAIL\n');
    assert.equal((result.stdout + result.stderr).includes(PASSWORD), false);
    assert.equal((result.stdout + result.stderr).includes(EMAIL), false);
  });

  test('NODE_TLS_REJECT_UNAUTHORIZED=0 is refused before any connection', () => {
    const result = run({ PROBE_ALB_DNS: ALB, IDENTITY_OWNER_EMAIL: EMAIL, IDENTITY_OWNER_PASSWORD: PASSWORD, NODE_TLS_REJECT_UNAUTHORIZED: '0' });
    assert.equal(result.status, 2);
    assert.match(result.stdout, /^FAIL config tls-verification-disabled\n/);
  });
});
