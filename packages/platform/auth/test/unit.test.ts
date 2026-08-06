import { describe, expect, it } from 'vitest';
import { ROOT_TENANT_ID, isPlatformError, unsafeId, type TokenFamilyId } from '@munaxa/types';
import {
  DEFAULT_PASSWORD_POLICY,
  OtpService,
  PASSWORD_POLICY_FLOOR,
  bearerToken,
  clampPasswordPolicy,
  clearCookie,
  generateTotpSecret,
  isAllowedAddress,
  parseApiKey,
  refreshCookie,
  requireAuth,
  requireMfa,
  sessionCookie,
  strengthOf,
  totpCode,
  totpUri,
  verifyTotp,
} from '../src/index.js';
import { PASSWORD, START, USER, fixture } from './helpers.js';

describe('password policy', () => {
  it('follows NIST rather than composition rules by default', () => {
    expect(DEFAULT_PASSWORD_POLICY.minLength).toBe(12);
    expect(DEFAULT_PASSWORD_POLICY.requireSymbol).toBe(false);
    expect(DEFAULT_PASSWORD_POLICY.checkBreaches).toBe(true);
    // Forced rotation produces Password1! then Password2!, so it is off unless asked for.
    expect(DEFAULT_PASSWORD_POLICY.maxAge).toBe(0);
  });

  it('never drops below the platform floor', () => {
    expect(clampPasswordPolicy({ minLength: 6 }).minLength).toBe(PASSWORD_POLICY_FLOOR.minLength);
    expect(clampPasswordPolicy({ maxLength: 8 }).maxLength).toBeGreaterThanOrEqual(64);
  });

  it('accepts a long passphrase with no symbols', async () => {
    const { policy } = await fixture();
    const result = await policy.validate('correct battery staple horse');
    expect(result.valid).toBe(true);
  });

  it('reports every violation at once', async () => {
    const { policy } = await fixture();
    const result = await policy.validate('short', {
      policy: { requireDigit: true, requireSymbol: true },
    });
    expect(result.violations).toEqual(
      expect.arrayContaining(['too-short', 'missing-digit', 'missing-symbol']),
    );
  });

  it.each([
    ['aaaaaaaaaaaaaa', 'trivial-pattern'],
    ['abcdefghijklm', 'trivial-pattern'],
    ['qwertyuiop1234', 'trivial-pattern'],
    ['abcabcabcabc', 'trivial-pattern'],
  ])('rejects %j as %s', async (password, violation) => {
    const { policy } = await fixture();
    expect((await policy.validate(password)).violations).toContain(violation);
  });

  it('rejects a password containing the account identifier', async () => {
    const { policy } = await fixture();
    const result = await policy.validate('lovelace-is-my-password', {
      userInfo: ['lovelace@example.com'],
    });
    expect(result.violations).toContain('contains-user-info');

    // A local part shorter than four characters is not matched: "ada" appears inside too many
    // legitimate passphrases to be a useful signal, and false rejections train people to
    // write down whatever finally gets accepted.
    expect(
      (await policy.validate('ada-is-my-passphrase', { userInfo: ['ada@example.com'] })).violations,
    ).not.toContain('contains-user-info');
  });

  it('rejects a breached password through the k-anonymity lookup', async () => {
    const { policy } = await fixture();
    expect((await policy.validate('correct horse battery staple')).violations).toContain(
      'breached',
    );
    expect((await policy.validate('a quite different phrase entirely')).violations).not.toContain(
      'breached',
    );
  });

  it('does not block a password change when the breach service is down', async () => {
    const { policy } = await fixture();
    const broken = {
      suffixesForPrefix: async () => {
        throw new Error('service unavailable');
      },
    };
    const result = await policy.validate('a perfectly good passphrase', { breachRegistry: broken });
    expect(result.valid).toBe(true);
  });

  it('rejects a reused password from history', async () => {
    const { policy, history } = await fixture();
    const { hasher } = await import('./helpers.js');
    await history.record(ROOT_TENANT_ID, USER, await hasher.hash('the previous passphrase'), START);

    const result = await policy.validate('the previous passphrase', {
      tenantId: ROOT_TENANT_ID,
      userId: USER,
    });
    expect(result.violations).toContain('reused');
  });

  it('throws the right code per violation class', async () => {
    const { policy } = await fixture();

    await expect(policy.assertValid('short')).rejects.toMatchObject({
      code: 'AUTH_PASSWORD_POLICY',
    });
    await expect(policy.assertValid('correct horse battery staple')).rejects.toMatchObject({
      code: 'AUTH_PASSWORD_BREACHED',
    });
  });

  it('scores strength without gating on it', () => {
    expect(strengthOf('aaaa')).toBeLessThan(strengthOf('a-long-and-varied-Passphrase-42'));
    expect(strengthOf('x'.repeat(200))).toBeLessThanOrEqual(100);
  });
});

describe('access tokens', () => {
  it('issues and verifies', async () => {
    const { tokens } = await fixture();
    const { token, claims } = tokens.issueAccessToken({
      subject: USER,
      tenantId: ROOT_TENANT_ID,
      tokenVersion: 1,
      permissions: ['documents:read'],
    });

    expect(token.split('.')).toHaveLength(3);
    const verified = tokens.verifyAccessToken(token);
    expect(verified.sub).toBe(USER);
    expect(verified.jti).toBe(claims.jti);
    expect(verified.perms).toEqual(['documents:read']);
  });

  it('rejects expiry, issuer, audience and version mismatches', async () => {
    const { tokens, clock } = await fixture();
    const { token } = tokens.issueAccessToken({
      subject: USER,
      tenantId: ROOT_TENANT_ID,
      tokenVersion: 1,
    });

    expect(() => tokens.verifyAccessToken(token, { audience: ['other-api'] })).toThrow(/audience/);
    expect(() => tokens.verifyAccessToken(token, { tokenVersion: 2 })).toThrow(/version/);

    clock.advance(16 * 60 * 1_000);
    expect(() => tokens.verifyAccessToken(token)).toThrow(/expired/);
  });

  it('decodes unverified claims for logging only', async () => {
    const { tokens } = await fixture();
    const { token } = tokens.issueAccessToken({
      subject: USER,
      tenantId: ROOT_TENANT_ID,
      tokenVersion: 1,
    });
    expect(tokens.decodeUnsafe(token)?.sub).toBe(USER);
    expect(tokens.decodeUnsafe('garbage')).toBeUndefined();
  });
});

describe('refresh tokens', () => {
  it('issues an opaque token and stores only its hash', async () => {
    const { refresh, refreshStore } = await fixture();
    const issued = await refresh.issue({ tenantId: ROOT_TENANT_ID, userId: USER, tokenVersion: 1 });

    expect(issued.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(issued.record.tokenHash).not.toContain(issued.token);
    expect(
      JSON.stringify(await refreshStore.findByHash(ROOT_TENANT_ID, issued.record.tokenHash)),
    ).not.toContain(issued.token);
  });

  it('rotates, invalidating the old token', async () => {
    const { refresh } = await fixture();
    const first = await refresh.issue({ tenantId: ROOT_TENANT_ID, userId: USER, tokenVersion: 1 });
    const rotated = await refresh.rotate(ROOT_TENANT_ID, first.token);

    expect(rotated.issued.token).not.toBe(first.token);
    expect(rotated.issued.record.familyId).toBe(first.record.familyId);
    expect(rotated.previous.replacedBy).toBe(rotated.issued.record.id);
  });

  it('rejects an unknown, expired or revoked token', async () => {
    const { refresh, clock } = await fixture();

    await expect(refresh.rotate(ROOT_TENANT_ID, 'nope')).rejects.toMatchObject({
      code: 'AUTH_TOKEN_INVALID',
    });

    const revoked = await refresh.issue({
      tenantId: ROOT_TENANT_ID,
      userId: USER,
      tokenVersion: 1,
    });
    await refresh.revoke(ROOT_TENANT_ID, revoked.token, 'logout');
    await expect(refresh.rotate(ROOT_TENANT_ID, revoked.token)).rejects.toMatchObject({
      code: 'AUTH_TOKEN_INVALID',
    });

    const expiring = await refresh.issue({
      tenantId: ROOT_TENANT_ID,
      userId: USER,
      tokenVersion: 1,
    });
    clock.advance(31 * 24 * 60 * 60 * 1_000);
    await expect(refresh.rotate(ROOT_TENANT_ID, expiring.token)).rejects.toMatchObject({
      code: 'AUTH_TOKEN_EXPIRED',
    });
  });

  it('revokes a family and a user', async () => {
    const { refresh } = await fixture();
    const a = await refresh.issue({ tenantId: ROOT_TENANT_ID, userId: USER, tokenVersion: 1 });
    await refresh.issue({ tenantId: ROOT_TENANT_ID, userId: USER, tokenVersion: 1 });

    expect(await refresh.revokeFamily(ROOT_TENANT_ID, a.record.familyId, 'admin')).toBe(1);
    expect(await refresh.revokeAllForUser(ROOT_TENANT_ID, USER, 'password-changed')).toBe(1);
  });

  it('reports nothing for an unknown family', async () => {
    const { refresh } = await fixture();
    expect(
      await refresh.revokeFamily(ROOT_TENANT_ID, unsafeId<TokenFamilyId>('fam_none'), 'x'),
    ).toBe(0);
  });
});

describe('TOTP', () => {
  it('produces the same code either side of the wire', () => {
    const secret = generateTotpSecret();
    expect(totpCode(secret, START)).toMatch(/^\d{6}$/);
    expect(verifyTotp(secret, totpCode(secret, START), START)).toBeDefined();
  });

  it('accepts one step of drift and no more', () => {
    const secret = generateTotpSecret();
    const code = totpCode(secret, START);

    expect(verifyTotp(secret, code, START + 30_000)).toBeDefined();
    expect(verifyTotp(secret, code, START - 30_000)).toBeDefined();
    expect(verifyTotp(secret, code, START + 90_000)).toBeUndefined();
  });

  it('rejects a wrong code', () => {
    const secret = generateTotpSecret();
    expect(verifyTotp(secret, '000000', START)).toBeUndefined();
    expect(verifyTotp(secret, '', START)).toBeUndefined();
  });

  it('builds a URI an authenticator app can scan', () => {
    const uri = totpUri('JBSWY3DPEHPK3PXP', { issuer: 'Munaxa', account: 'ada@example.com' });
    expect(uri).toContain('otpauth://totp/Munaxa%3Aada%40example.com');
    expect(uri).toContain('secret=JBSWY3DPEHPK3PXP');
    expect(uri).toContain('period=30');
  });
});

describe('email OTP', () => {
  it('verifies once and then refuses replay', async () => {
    const { clock } = await fixture();
    const otp = new OtpService({ clock });
    const { challenge, code } = await otp.issue(ROOT_TENANT_ID, USER);

    expect(await otp.verify(challenge.id, code)).toBe(true);
    expect(await otp.verify(challenge.id, code)).toBe(false);
  });

  it('caps attempts', async () => {
    const { clock } = await fixture();
    const otp = new OtpService({ clock, maxAttempts: 3 });
    const { challenge, code } = await otp.issue(ROOT_TENANT_ID, USER);

    for (let i = 0; i < 3; i++) expect(await otp.verify(challenge.id, '000000')).toBe(false);
    // The real code no longer works: the attempt budget is spent.
    expect(await otp.verify(challenge.id, code)).toBe(false);
  });

  it('expires', async () => {
    const { clock } = await fixture();
    const otp = new OtpService({ clock, ttl: 60_000 });
    const { challenge, code } = await otp.issue(ROOT_TENANT_ID, USER);

    clock.advance(60_001);
    expect(await otp.verify(challenge.id, code)).toBe(false);
    expect(otp.purgeExpired()).toBe(1);
  });

  it('stores the code hashed', async () => {
    const { clock } = await fixture();
    const otp = new OtpService({ clock });
    const { challenge, code } = await otp.issue(ROOT_TENANT_ID, USER);
    expect(challenge.codeHash).not.toContain(code);
  });
});

describe('API keys', () => {
  it('parses the documented format', () => {
    const parsed = parseApiKey('mxa_live_key_01HQXYZABCDEFGHJKMNPQRSTV_abcdefghijklmnopqrstuvwxyz');
    expect(parsed?.environment).toBe('live');
    expect(parsed?.id).toBe('key_01HQXYZABCDEFGHJKMNPQRSTV');
  });

  it.each(['', 'nope', 'mxa_live_key_short_x', 'other_live_key_01HQXYZABCDEFGHJKMNPQRSTV_secret'])(
    'rejects the malformed key %j',
    (key) => {
      expect(parseApiKey(key)).toBeUndefined();
    },
  );

  it('matches CIDR allow-lists', () => {
    expect(isAllowedAddress('198.51.100.7', ['198.51.100.0/24'])).toBe(true);
    expect(isAllowedAddress('198.51.101.7', ['198.51.100.0/24'])).toBe(false);
    expect(isAllowedAddress('198.51.100.7', ['198.51.100.7'])).toBe(true);
    expect(isAllowedAddress(undefined, ['0.0.0.0/0'])).toBe(false);
    expect(isAllowedAddress('198.51.100.7', ['not-a-cidr'])).toBe(false);
  });
});

describe('http helpers', () => {
  it('hardens every cookie it issues', () => {
    const session = sessionCookie('value', { maxAge: 60_000 });
    expect(session.options).toMatchObject({ httpOnly: true, secure: true, path: '/' });
    expect(session.options.maxAgeSeconds).toBe(60);
    expect(session.name.startsWith('__Host-')).toBe(true);

    const refresh = refreshCookie('value');
    expect(refresh.options.sameSite).toBe('strict');
    expect(refresh.options.path).toBe('/api/auth/refresh');

    expect(clearCookie('__Host-mx_session').options.maxAgeSeconds).toBe(0);
  });

  it('reads a bearer token from the header only', () => {
    expect(
      bearerToken({ method: 'GET', path: '/', headers: { authorization: 'Bearer abc' } }),
    ).toBe('abc');
    expect(
      bearerToken({ method: 'GET', path: '/', headers: { authorization: 'Basic abc' } }),
    ).toBeUndefined();
    expect(bearerToken({ method: 'GET', path: '/', headers: {} })).toBeUndefined();
    // Never from the query string, whatever a client tries.
    expect(
      bearerToken({ method: 'GET', path: '/', headers: {}, query: { access_token: 'abc' } }),
    ).toBeUndefined();
  });

  it('requires an authenticated principal', () => {
    const anonymous = {
      tenantId: ROOT_TENANT_ID,
      principal: { kind: 'anonymous' as const, tenantId: ROOT_TENANT_ID },
      correlationId: 'c' as never,
    };
    expect(() => requireAuth(anonymous)).toThrow();

    const user = {
      ...anonymous,
      principal: { kind: 'user' as const, tenantId: ROOT_TENANT_ID, userId: USER },
    };
    expect(() => requireAuth(user)).not.toThrow();
    expect(() => requireMfa(user)).toThrow();
    expect(() =>
      requireMfa({ ...user, principal: { ...user.principal, mfaSatisfied: true } }),
    ).not.toThrow();
  });
});

describe('login', () => {
  it('authenticates a correct password', async () => {
    const { login } = await fixture();
    const outcome = await login.authenticate('ada@example.com', PASSWORD, {
      tenantId: ROOT_TENANT_ID,
    });
    expect(outcome.status).toBe('authenticated');
  });

  it('rejects a wrong password with the generic error', async () => {
    const { login } = await fixture();
    try {
      await login.authenticate('ada@example.com', 'wrong-password-entirely', {
        tenantId: ROOT_TENANT_ID,
      });
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(isPlatformError(error)).toBe(true);
      expect((error as { code: string }).code).toBe('AUTH_INVALID_CREDENTIALS');
    }
  });

  it('requires MFA when the account is enrolled', async () => {
    const { login } = await fixture({ accountOverrides: { mfaEnrolled: true } });
    const outcome = await login.authenticate('ada@example.com', PASSWORD, {
      tenantId: ROOT_TENANT_ID,
    });
    expect(outcome).toMatchObject({ status: 'mfa-required', reason: 'enrolled' });
  });

  it('reports a required password change', async () => {
    const { login } = await fixture({ accountOverrides: { mustChangePassword: true } });
    const outcome = await login.authenticate('ada@example.com', PASSWORD, {
      tenantId: ROOT_TENANT_ID,
    });
    expect(outcome.status).toBe('password-change-required');
  });

  it('refuses a disabled account after verifying the password', async () => {
    const { login } = await fixture({ accountOverrides: { status: 'disabled' } });
    await expect(
      login.authenticate('ada@example.com', PASSWORD, { tenantId: ROOT_TENANT_ID }),
    ).rejects.toMatchObject({ code: 'AUTH_ACCOUNT_DISABLED' });
  });

  it('changes a password only with the current one', async () => {
    const { login, directory } = await fixture();

    await expect(
      login.changePassword(ROOT_TENANT_ID, USER, 'wrong', 'a brand new passphrase'),
    ).rejects.toMatchObject({ code: 'AUTH_INVALID_CREDENTIALS' });

    await login.changePassword(ROOT_TENANT_ID, USER, PASSWORD, 'a brand new passphrase');
    const updated = await directory.findById(ROOT_TENANT_ID, USER);
    // Every outstanding token and session is invalidated by the version bump.
    expect(updated?.tokenVersion).toBe(2);
  });
});
