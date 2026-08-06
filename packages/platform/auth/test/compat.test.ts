import { describe, expect, it } from 'vitest';
import { HmacSigner, KeyRing } from '@munaxa/crypto';
import { FixedClock, ROOT_TENANT_ID } from '@munaxa/types';
import {
  DEFAULT_PASSWORD_POLICY,
  REFRESH_COOKIE,
  SESSION_COOKIE,
  TokenService,
  parseApiKey,
  totpCode,
  totpUri,
  verifyTotp,
} from '../src/index.js';
import { START, USER, fixture } from './helpers.js';

/**
 * Four things here outlive any single release, and each breaks something outside this repository
 * if it changes: the JWT claim names a gateway reads, the cookie names a browser already holds,
 * the API key format printed in customers' CI configuration, and TOTP's parameters, which are
 * baked into the authenticator app a user enrolled two years ago.
 */
const FIXTURE_KEY = Buffer.alloc(32, 9);
const signer = new HmacSigner(new KeyRing({ kid: 'k_test', key: FIXTURE_KEY }));

describe('1.0 access token', () => {
  const tokens = new TokenService({
    signer,
    issuer: 'munaxa',
    audience: ['munaxa-api'],
    clock: new FixedClock(START),
  });

  it('keeps the claim names', () => {
    const { claims } = tokens.issueAccessToken({
      subject: USER,
      tenantId: ROOT_TENANT_ID,
      tokenVersion: 3,
      sessionId: 'sess_1' as never,
      permissions: ['documents:read'],
      roles: ['member'],
      scopes: ['api'],
      mfaSatisfied: true,
      authMethods: ['password', 'totp'],
    });

    expect(Object.keys(claims)).toEqual(
      expect.arrayContaining([
        'sub',
        'tid',
        'iss',
        'iat',
        'exp',
        'jti',
        'ver',
        'aud',
        'sid',
        'amr',
        'mfa',
        'scope',
        'roles',
        'perms',
      ]),
    );
  });

  it('keeps the JWT wire shape and a kid in the header', () => {
    const { token } = tokens.issueAccessToken({
      subject: USER,
      tenantId: ROOT_TENANT_ID,
      tokenVersion: 1,
    });
    const header = JSON.parse(
      Buffer.from(token.split('.')[0] as string, 'base64url').toString('utf8'),
    ) as Record<string, string>;

    expect(header).toMatchObject({ typ: 'JWT', alg: 'HS256', kid: 'k_test' });
    expect(token.split('.')).toHaveLength(3);
  });

  it('verifies a token issued by an instance with the same key', () => {
    // A rolling deploy has both versions running against one key ring.
    const other = new TokenService({
      signer,
      issuer: 'munaxa',
      audience: ['munaxa-api'],
      clock: new FixedClock(START),
    });
    const { token } = other.issueAccessToken({
      subject: USER,
      tenantId: ROOT_TENANT_ID,
      tokenVersion: 1,
    });

    expect(tokens.verifyAccessToken(token).sub).toBe(USER);
  });
});

describe('1.0 cookie names', () => {
  it('keeps the names, so a deploy does not sign everyone out', () => {
    expect(SESSION_COOKIE).toBe('__Host-mx_session');
    expect(REFRESH_COOKIE).toBe('__Host-mx_refresh');
  });
});

describe('1.0 API key format', () => {
  it('still parses keys already issued to customers', () => {
    const parsed = parseApiKey(
      'mxa_live_key_01HQXYZABCDEFGHJKMNPQRSTV_ZmFrZS1zZWNyZXQtdmFsdWUtaGVyZQ',
    );
    expect(parsed).toMatchObject({ environment: 'live', id: 'key_01HQXYZABCDEFGHJKMNPQRSTV' });
  });

  it('still parses a secret containing base64url separators', () => {
    const parsed = parseApiKey(
      'mxa_live_key_01HQXYZABCDEFGHJKMNPQRSTV_abc_def-ghi_jkl_mnopqrstuvwx',
    );
    expect(parsed?.secret).toBe('abc_def-ghi_jkl_mnopqrstuvwx');
  });

  it('keeps emitting the same prefix', async () => {
    const { apiKeys } = await fixture();
    const created = await apiKeys.create({ tenantId: ROOT_TENANT_ID, name: 'k', scopes: [] });
    expect(created.key.startsWith('mxa_live_key_')).toBe(true);
  });
});

describe('1.0 TOTP parameters', () => {
  it('keeps 30-second, 6-digit, SHA-1 codes', () => {
    // Change any of these and every already-enrolled authenticator app stops working.
    const secret = 'JBSWY3DPEHPK3PXP';
    expect(totpCode(secret, 0)).toBe('282760');
    expect(totpCode(secret, 59_000)).toBe('996554');
    expect(verifyTotp(secret, '282760', 0)).toBeDefined();
    expect(totpUri(secret, { issuer: 'M', account: 'a' })).toContain('algorithm=SHA1');
    expect(totpUri(secret, { issuer: 'M', account: 'a' })).toContain('digits=6');
  });
});

describe('1.0 password policy', () => {
  it('does not tighten the defaults in a way that locks existing users out mid-session', () => {
    expect(DEFAULT_PASSWORD_POLICY.minLength).toBeLessThanOrEqual(12);
    expect(DEFAULT_PASSWORD_POLICY.maxLength).toBeGreaterThanOrEqual(64);
    expect(DEFAULT_PASSWORD_POLICY.maxAge).toBe(0);
  });

  it('still verifies a password hashed under 1.0 parameters', async () => {
    const { login } = await fixture();
    await expect(
      login.authenticate('ada@example.com', 'a-perfectly-fine-passphrase', {
        tenantId: ROOT_TENANT_ID,
      }),
    ).resolves.toMatchObject({ status: 'authenticated' });
  });
});
