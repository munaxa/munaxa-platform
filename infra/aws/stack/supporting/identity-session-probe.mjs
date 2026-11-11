// Identity non-production session probe.
//
// Runs once, inside AWS, as a one-off ECS task on the Identity API image (node:22-alpine, read-only
// root filesystem). It reaches the ALB by its AWS DNS name, sends SNI and Host for the real host
// names, checks Identity end to end, and prints only fixed result lines:
//
//   PASS <check>
//   FAIL <check> <safe-code>
//   SUMMARY pass=<n> fail=<n> total=15 result=PASS|FAIL
//
// It never prints a password, token, cookie, header, response body, email address or error
// message. Every output line goes through formatLine(), which accepts only known check names and
// codes of the form [a-z0-9-], and a last guard drops any line that contains a credential or a
// token seen during the run.
//
// Constraints, from the owner's Workstream 1 brief (11 Nov 2026) and the readiness review (PR #89):
//   - Node.js 22, built-in modules only, one self-contained ES module (it is loaded from a data:
//     URL, so a relative import cannot resolve);
//   - certificate verification is never disabled: no rejectUnauthorized option, no custom
//     checkServerIdentity, and NODE_TLS_REJECT_UNAUTHORIZED=0 is refused as a configuration error;
//   - no browser, no public DNS record for the test host names, no public test service, and no AWS
//     API call (the task has no task role);
//   - login and refresh both send Origin https://id.test.munaxa.com and organisation munaxa-group
//     (Identity has no default organisation: variables.tf identity_default_organisation = "");
//   - exactly one wrong-password attempt (Identity's lockout is keyed by the identifier);
//   - HTTP-to-HTTPS is not tested here: the task's security groups allow no outbound port 80. It is
//     configuration evidence from DescribeListeners (HTTP listener: redirect HTTPS 443, HTTP_301).
//
// Expected values, each taken from configuration on main 49c51f3, not chosen here:
//   hosts            infra/aws/stack/envs/nonprod.tfvars hosts.{identity,operator,control_api}
//   organisation     variables.tf identity_operator_organisation.slug (ops.tf bootstrap command)
//   kid, public key  envs/nonprod.tfvars identity_signing_kid, identity_public_keys
//   alg              services.tf IDENTITY_SIGNING_ALGORITHM = "ES256"
//   iss              services.tf IDENTITY_BASE_URL = https:// + hosts.identity
//   aud              services.tf IDENTITY_AUTH_AUDIENCE = "munaxa-work,munaxa-control"
//   lifetime 900 s   @munaxa/auth access-token TTL default (no ACCESS_TOKEN_TTL in the task)
//   cookies          Identity 5277d71 apps/api/src/auth/cookies.ts: __Host-mx_session (Path=/),
//                    __Secure-mx_refresh (Path=/api/auth/refresh)
//   routes           Identity 5277d71 auth.controller.ts, health.controller.ts
//   edge rules       edge.tf rules 10, 21, 39 and the HTTPS default action (404 "Not found")
import { createPublicKey, randomBytes, verify as verifySignature } from 'node:crypto';
import { request as httpsRequest } from 'node:https';
import { connect as tlsConnect } from 'node:tls';
import { pathToFileURL } from 'node:url';

// --- Reviewed constants --------------------------------------------------------------------------

export const COMMITTED_PUBLIC_KEYS = Object.freeze([
  Object.freeze({
    kid: 'identity-nonprod-2026-11',
    publicKey:
      '-----BEGIN PUBLIC KEY-----\n' +
      'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE1PulSDhEOvX3B61NzQwO20+q4+42\n' +
      '0KcstlgmQccrRJy+byuVwhz2HiJp1itFmUBkugYOR087NqwNr2Kowk5fRQ==\n' +
      '-----END PUBLIC KEY-----',
  }),
]);

export const EXPECTED = Object.freeze({
  identityHost: 'id.test.munaxa.com',
  operatorHost: 'operator-test.munaxa.com',
  controlHost: 'control-api.test.munaxa.com',
  // Covered by the *.test.munaxa.com certificate, matched by no listener rule.
  unknownHost: 'unknown.test.munaxa.com',
  origin: 'https://id.test.munaxa.com',
  organisation: 'munaxa-group',
  alg: 'ES256',
  kid: 'identity-nonprod-2026-11',
  iss: 'https://id.test.munaxa.com',
  aud: Object.freeze(['munaxa-work', 'munaxa-control']),
  lifetimeSeconds: 900,
  skewSeconds: 30,
  cache: 'redis',
  sessionCookie: '__Host-mx_session',
  refreshCookie: '__Secure-mx_refresh',
  refreshPath: '/api/auth/refresh',
});

/** The fifteen checks, in the order they run and print. */
export const CHECKS = Object.freeze([
  'tls-certificate',
  'health-live',
  'health-ready',
  'session-unauthenticated',
  'login',
  'session-authenticated',
  'jwt-verification',
  'refresh',
  'logout',
  'refresh-replay-after-logout',
  'invalid-password',
  'operator-host',
  'control-admin-path',
  'control-other-path',
  'unknown-host',
]);

// Names the probe may print besides the fifteen checks.
const META_NAMES = new Set(['config', 'probe']);

// Environment variables that hold credentials. Copied once, then deleted from process.env before
// any network call. The database URLs are never read: they are deleted unread, because the
// bootstrap task definition (ops.tf) injects the migration owner's URL as DIRECT_DATABASE_URL.
const CREDENTIAL_ENV = Object.freeze(['IDENTITY_OWNER_EMAIL', 'IDENTITY_OWNER_PASSWORD']);
const DATABASE_ENV = Object.freeze(['DIRECT_DATABASE_URL', 'DATABASE_URL', 'DATABASE_MIGRATION_URL']);

const ALB_DNS = /^(internal-)?[a-z0-9][a-z0-9-]{0,62}\.eu-central-1\.elb\.amazonaws\.com$/;
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_BODY_BYTES = 64 * 1024;

// --- How it is loaded ----------------------------------------------------------------------------
//
// The probe task definition (Workstream 2, infra/aws/stack/identity-probe.tf) carries the loader,
// infra/aws/stack/scripts/identity-probe-loader.mjs, with the commit and the SHA256 written in by
// Terraform. It downloads this file from that raw GitHub commit only, refuses a redirect, checks
// the hash, imports the verified bytes from a data: URL (nothing touches the read-only filesystem)
// and runs `process.exitCode = await m.default(process.env)`. So this file must stay one
// self-contained module that imports only node: built-ins and runs nothing on import.

// --- Safe output ---------------------------------------------------------------------------------

const SAFE_CODE = /^[a-z0-9][a-z0-9-]{0,47}$/;

/** One output line. Unknown names and codes are replaced, never echoed. */
export function formatLine(check, ok, code) {
  const name = CHECKS.includes(check) || META_NAMES.has(check) ? check : 'probe';
  if (ok === true) return `PASS ${name}`;
  const safe = typeof code === 'string' && SAFE_CODE.test(code) ? code : 'unsafe-code';
  return `FAIL ${name} ${safe}`;
}

export function formatSummary(results) {
  const pass = results.filter((r) => r.ok).length;
  const fail = results.length - pass;
  const complete = results.length === CHECKS.length;
  return `SUMMARY pass=${pass} fail=${fail} total=${CHECKS.length} result=${
    complete && fail === 0 ? 'PASS' : 'FAIL'
  }`;
}

// Node's error codes that are safe to print (they describe the failure class, never data).
const NETWORK_CODES = new Map([
  ['ECONNREFUSED', 'connection-refused'],
  ['ECONNRESET', 'connection-reset'],
  ['ETIMEDOUT', 'timeout'],
  ['EHOSTUNREACH', 'host-unreachable'],
  ['ENETUNREACH', 'network-unreachable'],
  ['ENOTFOUND', 'dns-not-found'],
  ['EAI_AGAIN', 'dns-temporary'],
  ['EPIPE', 'connection-closed'],
  ['ECONNABORTED', 'connection-aborted'],
  ['ERR_TLS_CERT_ALTNAME_INVALID', 'tls-name-mismatch'],
  ['CERT_HAS_EXPIRED', 'tls-cert-expired'],
  ['CERT_NOT_YET_VALID', 'tls-cert-not-yet-valid'],
  ['DEPTH_ZERO_SELF_SIGNED_CERT', 'tls-self-signed'],
  ['SELF_SIGNED_CERT_IN_CHAIN', 'tls-self-signed-chain'],
  ['UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'tls-untrusted'],
  ['UNABLE_TO_GET_ISSUER_CERT', 'tls-untrusted'],
  ['UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'tls-untrusted'],
  ['CERT_SIGNATURE_FAILURE', 'tls-bad-signature'],
  ['CERT_REVOKED', 'tls-revoked'],
  ['ERR_SSL_WRONG_VERSION_NUMBER', 'tls-protocol'],
  ['ERR_SSL_UNSUPPORTED_PROTOCOL', 'tls-protocol'],
  ['ERR_SSL_TLSV1_ALERT_PROTOCOL_VERSION', 'tls-protocol'],
  ['ERR_SSL_SSLV3_ALERT_HANDSHAKE_FAILURE', 'tls-handshake'],
]);

/**
 * Reduces any thrown value to a fixed code. A message, a stack or a property other than the
 * error's code never leaves this function.
 */
export function sanitizeError(error) {
  if (error instanceof ProbeError) return error.code;
  const code = error !== null && typeof error === 'object' ? error.code : undefined;
  if (typeof code === 'string' && NETWORK_CODES.has(code)) return NETWORK_CODES.get(code);
  if (error !== null && typeof error === 'object' && error.name === 'AbortError') return 'timeout';
  return 'error';
}

export class ProbeError extends Error {
  constructor(code) {
    super(code);
    this.code = SAFE_CODE.test(code) ? code : 'error';
  }
}

const fail = (code) => {
  throw new ProbeError(code);
};

// --- Cookies -------------------------------------------------------------------------------------

/**
 * Parses Set-Cookie header values into { name: { value, path, secure, httpOnly, sameSite, maxAge } }.
 * The value is URI-decoded (Identity encodes it). Attribute names are case-insensitive.
 */
export function parseSetCookies(headerValues) {
  const list = headerValues === undefined ? [] : [].concat(headerValues);
  const jar = {};
  for (const line of list) {
    if (typeof line !== 'string') continue;
    const [pair, ...attributes] = line.split(';');
    const eq = pair.indexOf('=');
    if (eq <= 0) continue;
    const name = pair.slice(0, eq).trim();
    let value = pair.slice(eq + 1).trim();
    try {
      value = decodeURIComponent(value);
    } catch {
      // Keep the raw value: a cookie that is not URI-encoded is still a cookie.
    }
    const cookie = { value, path: undefined, secure: false, httpOnly: false, sameSite: undefined, maxAge: undefined };
    for (const attribute of attributes) {
      const [rawKey, ...rest] = attribute.split('=');
      const key = rawKey.trim().toLowerCase();
      const attrValue = rest.join('=').trim();
      if (key === 'path') cookie.path = attrValue;
      else if (key === 'secure') cookie.secure = true;
      else if (key === 'httponly') cookie.httpOnly = true;
      else if (key === 'samesite') cookie.sameSite = attrValue.toLowerCase();
      else if (key === 'max-age') cookie.maxAge = Number.parseInt(attrValue, 10);
    }
    jar[name] = cookie;
  }
  return jar;
}

/** RFC 6265 5.1.4 path-match: what a browser would send to requestPath. */
export function pathMatches(cookiePath, requestPath) {
  const cp = cookiePath === undefined || cookiePath === '' ? '/' : cookiePath;
  if (requestPath === cp) return true;
  if (!requestPath.startsWith(cp)) return false;
  return cp.endsWith('/') || requestPath.charAt(cp.length) === '/';
}

/** The Cookie header a browser would send for requestPath, or undefined for none. */
export function cookieHeaderFor(jar, requestPath) {
  const pairs = [];
  for (const [name, cookie] of Object.entries(jar)) {
    if (cookie.value === '' || cookie.maxAge === 0) continue;
    if (!pathMatches(cookie.path, requestPath)) continue;
    pairs.push(`${name}=${encodeURIComponent(cookie.value)}`);
  }
  return pairs.length === 0 ? undefined : pairs.join('; ');
}

// --- JWT -----------------------------------------------------------------------------------------

const decodePart = (part) => JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));

/**
 * Verifies an access token offline against the committed public keys.
 * Returns { ok: true } or { ok: false, code }; never throws and never returns a claim value.
 */
export function verifyAccessToken(
  token,
  { publicKeys = COMMITTED_PUBLIC_KEYS, expected = EXPECTED, nowSeconds = Math.floor(Date.now() / 1000) } = {},
) {
  const parts = typeof token === 'string' ? token.split('.') : [];
  if (parts.length !== 3 || parts.some((p) => p === '' || !/^[A-Za-z0-9_-]+$/.test(p))) {
    return { ok: false, code: 'jwt-malformed' };
  }
  let header;
  let payload;
  try {
    header = decodePart(parts[0]);
    payload = decodePart(parts[1]);
  } catch {
    return { ok: false, code: 'jwt-malformed' };
  }
  if (header === null || typeof header !== 'object' || payload === null || typeof payload !== 'object') {
    return { ok: false, code: 'jwt-malformed' };
  }
  if (header.alg !== expected.alg) return { ok: false, code: 'jwt-alg' };
  if (header.kid !== expected.kid) return { ok: false, code: 'jwt-kid' };
  const entry = publicKeys.find((k) => k.kid === header.kid);
  if (entry === undefined) return { ok: false, code: 'jwt-kid' };

  let valid = false;
  try {
    const key = createPublicKey(entry.publicKey);
    if (key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails?.namedCurve !== 'prime256v1') {
      return { ok: false, code: 'jwt-key-type' };
    }
    const signature = Buffer.from(parts[2], 'base64url');
    valid =
      signature.length === 64 &&
      verifySignature('sha256', Buffer.from(`${parts[0]}.${parts[1]}`), { key, dsaEncoding: 'ieee-p1363' }, signature);
  } catch {
    valid = false;
  }
  if (!valid) return { ok: false, code: 'jwt-signature' };

  if (payload.iss !== expected.iss) return { ok: false, code: 'jwt-iss' };
  const aud = payload.aud;
  const audOk =
    Array.isArray(aud) &&
    aud.length === expected.aud.length &&
    new Set(aud).size === aud.length &&
    expected.aud.every((a) => aud.includes(a));
  if (!audOk) return { ok: false, code: 'jwt-aud' };

  const { exp, iat } = payload;
  if (!Number.isInteger(exp) || !Number.isInteger(iat)) return { ok: false, code: 'jwt-time-claims' };
  if (exp <= nowSeconds) return { ok: false, code: 'jwt-expired' };
  if (iat > nowSeconds + expected.skewSeconds) return { ok: false, code: 'jwt-iat-future' };
  if (exp - iat !== expected.lifetimeSeconds) return { ok: false, code: 'jwt-lifetime' };
  return { ok: true };
}

// --- Configuration -------------------------------------------------------------------------------

const samePublicKeys = (a, b) => {
  try {
    if (!Array.isArray(a) || a.length !== b.length) return false;
    return b.every((k) => {
      const other = a.find((x) => x !== null && typeof x === 'object' && x.kid === k.kid);
      if (other === undefined || typeof other.publicKey !== 'string') return false;
      const der = (pem) => createPublicKey(pem).export({ type: 'spki', format: 'der' });
      return der(other.publicKey).equals(der(k.publicKey));
    });
  } catch {
    return false;
  }
};

// Optional non-secret values the task definition may bake in. When present they must equal the
// reviewed constants; the constants are what the checks use, so a changed task definition cannot
// point the probe at another host, issuer or key.
export const PINNED_ENV = Object.freeze([
  ['PROBE_HOST', EXPECTED.identityHost, 'host-mismatch'],
  ['PROBE_ORGANISATION', EXPECTED.organisation, 'organisation-mismatch'],
  ['PROBE_SIGNING_KID', EXPECTED.kid, 'kid-mismatch'],
  ['PROBE_ISSUER', EXPECTED.iss, 'issuer-mismatch'],
  ['PROBE_AUDIENCES', EXPECTED.aud.join(','), 'audiences-mismatch'],
  ['PROBE_OPERATOR_HOST', EXPECTED.operatorHost, 'operator-host-mismatch'],
  ['PROBE_CONTROL_API_HOST', EXPECTED.controlHost, 'control-host-mismatch'],
  ['PROBE_UNKNOWN_HOST', EXPECTED.unknownHost, 'unknown-host-mismatch'],
]);

/**
 * Reads the environment once. Credentials are copied, then the credential and database variables
 * are deleted from `env` before anything else happens. Optional non-secret values, when present,
 * must equal the reviewed constants; the constants are what the checks use.
 * Returns { ok: true, config } or { ok: false, code }.
 */
export function readConfig(env) {
  const email = env.IDENTITY_OWNER_EMAIL ?? '';
  const password = env.IDENTITY_OWNER_PASSWORD ?? '';
  for (const name of [...CREDENTIAL_ENV, ...DATABASE_ENV]) delete env[name];

  if (env.NODE_TLS_REJECT_UNAUTHORIZED === '0') return { ok: false, code: 'tls-verification-disabled' };
  const alb = (env.PROBE_ALB_DNS ?? '').trim().toLowerCase();
  if (alb === '') return { ok: false, code: 'missing-alb-dns' };
  if (!ALB_DNS.test(alb)) return { ok: false, code: 'invalid-alb-dns' };
  if (email === '' || !email.includes('@')) return { ok: false, code: 'missing-operator-email' };
  if (password === '') return { ok: false, code: 'missing-operator-password' };

  for (const [name, value, code] of PINNED_ENV) {
    if (env[name] !== undefined && env[name] !== value) return { ok: false, code };
  }
  if (env.PROBE_COMMIT !== undefined && !/^[0-9a-f]{40}$/.test(env.PROBE_COMMIT)) {
    return { ok: false, code: 'commit-format' };
  }
  if (env.PROBE_SHA256 !== undefined && !/^[0-9a-f]{64}$/.test(env.PROBE_SHA256)) {
    return { ok: false, code: 'sha256-format' };
  }
  if (env.PROBE_PUBLIC_KEYS !== undefined) {
    let parsed;
    try {
      parsed = JSON.parse(env.PROBE_PUBLIC_KEYS);
    } catch {
      return { ok: false, code: 'public-keys-invalid' };
    }
    if (!samePublicKeys(parsed, COMMITTED_PUBLIC_KEYS)) return { ok: false, code: 'public-keys-mismatch' };
  }
  return {
    ok: true,
    config: { albHost: alb, port: 443, email, password, publicKeys: COMMITTED_PUBLIC_KEYS },
  };
}

// --- HTTPS ---------------------------------------------------------------------------------------

/**
 * One HTTPS request to the ALB, with SNI and Host set to `hostname`. Certificate verification is
 * Node's default (the system trust store, the name checked against `servername`); `ca` exists only
 * so the unit tests can trust their own local certificate authority, and main() never sets it.
 * Resolves { status, headers, body } where body is a string capped at 64 KB.
 */
export function httpsCall(target, hostname, method, path, { headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : Buffer.from(JSON.stringify(body));
    const options = {
      host: target.albHost,
      port: target.port,
      servername: hostname,
      method,
      path,
      agent: false,
      minVersion: 'TLSv1.2',
      timeout: REQUEST_TIMEOUT_MS,
      headers: {
        host: hostname,
        accept: 'application/json',
        'user-agent': 'munaxa-identity-session-probe/1',
        ...(payload === undefined ? {} : { 'content-type': 'application/json', 'content-length': payload.length }),
        ...headers,
      },
      ...(target.ca === undefined ? {} : { ca: target.ca }),
    };
    const req = httpsRequest(options, (res) => {
      const chunks = [];
      let size = 0;
      res.on('data', (chunk) => {
        size += chunk.length;
        if (size > MAX_BODY_BYTES) {
          req.destroy(new ProbeError('body-too-large'));
          return;
        }
        chunks.push(chunk);
      });
      res.on('end', () =>
        resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }),
      );
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new ProbeError('timeout')));
    req.on('error', reject);
    if (payload !== undefined) req.write(payload);
    req.end();
  });
}

/** A TLS handshake only. Resolves when the certificate verifies for `hostname`. */
export function tlsHandshake(target, hostname, nowMs = Date.now()) {
  return new Promise((resolve, reject) => {
    const socket = tlsConnect({
      host: target.albHost,
      port: target.port,
      servername: hostname,
      minVersion: 'TLSv1.2',
      ...(target.ca === undefined ? {} : { ca: target.ca }),
    });
    socket.setTimeout(REQUEST_TIMEOUT_MS, () => socket.destroy(new ProbeError('timeout')));
    socket.once('secureConnect', () => {
      try {
        if (!socket.authorized) fail('tls-unauthorized');
        const protocol = socket.getProtocol();
        if (protocol !== 'TLSv1.3' && protocol !== 'TLSv1.2') fail('tls-protocol');
        const cert = socket.getPeerCertificate();
        const from = Date.parse(cert.valid_from);
        const to = Date.parse(cert.valid_to);
        if (!(from <= nowMs && nowMs < to)) fail('tls-validity');
        socket.end();
        resolve();
      } catch (error) {
        socket.destroy();
        reject(error);
      }
    });
    socket.once('error', reject);
  });
}

const json = (response) => {
  try {
    return JSON.parse(response.body);
  } catch {
    return undefined;
  }
};

const expectStatus = (response, status) => {
  if (response.status !== status) fail(`status-${response.status}`);
};

// Codes from Identity's refusal bodies that may be printed (auth.controller.ts refuse()).
const IDENTITY_CODES = new Map([
  ['AUTH_INVALID_CREDENTIALS', 'invalid-credentials'],
  ['AUTH_RATE_LIMITED', 'rate-limited'],
  ['AUTH_MFA_REQUIRED', 'mfa-required'],
  ['AUTH_PASSWORD_POLICY', 'password-policy'],
  ['AUTH_UNAVAILABLE', 'unavailable'],
]);

const refusalCode = (response) => {
  const code = json(response)?.code;
  const mapped = typeof code === 'string' ? IDENTITY_CODES.get(code) : undefined;
  return mapped === undefined ? `status-${response.status}` : `status-${response.status}-${mapped}`;
};

const expectFixedResponse = (response, status, text) => {
  expectStatus(response, status);
  if (response.body.trim() !== text) fail('body-mismatch');
};

// --- The checks ----------------------------------------------------------------------------------

/**
 * Runs the fifteen checks in order and returns [{ check, ok, code }]. `sensitive` collects every
 * credential and token value seen, for the output guard. Nothing here prints.
 */
export async function runChecks(config, { nowSeconds = () => Math.floor(Date.now() / 1000), sensitive = new Set() } = {}) {
  const target = { albHost: config.albHost, port: config.port, ca: config.ca };
  const id = EXPECTED.identityHost;
  const origin = { origin: EXPECTED.origin };
  const results = [];
  const state = { jar: {}, loggedIn: false, refreshed: false, loggedOut: false, replayToken: undefined };
  sensitive.add(config.email);
  sensitive.add(config.password);

  const remember = (jar) => {
    for (const [name, cookie] of Object.entries(jar)) {
      if (cookie.value !== '') sensitive.add(cookie.value);
      state.jar[name] = cookie;
    }
  };

  const run = async (check, fn) => {
    try {
      await fn();
      results.push({ check, ok: true });
    } catch (error) {
      results.push({ check, ok: false, code: sanitizeError(error) });
    }
  };
  const requires = (condition) => {
    if (!condition) fail('blocked');
  };

  // 1. TLS certificate for id.test.munaxa.com.
  await run('tls-certificate', () => tlsHandshake(target, id, nowSeconds() * 1000));

  // 2. Liveness.
  await run('health-live', async () => {
    const r = await httpsCall(target, id, 'GET', '/api/auth/health/live');
    expectStatus(r, 200);
    if (json(r)?.status !== 'ok') fail('body-mismatch');
  });

  // 3. Readiness: Redis cache and the expected signing key id.
  await run('health-ready', async () => {
    const r = await httpsCall(target, id, 'GET', '/api/auth/health/ready');
    expectStatus(r, 200);
    const body = json(r);
    if (body?.status !== 'ok') fail('body-mismatch');
    if (body.cache !== EXPECTED.cache) fail('cache-not-redis');
    if (body.signingKid !== EXPECTED.kid) fail('kid-mismatch');
  });

  // 4. No cookie, no session.
  await run('session-unauthenticated', async () => {
    const r = await httpsCall(target, id, 'GET', '/api/auth/session');
    expectStatus(r, 200);
    if (json(r)?.signedIn !== false) fail('signed-in-without-cookie');
  });

  // 5. Valid login: Origin and organisation both sent; both cookies set with the expected attributes.
  await run('login', async () => {
    const r = await httpsCall(target, id, 'POST', '/api/auth/login', {
      headers: origin,
      body: { identifier: config.email, password: config.password, organisation: EXPECTED.organisation },
    });
    const jar = parseSetCookies(r.headers['set-cookie']);
    remember(jar);
    if (r.status !== 200) fail(refusalCode(r));
    if (json(r)?.ok !== true) fail('body-mismatch');
    const session = jar[EXPECTED.sessionCookie];
    const refresh = jar[EXPECTED.refreshCookie];
    if (session === undefined || session.value === '') fail('no-session-cookie');
    if (refresh === undefined || refresh.value === '') fail('no-refresh-cookie');
    if (!session.secure || !session.httpOnly || session.path !== '/') fail('session-cookie-attributes');
    if (!refresh.secure || !refresh.httpOnly || refresh.path !== EXPECTED.refreshPath) {
      fail('refresh-cookie-attributes');
    }
    state.loggedIn = true;
  });

  // 6. The session cookie is accepted.
  await run('session-authenticated', async () => {
    requires(state.loggedIn);
    const path = '/api/auth/session';
    const r = await httpsCall(target, id, 'GET', path, { headers: { cookie: cookieHeaderFor(state.jar, path) } });
    expectStatus(r, 200);
    const body = json(r);
    if (body?.signedIn !== true) fail('not-signed-in');
    if (!Number.isFinite(body.expiresAt)) fail('body-mismatch');
  });

  // 7. Offline ES256 verification of the access token against the committed public key.
  await run('jwt-verification', async () => {
    requires(state.loggedIn);
    const result = verifyAccessToken(state.jar[EXPECTED.sessionCookie]?.value, {
      publicKeys: config.publicKeys,
      nowSeconds: nowSeconds(),
    });
    if (!result.ok) fail(result.code);
  });

  // 8. Refresh with organisation munaxa-group; the refresh token must rotate and the new access token
  //    must verify too. The browser sends the refresh cookie here, and only here (its Path).
  await run('refresh', async () => {
    requires(state.loggedIn);
    const before = state.jar[EXPECTED.refreshCookie]?.value;
    const path = EXPECTED.refreshPath;
    const r = await httpsCall(target, id, 'POST', path, {
      headers: { ...origin, cookie: cookieHeaderFor(state.jar, path) },
      body: { organisation: EXPECTED.organisation },
    });
    const jar = parseSetCookies(r.headers['set-cookie']);
    remember(jar);
    if (r.status !== 200) fail(refusalCode(r));
    if (json(r)?.ok !== true) fail('body-mismatch');
    const after = jar[EXPECTED.refreshCookie]?.value;
    if (after === undefined || after === '') fail('no-refresh-cookie');
    if (after === before) fail('refresh-not-rotated');
    const access = verifyAccessToken(jar[EXPECTED.sessionCookie]?.value, {
      publicKeys: config.publicKeys,
      nowSeconds: nowSeconds(),
    });
    if (!access.ok) fail(`refreshed-${access.code}`);
    state.refreshed = true;
  });

  // 9. Logout, with the cookies a browser would send to /api/auth/logout (the session cookie only;
  //    the refresh cookie's Path keeps it away). Identity revokes the session named in the access
  //    token, which ends the refresh lineage too. Keep the last refresh token, in memory only.
  await run('logout', async () => {
    requires(state.loggedIn);
    state.replayToken = state.jar[EXPECTED.refreshCookie]?.value;
    const path = '/api/auth/logout';
    const r = await httpsCall(target, id, 'POST', path, {
      headers: { ...origin, cookie: cookieHeaderFor(state.jar, path) },
    });
    const jar = parseSetCookies(r.headers['set-cookie']);
    expectStatus(r, 200);
    if (json(r)?.ok !== true) fail('body-mismatch');
    const cleared = (name) => jar[name] !== undefined && (jar[name].value === '' || jar[name].maxAge === 0);
    if (!cleared(EXPECTED.sessionCookie) || !cleared(EXPECTED.refreshCookie)) fail('cookies-not-cleared');
    state.loggedOut = true;
  });

  // 10. The pre-logout refresh token must be refused: 401 AUTH_INVALID_CREDENTIALS. A 200 is a
  //     security finding (H-12 in the plan).
  await run('refresh-replay-after-logout', async () => {
    requires(state.loggedOut && state.replayToken !== undefined && state.replayToken !== '');
    const path = EXPECTED.refreshPath;
    const r = await httpsCall(target, id, 'POST', path, {
      headers: { ...origin, cookie: `${EXPECTED.refreshCookie}=${encodeURIComponent(state.replayToken)}` },
      body: { organisation: EXPECTED.organisation },
    });
    for (const cookie of Object.values(parseSetCookies(r.headers['set-cookie']))) {
      if (cookie.value !== '') sensitive.add(cookie.value);
    }
    if (r.status === 200) fail('replay-accepted');
    if (r.status !== 401 || json(r)?.code !== 'AUTH_INVALID_CREDENTIALS') fail(refusalCode(r));
  });

  // 11. Exactly one wrong password. Run after the valid login so a lockout cannot block it.
  await run('invalid-password', async () => {
    const wrong = `probe-wrong-${randomBytes(18).toString('base64url')}`;
    sensitive.add(wrong);
    const r = await httpsCall(target, id, 'POST', '/api/auth/login', {
      headers: origin,
      body: { identifier: config.email, password: wrong, organisation: EXPECTED.organisation },
    });
    const jar = parseSetCookies(r.headers['set-cookie']);
    for (const cookie of Object.values(jar)) if (cookie.value !== '') sensitive.add(cookie.value);
    if (r.status === 200) fail('wrong-password-accepted');
    if (r.status !== 401 || json(r)?.code !== 'AUTH_INVALID_CREDENTIALS') fail(refusalCode(r));
    if (jar[EXPECTED.sessionCookie]?.value) fail('cookie-issued');
  });

  // 12. operator-test.munaxa.com is refused whole (rule 39) while operator_cidrs is empty.
  await run('operator-host', async () => {
    for (const path of ['/', '/api/auth/login']) {
      expectFixedResponse(await httpsCall(target, EXPECTED.operatorHost, 'GET', path), 403, 'Forbidden');
    }
  });

  // 13. Control's admin API is refused at the edge (rule 10).
  await run('control-admin-path', async () => {
    const r = await httpsCall(target, EXPECTED.controlHost, 'GET', '/api/v1/admin/probe');
    expectFixedResponse(r, 403, 'Forbidden');
  });

  // 14. Everything else on the Control API host is refused too (rule 21), whatever its case.
  await run('control-other-path', async () => {
    for (const path of ['/', '/api/v1/health', '/API/V1/ADMIN/probe']) {
      expectFixedResponse(await httpsCall(target, EXPECTED.controlHost, 'GET', path), 403, 'Forbidden');
    }
  });

  // 15. A host no rule names gets the HTTPS listener's default 404 (TLS succeeds on the wildcard).
  await run('unknown-host', async () => {
    expectFixedResponse(await httpsCall(target, EXPECTED.unknownHost, 'GET', '/'), 404, 'Not found');
  });

  return results;
}

// --- Entry point ---------------------------------------------------------------------------------

/**
 * Prints the result lines through `write` and returns the exit code: 0 all pass, 1 a check failed,
 * 2 configuration error. The last guard drops any line containing a value in `sensitive`.
 */
export async function main({ env = process.env, write = (line) => process.stdout.write(`${line}\n`), overrides = {} } = {}) {
  const sensitive = new Set();
  const emit = (line) => {
    for (const value of sensitive) {
      if (typeof value === 'string' && value.length >= 4 && line.includes(value)) {
        write('FAIL probe redacted-output');
        return;
      }
    }
    write(line);
  };
  try {
    const read = readConfig(env);
    if (!read.ok) {
      emit(formatLine('config', false, read.code));
      emit(formatSummary([]));
      return 2;
    }
    const config = { ...read.config, ...overrides };
    sensitive.add(config.email);
    sensitive.add(config.password);
    const results = await runChecks(config, { sensitive });
    for (const r of results) emit(formatLine(r.check, r.ok, r.code));
    emit(formatSummary(results));
    return results.length === CHECKS.length && results.every((r) => r.ok) ? 0 : 1;
  } catch {
    emit(formatLine('probe', false, 'internal-error'));
    emit(formatSummary([]));
    return 1;
  }
}

/** The loader's entry point: `process.exitCode = await m.default(process.env)`. */
export default function probe(env = process.env) {
  // A stray asynchronous error must not reach Node's default handler, which prints a message and a
  // stack trace. These print one fixed line instead.
  const crash = () => {
    process.stdout.write('FAIL probe internal-error\n');
    process.exit(1);
  };
  process.once('uncaughtException', crash);
  process.once('unhandledRejection', crash);
  return main({ env });
}

// Importing the module (the loader's data: URL, or a test) runs nothing; the loader calls the
// default export once. `node identity-session-probe.mjs` runs it directly, for a local dry run.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = await probe(process.env);
}
