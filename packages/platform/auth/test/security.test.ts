import { describe, expect, it } from 'vitest';
import { MemoryCache } from '@munaxa/cache';
import { ROOT_TENANT_ID, toTenantId } from '@munaxa/types';
import { toBase64Url } from '@munaxa/crypto';
import { OidcProvider, OtpService, providerPresets, totpCode, verifyTotp } from '../src/index.js';
import { PASSWORD, START, USER, fixture } from './helpers.js';

describe('account enumeration', () => {
  it('returns the same error for an unknown account and a wrong password', async () => {
    const { login } = await fixture();

    const errors = await Promise.all(
      [
        login.authenticate('nobody@example.com', PASSWORD, { tenantId: ROOT_TENANT_ID }),
        login.authenticate('ada@example.com', 'wrong-password', { tenantId: ROOT_TENANT_ID }),
      ].map((promise) =>
        promise.then(
          () => 'resolved',
          (error: { toPublicJSON(): unknown }) => JSON.stringify(error.toPublicJSON()),
        ),
      ),
    );

    expect(errors[0]).toBe(errors[1]);
  });

  it('spends comparable work on both paths', async () => {
    const { login } = await fixture();

    const time = async (identifier: string): Promise<number> => {
      const start = performance.now();
      await login
        .authenticate(identifier, 'a wrong password', { tenantId: ROOT_TENANT_ID })
        .catch(() => undefined);
      return performance.now() - start;
    };

    // Warm the dummy hash, which is derived once, then compare.
    await time('warmup@example.com');
    const unknown = await time('nobody@example.com');
    const known = await time('ada@example.com');

    // Both perform a real scrypt verification. The ratio is loose because CI timing is noisy;
    // what it catches is the regression where the unknown path returns immediately.
    const ratio = Math.max(unknown, known) / Math.max(1, Math.min(unknown, known));
    expect(ratio).toBeLessThan(5);
  });

  it('does not reveal whether an address has an account when a reset is requested', async () => {
    const { reset, delivered } = await fixture();

    const known = await reset.request(ROOT_TENANT_ID, 'ada@example.com');
    const unknown = await reset.request(ROOT_TENANT_ID, 'nobody@example.com');

    expect(known).toEqual(unknown);
    expect(delivered).toHaveLength(1);
  });
});

describe('token forgery', () => {
  it('rejects a token whose payload was edited', async () => {
    const { tokens } = await fixture();
    const { token } = tokens.issueAccessToken({
      subject: USER,
      tenantId: ROOT_TENANT_ID,
      tokenVersion: 1,
      permissions: ['documents:read'],
    });

    const [header, payload, signature] = token.split('.') as [string, string, string];
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<
      string,
      unknown
    >;
    claims.perms = ['*'];
    const forged = `${header}.${toBase64Url(JSON.stringify(claims))}.${signature}`;

    expect(() => tokens.verifyAccessToken(forged)).toThrow(/signature/);
  });

  it('rejects the alg:none family of attacks', async () => {
    const { tokens } = await fixture();
    const header = toBase64Url(JSON.stringify({ alg: 'none', typ: 'JWT' }));
    const payload = toBase64Url(
      JSON.stringify({
        sub: USER,
        tid: ROOT_TENANT_ID,
        iss: 'munaxa-test',
        iat: Math.floor(START / 1_000),
        exp: Math.floor(START / 1_000) + 3_600,
        jti: 'forged',
        ver: 1,
        perms: ['*'],
      }),
    );

    expect(() => tokens.verifyAccessToken(`${header}.${payload}.`)).toThrow();
    expect(() => tokens.verifyAccessToken(`${header}.${payload}.anything`)).toThrow();
  });

  it('rejects a token signed by a different key', async () => {
    const a = await fixture();
    const b = await fixture();
    const { token } = b.tokens.issueAccessToken({
      subject: USER,
      tenantId: ROOT_TENANT_ID,
      tokenVersion: 1,
    });
    expect(() => a.tokens.verifyAccessToken(token)).toThrow();
  });
});

describe('refresh token theft', () => {
  it('a stolen token stops working as soon as the real client refreshes', async () => {
    const { refresh } = await fixture();
    const issued = await refresh.issue({ tenantId: ROOT_TENANT_ID, userId: USER, tokenVersion: 1 });
    const stolen = issued.token;

    // The legitimate client rotates first.
    await refresh.rotate(ROOT_TENANT_ID, issued.token);

    // The attacker's copy is now a replay: it fails, and it takes the family with it.
    await expect(refresh.rotate(ROOT_TENANT_ID, stolen)).rejects.toMatchObject({
      code: 'AUTH_TOKEN_REUSED',
    });
  });

  it('never stores anything a database thief could present', async () => {
    const { refresh, refreshStore } = await fixture();
    const issued = await refresh.issue({ tenantId: ROOT_TENANT_ID, userId: USER, tokenVersion: 1 });

    const dump = JSON.stringify(
      await refreshStore.findByHash(ROOT_TENANT_ID, issued.record.tokenHash),
    );
    expect(dump).not.toContain(issued.token);
    // And the hash is peppered, so it cannot be matched against a token seen elsewhere.
    const { tokenFingerprint } = await import('@munaxa/crypto');
    expect(issued.record.tokenHash).not.toBe(tokenFingerprint(issued.token));
  });

  it('is scoped to its tenant', async () => {
    const { refresh } = await fixture();
    const issued = await refresh.issue({ tenantId: ROOT_TENANT_ID, userId: USER, tokenVersion: 1 });
    await expect(refresh.rotate(toTenantId('other'), issued.token)).rejects.toMatchObject({
      code: 'AUTH_TOKEN_INVALID',
    });
  });
});

describe('reset token replay', () => {
  it('cannot be used twice', async () => {
    const { reset, delivered } = await fixture();
    await reset.request(ROOT_TENANT_ID, 'ada@example.com');
    const token = delivered[0]?.token as string;

    await reset.complete(ROOT_TENANT_ID, token, 'a fresh unrelated passphrase');
    await expect(
      reset.complete(ROOT_TENANT_ID, token, 'another passphrase entirely'),
    ).rejects.toMatchObject({ code: 'AUTH_RESET_TOKEN_INVALID' });
  });

  it('stops working once the password changes by another route', async () => {
    const { reset, delivered, login } = await fixture();
    await reset.request(ROOT_TENANT_ID, 'ada@example.com');

    await login.changePassword(ROOT_TENANT_ID, USER, PASSWORD, 'changed by the user directly');

    await expect(
      reset.complete(ROOT_TENANT_ID, delivered[0]?.token as string, 'attacker chosen passphrase'),
    ).rejects.toMatchObject({ code: 'AUTH_RESET_TOKEN_INVALID' });
  });

  it('expires', async () => {
    const { reset, delivered, clock } = await fixture();
    await reset.request(ROOT_TENANT_ID, 'ada@example.com');
    clock.advance(31 * 60 * 1_000);

    expect(await reset.inspect(ROOT_TENANT_ID, delivered[0]?.token as string)).toBeUndefined();
    await expect(
      reset.complete(ROOT_TENANT_ID, delivered[0]?.token as string, 'a fresh unrelated passphrase'),
    ).rejects.toBeDefined();
  });

  it('stores the token hashed, so a leaked table is not a takeover', async () => {
    const { reset, delivered, resetStore } = await fixture();
    await reset.request(ROOT_TENANT_ID, 'ada@example.com');

    const token = delivered[0]?.token as string;
    const { tokenFingerprint } = await import('@munaxa/crypto');
    const record = await resetStore.findByHash(
      ROOT_TENANT_ID,
      tokenFingerprint(token, 'test-pepper'),
    );
    expect(JSON.stringify(record)).not.toContain(token);
  });
});

describe('second factors are single use', () => {
  it('refuses a replayed TOTP code inside its own window', async () => {
    const { mfa, clock } = await fixture();
    const start = await mfa.beginTotpEnrollment(ROOT_TENANT_ID, USER, {
      issuer: 'M',
      account: 'a',
    });
    await mfa.confirmTotpEnrollment(ROOT_TENANT_ID, USER, totpCode(start.secret, clock.now()));

    clock.advance(30_000);
    const code = totpCode(start.secret, clock.now());
    expect(await mfa.verifyTotpCode(ROOT_TENANT_ID, USER, code)).toBe(true);
    // Shoulder-surfed or phished within the same 30 seconds: it does not work twice.
    expect(await mfa.verifyTotpCode(ROOT_TENANT_ID, USER, code)).toBe(false);
  });

  it('does not accept a code from far outside the drift window', () => {
    const secret = 'JBSWY3DPEHPK3PXP';
    const code = totpCode(secret, START);
    expect(verifyTotp(secret, code, START + 10 * 60_000)).toBeUndefined();
  });

  it('caps OTP guessing', async () => {
    const { clock } = await fixture();
    const otp = new OtpService({ clock, maxAttempts: 5 });
    const { challenge } = otp.issue(ROOT_TENANT_ID, USER);

    let succeeded = false;
    for (let guess = 0; guess < 1_000; guess++) {
      if (otp.verify(challenge.id, String(guess).padStart(6, '0'))) succeeded = true;
    }
    // Five attempts, then the challenge is spent — a six-digit code is otherwise brute-forceable
    // in seconds.
    expect(succeeded).toBe(false);
  });
});

describe('lockout is not an oracle', () => {
  it('locks an unknown identifier the same way as a real one', async () => {
    const clock = { now: () => START };
    const { login } = await fixture({
      loginOptions: { maxAttempts: 3, cache: new MemoryCache({ clock }) },
    });

    for (let i = 0; i < 3; i++) {
      await login
        .authenticate('nobody@example.com', 'wrong', { tenantId: ROOT_TENANT_ID })
        .catch(() => undefined);
    }

    await expect(
      login.authenticate('nobody@example.com', 'wrong', { tenantId: ROOT_TENANT_ID }),
    ).rejects.toMatchObject({ code: 'AUTH_ACCOUNT_LOCKED' });
  });
});

describe('OIDC callback handling', () => {
  const provider = (claims: Record<string, unknown>) =>
    new OidcProvider(providerPresets.google('client-id', 'secret'), {
      request: async () => ({
        status: 200,
        headers: {},
        body: JSON.stringify({
          id_token: `h.${toBase64Url(JSON.stringify(claims))}.s`,
        }),
      }),
    });

  const callback = (overrides: Record<string, unknown> = {}) => ({
    tenantId: ROOT_TENANT_ID,
    params: { code: 'c', state: 'STATE' },
    expectedState: 'STATE',
    codeVerifier: 'verifier',
    nonce: 'NONCE',
    redirectUri: 'https://app.test/callback',
    ...overrides,
  });

  const validClaims = {
    iss: 'https://accounts.google.com',
    aud: 'client-id',
    sub: 'user-1',
    nonce: 'NONCE',
  };

  it('rejects a mismatched state', async () => {
    await expect(
      provider(validClaims).completeAuthorization(
        callback({ params: { code: 'c', state: 'OTHER' } }),
      ),
    ).rejects.toThrow(/state mismatch/);
  });

  it('rejects a token from another issuer or for another client', async () => {
    await expect(
      provider({ ...validClaims, iss: 'https://evil.test' }).completeAuthorization(callback()),
    ).rejects.toThrow(/issuer mismatch/);
    await expect(
      provider({ ...validClaims, aud: 'someone-else' }).completeAuthorization(callback()),
    ).rejects.toThrow(/audience mismatch/);
  });

  it('rejects a replayed id token through the nonce', async () => {
    await expect(
      provider({ ...validClaims, nonce: 'A-DIFFERENT-NONCE' }).completeAuthorization(callback()),
    ).rejects.toThrow(/nonce mismatch/);
  });

  it('surfaces a provider error without leaking the exchange body', async () => {
    const failing = new OidcProvider(providerPresets.google('client-id', 'secret'), {
      request: async () => ({ status: 400, headers: {}, body: 'client_secret=secret&error=x' }),
    });
    await expect(failing.completeAuthorization(callback())).rejects.toThrow(/status 400/);
    await expect(failing.completeAuthorization(callback())).rejects.not.toThrow(/client_secret/);
  });
});

describe('API keys', () => {
  it('gives one indistinguishable error for every failure mode', async () => {
    const { apiKeys, clock } = await fixture();
    const created = await apiKeys.create({
      tenantId: ROOT_TENANT_ID,
      name: 'k',
      scopes: [],
      ttl: 60_000,
      allowedCidrs: ['198.51.100.0/24'],
    });

    const messages = new Set<string>();
    const capture = async (run: () => Promise<unknown>) => {
      try {
        await run();
      } catch (error) {
        messages.add((error as Error).message);
      }
    };

    await capture(() => apiKeys.verify('mxa_live_key_notavalidkeyatall_secretsecretsecret'));
    await capture(() => apiKeys.verify('garbage'));
    await capture(() => apiKeys.verify(created.key, { ipAddress: '203.0.113.1' }));
    await capture(() => apiKeys.verify(created.key, { tenantId: toTenantId('other') }));
    clock.advance(61_000);
    await capture(() => apiKeys.verify(created.key));

    expect(messages.size).toBe(1);
  });

  it('honours a CIDR allow-list', async () => {
    const { apiKeys } = await fixture();
    const created = await apiKeys.create({
      tenantId: ROOT_TENANT_ID,
      name: 'k',
      scopes: [],
      allowedCidrs: ['198.51.100.0/24'],
    });

    await expect(apiKeys.verify(created.key, { ipAddress: '198.51.100.9' })).resolves.toBeDefined();
    await expect(apiKeys.verify(created.key, { ipAddress: '203.0.113.9' })).rejects.toBeDefined();
  });
});
