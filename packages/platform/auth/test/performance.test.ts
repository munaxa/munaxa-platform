import { describe, expect, it } from 'vitest';
import { ROOT_TENANT_ID } from '@munaxa/types';
import { generateTotpSecret, totpCode, verifyTotp } from '../src/index.js';
import { PASSWORD, START, USER, fixture } from './helpers.js';

/**
 * Budgets carry roughly 2.5x headroom over an idle machine. `turbo run test` runs every package
 * concurrently on the same cores, and a budget tuned on an idle laptop fails on a busy CI runner —
 * which teaches everyone to ignore the suite. These catch order-of-magnitude regressions, which is
 * what they are for.
 */

/**
 * Authentication is intentionally the slowest thing a product does, once, at login. Everything
 * that runs *per request* — token verification, key checks — has to be fast, and everything that
 * runs per login has to be bounded so a burst of sign-ins does not become an outage.
 */
describe('per-request cost', () => {
  it('verifies an access token in microseconds', async () => {
    const { tokens } = await fixture();
    const { token } = tokens.issueAccessToken({
      subject: USER,
      tenantId: ROOT_TENANT_ID,
      tokenVersion: 1,
      permissions: ['documents:read', 'documents:write'],
    });

    const start = performance.now();
    for (let i = 0; i < 20_000; i++) tokens.verifyAccessToken(token);
    expect((performance.now() - start) / 20_000).toBeLessThan(0.1);
  });

  it('issues access tokens without a round trip', async () => {
    const { tokens } = await fixture();
    const start = performance.now();
    for (let i = 0; i < 20_000; i++) {
      tokens.issueAccessToken({ subject: USER, tenantId: ROOT_TENANT_ID, tokenVersion: 1 });
    }
    expect(performance.now() - start).toBeLessThan(7_500);
  });

  it('verifies an API key with one store lookup', async () => {
    const { apiKeys } = await fixture();
    const created = await apiKeys.create({ tenantId: ROOT_TENANT_ID, name: 'k', scopes: ['a:b'] });

    const start = performance.now();
    for (let i = 0; i < 5_000; i++) await apiKeys.verify(created.key, { tenantId: ROOT_TENANT_ID });
    expect(performance.now() - start).toBeLessThan(5_000);
  });
});

describe('per-login cost', () => {
  it('authenticates within a sensible budget', async () => {
    const { login } = await fixture();
    const start = performance.now();
    for (let i = 0; i < 20; i++) {
      await login.authenticate('ada@example.com', PASSWORD, { tenantId: ROOT_TENANT_ID });
    }
    const perLogin = (performance.now() - start) / 20;

    // Dominated by the KDF, which is the point. The bound catches an accidental double
    // verification or a policy check that hashes again.
    expect(perLogin).toBeLessThan(1_250);
  });

  it('spends no more work rejecting an unknown account than a known one', async () => {
    const { login } = await fixture();
    await login
      .authenticate('warm@example.com', 'x', { tenantId: ROOT_TENANT_ID })
      .catch(() => undefined);

    const measure = async (identifier: string) => {
      const start = performance.now();
      for (let i = 0; i < 10; i++) {
        await login
          .authenticate(identifier, 'wrong', { tenantId: ROOT_TENANT_ID })
          .catch(() => undefined);
      }
      return performance.now() - start;
    };

    const unknown = await measure('nobody@example.com');
    const known = await measure('ada@example.com');
    expect(Math.max(unknown, known) / Math.max(1, Math.min(unknown, known))).toBeLessThan(4);
  });

  it('rotates refresh tokens cheaply', async () => {
    const { refresh } = await fixture();
    let token = (await refresh.issue({ tenantId: ROOT_TENANT_ID, userId: USER, tokenVersion: 1 }))
      .token;

    const start = performance.now();
    for (let i = 0; i < 2_000; i++) {
      token = (await refresh.rotate(ROOT_TENANT_ID, token)).issued.token;
    }
    expect(performance.now() - start).toBeLessThan(7_500);
  });
});

describe('TOTP', () => {
  it('generates and verifies in microseconds', () => {
    const secret = generateTotpSecret();
    const code = totpCode(secret, START);

    const start = performance.now();
    for (let i = 0; i < 20_000; i++) verifyTotp(secret, code, START);
    expect(performance.now() - start).toBeLessThan(5_000);
  });

  it('costs the same for a wrong code as for a right one', () => {
    const secret = generateTotpSecret();
    const right = totpCode(secret, START);

    const time = (code: string) => {
      const start = performance.now();
      for (let i = 0; i < 10_000; i++) verifyTotp(secret, code, START);
      return performance.now() - start;
    };

    // Constant-time comparison, and the same number of HMACs either way.
    const ratio = time('000000') / Math.max(1, time(right));
    expect(ratio).toBeGreaterThan(0.3);
    expect(ratio).toBeLessThan(4);
  });
});

describe('password policy', () => {
  it('validates without hashing when history is not in play', async () => {
    const { policy } = await fixture();
    const start = performance.now();
    for (let i = 0; i < 2_000; i++) await policy.validate(`a decent passphrase number ${i}`);
    expect(performance.now() - start).toBeLessThan(5_000);
  });
});
