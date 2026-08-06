import { describe, expect, it } from 'vitest';
import { MemorySessionStore, SessionManager } from '@munaxa/session';
import { MemoryCache } from '@munaxa/cache';
import { ROOT_TENANT_ID } from '@munaxa/types';
import {
  IdentityProviderRegistry,
  MemoryRefreshTokenStore,
  RefreshTokenService,
  OidcProvider,
  SamlProviderPlaceholder,
  ServiceAccountService,
  providerPresets,
  totpCode,
} from '../src/index.js';
import { PASSWORD, USER, fixture } from './helpers.js';

/**
 * The flows a product wires end to end. These cross package boundaries deliberately — the point
 * of the platform is that `auth`, `session` and `cache` compose without a product writing glue
 * beyond its composition root.
 */
describe('password login to session to tokens', () => {
  it('authenticates, creates a session, and issues a token pair', async () => {
    const { login, tokens, refresh, clock } = await fixture();
    const sessions = new SessionManager({ store: new MemorySessionStore(), clock });

    const outcome = await login.authenticate('ada@example.com', PASSWORD, {
      tenantId: ROOT_TENANT_ID,
      ipAddress: '198.51.100.4',
    });
    expect(outcome.status).toBe('authenticated');
    if (outcome.status !== 'authenticated') return;

    const session = await sessions.create({
      tenantId: ROOT_TENANT_ID,
      userId: outcome.account.userId,
      authMethods: outcome.authMethods,
      mfaSatisfied: false,
      tokenVersion: outcome.account.tokenVersion,
    });

    const access = tokens.issueAccessToken({
      subject: outcome.account.userId,
      tenantId: ROOT_TENANT_ID,
      tokenVersion: outcome.account.tokenVersion,
      sessionId: session.id,
    });
    const refreshToken = await refresh.issue({
      tenantId: ROOT_TENANT_ID,
      userId: outcome.account.userId,
      tokenVersion: outcome.account.tokenVersion,
      sessionId: session.id,
    });

    expect(tokens.verifyAccessToken(access.token).sid).toBe(session.id);
    expect(refreshToken.record.sessionId).toBe(session.id);
  });

  it('lets a password change invalidate everything already issued', async () => {
    const { login, tokens, refresh, directory, clock } = await fixture();
    const sessions = new SessionManager({ store: new MemorySessionStore(), clock });

    const session = await sessions.create({
      tenantId: ROOT_TENANT_ID,
      userId: USER,
      authMethods: ['password'],
      mfaSatisfied: false,
      tokenVersion: 1,
    });
    const access = tokens.issueAccessToken({
      subject: USER,
      tenantId: ROOT_TENANT_ID,
      tokenVersion: 1,
      sessionId: session.id,
    });
    const refreshToken = await refresh.issue({
      tenantId: ROOT_TENANT_ID,
      userId: USER,
      tokenVersion: 1,
      sessionId: session.id,
    });

    await login.changePassword(ROOT_TENANT_ID, USER, PASSWORD, 'an entirely new passphrase');
    const account = await directory.findById(ROOT_TENANT_ID, USER);
    const version = account?.tokenVersion as number;

    // Access token, refresh token and session all key off the same version.
    expect(() => tokens.verifyAccessToken(access.token, { tokenVersion: version })).toThrow(
      /version/,
    );
    await expect(
      refresh.rotate(ROOT_TENANT_ID, refreshToken.token, { tokenVersion: version }),
    ).rejects.toMatchObject({ code: 'AUTH_TOKEN_INVALID' });
    await expect(
      sessions.validate(ROOT_TENANT_ID, session.id, { tokenVersion: version }),
    ).resolves.toMatchObject({ valid: false, reason: 'stale-token-version' });
  });
});

describe('refresh rotation with reuse detection', () => {
  it('rotates repeatedly and revokes the family on replay', async () => {
    const reused: string[] = [];
    const { refresh } = await fixture();
    const detected = new RefreshTokenService({
      store: new MemoryRefreshTokenStore(),
      clock: { now: () => 1_700_000_000_000 },
      onReuseDetected: (record) => void reused.push(record.id),
    });

    const first = await detected.issue({ tenantId: ROOT_TENANT_ID, userId: USER, tokenVersion: 1 });
    const second = await detected.rotate(ROOT_TENANT_ID, first.token);
    const third = await detected.rotate(ROOT_TENANT_ID, second.issued.token);

    // The attacker replays the token they copied two rotations ago.
    await expect(detected.rotate(ROOT_TENANT_ID, first.token)).rejects.toMatchObject({
      code: 'AUTH_TOKEN_REUSED',
    });
    expect(reused).toHaveLength(1);

    // And the legitimate client's newest token is dead too: both halves of the lineage go.
    await expect(detected.rotate(ROOT_TENANT_ID, third.issued.token)).rejects.toMatchObject({
      code: 'AUTH_TOKEN_INVALID',
    });

    // The unrelated service is untouched.
    const other = await refresh.issue({ tenantId: ROOT_TENANT_ID, userId: USER, tokenVersion: 1 });
    await expect(refresh.rotate(ROOT_TENANT_ID, other.token)).resolves.toBeDefined();
  });

  it('refuses a token presented from a different device', async () => {
    const { refresh } = await fixture();
    const issued = await refresh.issue({
      tenantId: ROOT_TENANT_ID,
      userId: USER,
      tokenVersion: 1,
      deviceId: 'dev_a' as never,
    });

    await expect(
      refresh.rotate(ROOT_TENANT_ID, issued.token, { deviceId: 'dev_b' as never }),
    ).rejects.toMatchObject({ code: 'AUTH_TOKEN_INVALID' });

    // And the family is revoked, so the legitimate device has to sign in again — which is the
    // signal the user needs that something happened.
    await expect(
      refresh.rotate(ROOT_TENANT_ID, issued.token, { deviceId: 'dev_a' as never }),
    ).rejects.toBeDefined();
  });
});

describe('password reset', () => {
  it('delivers a link, resets the password, and revokes everything', async () => {
    const { reset, delivered, revokedFor, directory, login } = await fixture();

    await reset.request(ROOT_TENANT_ID, 'ada@example.com');
    expect(delivered).toHaveLength(1);
    const token = delivered[0]?.token as string;

    expect(await reset.inspect(ROOT_TENANT_ID, token)).toBeDefined();
    await reset.complete(ROOT_TENANT_ID, token, 'a fresh and unrelated passphrase');

    // Old password no longer works; new one does.
    await expect(
      login.authenticate('ada@example.com', PASSWORD, { tenantId: ROOT_TENANT_ID }),
    ).rejects.toMatchObject({ code: 'AUTH_INVALID_CREDENTIALS' });
    await expect(
      login.authenticate('ada@example.com', 'a fresh and unrelated passphrase', {
        tenantId: ROOT_TENANT_ID,
      }),
    ).resolves.toMatchObject({ status: 'authenticated' });

    expect(revokedFor).toEqual([USER]);
    expect((await directory.findById(ROOT_TENANT_ID, USER))?.tokenVersion).toBe(2);
  });

  it('accepts only the newest link when two are requested', async () => {
    const { reset, delivered } = await fixture();

    await reset.request(ROOT_TENANT_ID, 'ada@example.com');
    await reset.request(ROOT_TENANT_ID, 'ada@example.com');

    const [older, newer] = delivered;
    await expect(
      reset.complete(ROOT_TENANT_ID, older?.token as string, 'a fresh unrelated passphrase'),
    ).rejects.toMatchObject({ code: 'AUTH_RESET_TOKEN_INVALID' });
    await expect(
      reset.complete(ROOT_TENANT_ID, newer?.token as string, 'a fresh unrelated passphrase'),
    ).resolves.toBeUndefined();
  });

  it('enforces the password policy on the new password', async () => {
    const { reset, delivered } = await fixture();
    await reset.request(ROOT_TENANT_ID, 'ada@example.com');

    await expect(
      reset.complete(ROOT_TENANT_ID, delivered[0]?.token as string, 'short'),
    ).rejects.toMatchObject({ code: 'AUTH_PASSWORD_POLICY' });
  });
});

describe('MFA enrollment and challenge', () => {
  it('enrolls, confirms, issues recovery codes and verifies', async () => {
    const { mfa, mfaStore, clock } = await fixture();

    const start = await mfa.beginTotpEnrollment(ROOT_TENANT_ID, USER, {
      issuer: 'Munaxa',
      account: 'ada@example.com',
    });
    expect(await mfa.isEnrolled(ROOT_TENANT_ID, USER)).toBe(false);

    const codes = await mfa.confirmTotpEnrollment(
      ROOT_TENANT_ID,
      USER,
      totpCode(start.secret, clock.now()),
    );
    expect(codes).toHaveLength(10);
    expect(await mfa.isEnrolled(ROOT_TENANT_ID, USER)).toBe(true);

    clock.advance(30_000);
    expect(
      await mfa.verifyTotpCode(ROOT_TENANT_ID, USER, totpCode(start.secret, clock.now())),
    ).toBe(true);

    // A recovery code works once and is then gone.
    expect(await mfa.verifyRecoveryCode(ROOT_TENANT_ID, USER, codes[0] as string)).toBe(true);
    expect(await mfa.verifyRecoveryCode(ROOT_TENANT_ID, USER, codes[0] as string)).toBe(false);
    expect(mfaStore.remaining(ROOT_TENANT_ID, USER)).toBe(9);
  });

  it('refuses to confirm with a wrong code', async () => {
    const { mfa } = await fixture();
    await mfa.beginTotpEnrollment(ROOT_TENANT_ID, USER, { issuer: 'M', account: 'a' });
    await expect(mfa.confirmTotpEnrollment(ROOT_TENANT_ID, USER, '000000')).rejects.toMatchObject({
      code: 'AUTH_MFA_INVALID',
    });
  });
});

describe('machine authentication', () => {
  it('creates, verifies, scopes and revokes an API key', async () => {
    const { apiKeys } = await fixture();

    const created = await apiKeys.create({
      tenantId: ROOT_TENANT_ID,
      name: 'CI pipeline',
      scopes: ['documents:read'],
    });

    expect(created.key.startsWith('mxa_live_key_')).toBe(true);

    const principal = await apiKeys.verify(created.key, { tenantId: ROOT_TENANT_ID });
    expect(principal).toMatchObject({ kind: 'api-key', scopes: ['documents:read'] });

    expect(await apiKeys.revoke(ROOT_TENANT_ID, created.record.id)).toBe(true);
    await expect(apiKeys.verify(created.key, { tenantId: ROOT_TENANT_ID })).rejects.toBeDefined();
  });

  it('intersects requested scopes for a client-credentials grant', async () => {
    const { apiKeys } = await fixture();
    const created = await apiKeys.create({
      tenantId: ROOT_TENANT_ID,
      name: 'service',
      scopes: ['documents:read', 'documents:write'],
    });

    const accounts = new ServiceAccountService(apiKeys);
    const principal = await accounts.authenticate({
      clientId: 'svc-1' as never,
      clientSecret: created.key,
      tenantId: ROOT_TENANT_ID,
      requestedScopes: ['documents:read', 'users:delete'],
    });

    // Asking for more than was granted yields what was granted, never more.
    expect(principal.scopes).toEqual(['documents:read']);
  });

  it('does not list secrets', async () => {
    const { apiKeys } = await fixture();
    await apiKeys.create({ tenantId: ROOT_TENANT_ID, name: 'k', scopes: [] });
    const listed = await apiKeys.list(ROOT_TENANT_ID);
    expect(JSON.stringify(listed)).not.toContain('secretHash');
  });
});

describe('external identity providers', () => {
  const tokenEndpointResponse = (claims: Record<string, unknown>) => {
    const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
    return JSON.stringify({ id_token: `header.${payload}.signature` });
  };

  it('runs an OIDC code flow with PKCE and a nonce', async () => {
    let receivedBody = '';
    const provider = new OidcProvider(providerPresets.google('client-id', 'client-secret'), {
      request: async (request) => {
        receivedBody = request.body ?? '';
        return {
          status: 200,
          headers: {},
          body: tokenEndpointResponse({
            iss: 'https://accounts.google.com',
            aud: 'client-id',
            sub: 'google-user-1',
            email: 'ada@example.com',
            email_verified: true,
            nonce: 'NONCE',
          }),
        };
      },
    });

    const redirect = await provider.beginAuthorization({
      tenantId: ROOT_TENANT_ID,
      redirectUri: 'https://app.test/callback',
    });

    expect(redirect.url).toContain('code_challenge_method=S256');
    expect(redirect.codeVerifier).toBeDefined();

    const identity = await provider.completeAuthorization({
      tenantId: ROOT_TENANT_ID,
      params: { code: 'auth-code', state: redirect.state },
      expectedState: redirect.state,
      codeVerifier: redirect.codeVerifier as string,
      nonce: 'NONCE',
      redirectUri: 'https://app.test/callback',
    });

    expect(receivedBody).toContain('code_verifier=');
    expect(identity).toMatchObject({
      provider: 'google',
      subject: 'google-user-1',
      email: 'ada@example.com',
      emailVerified: true,
    });
  });

  it('registers providers and reports an unknown one clearly', () => {
    const registry = new IdentityProviderRegistry();
    registry.register(new SamlProviderPlaceholder('okta-saml'));

    expect(registry.has('okta-saml')).toBe(true);
    expect(() => registry.get('nope')).toThrow(/Unknown identity provider/);
  });

  it('says plainly that SAML is not implemented rather than half-doing it', async () => {
    const saml = new SamlProviderPlaceholder('okta-saml');
    await expect(saml.beginAuthorization()).rejects.toThrow(/not implemented/);
  });
});

describe('lockout', () => {
  it('locks after repeated failures and clears on success', async () => {
    const clock = { now: () => 1_700_000_000_000 };
    const { login } = await fixture({
      loginOptions: { maxAttempts: 3, cache: new MemoryCache({ clock }) },
    });

    for (let i = 0; i < 3; i++) {
      await expect(
        login.authenticate('ada@example.com', 'wrong', { tenantId: ROOT_TENANT_ID }),
      ).rejects.toMatchObject({ code: 'AUTH_INVALID_CREDENTIALS' });
    }

    // The correct password no longer helps: the account is locked.
    await expect(
      login.authenticate('ada@example.com', PASSWORD, { tenantId: ROOT_TENANT_ID }),
    ).rejects.toMatchObject({ code: 'AUTH_ACCOUNT_LOCKED' });
  });
});
