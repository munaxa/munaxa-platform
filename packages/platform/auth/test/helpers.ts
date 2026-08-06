import { KeyRing, HmacSigner, ScryptPasswordHasher, secureBytes } from '@munaxa/crypto';
import { MemoryCache } from '@munaxa/cache';
import { FixedClock, ROOT_TENANT_ID, unsafeId, type UserId } from '@munaxa/types';
import type { CredentialRecord } from '@munaxa/interfaces';
import {
  ApiKeyService,
  LoginService,
  MemoryApiKeyStore,
  MemoryMfaEnrollmentStore,
  MemoryPasswordHistory,
  MemoryRefreshTokenStore,
  MemoryResetTokenStore,
  MemoryUserDirectory,
  MfaService,
  PasswordPolicyService,
  PasswordResetService,
  RefreshTokenService,
  StaticBreachRegistry,
  TokenService,
  type LoginEvent,
} from '../src/index.js';

export const USER = unsafeId<UserId>('u1');
export const START = 1_700_000_000_000;
export const PASSWORD = 'a-perfectly-fine-passphrase';

/** Cheap parameters: these tests exercise behaviour, not the KDF's calibration. */
export const hasher = new ScryptPasswordHasher({ N: 1_024 });

export async function account(
  overrides: Partial<CredentialRecord> = {},
): Promise<CredentialRecord> {
  return {
    userId: USER,
    tenantId: ROOT_TENANT_ID,
    identifier: 'ada@example.com',
    passwordHash: await hasher.hash(PASSWORD),
    status: 'active',
    tokenVersion: 1,
    mfaEnrolled: false,
    ...overrides,
  };
}

export async function fixture(
  options: {
    accountOverrides?: Partial<CredentialRecord>;
    loginOptions?: Partial<ConstructorParameters<typeof LoginService>[0]>;
  } = {},
) {
  const clock = new FixedClock(START);
  const cache = new MemoryCache({ clock });
  const directory = new MemoryUserDirectory([await account(options.accountOverrides)]);
  const history = new MemoryPasswordHistory();
  const breachRegistry = new StaticBreachRegistry();

  const policy = new PasswordPolicyService({ breachRegistry, history, hasher });
  const events: LoginEvent[] = [];

  const login = new LoginService({
    directory,
    hasher,
    policy,
    clock,
    cache,
    onEvent: (event) => void events.push(event),
    ...options.loginOptions,
  });

  const refreshStore = new MemoryRefreshTokenStore();
  const refresh = new RefreshTokenService({ store: refreshStore, clock, pepper: 'test-pepper' });

  const signer = new HmacSigner(new KeyRing({ kid: 'k1', key: secureBytes(32) }));
  const tokens = new TokenService({
    signer,
    issuer: 'munaxa-test',
    audience: ['munaxa-api'],
    clock,
  });

  const resetStore = new MemoryResetTokenStore();
  const delivered: { token: string; expiresAt: number }[] = [];
  const revokedFor: string[] = [];
  const reset = new PasswordResetService({
    store: resetStore,
    directory,
    hasher,
    policy,
    clock,
    pepper: 'test-pepper',
    deliver: (input) => void delivered.push({ token: input.token, expiresAt: input.expiresAt }),
    onReset: (_tenantId, userId) => void revokedFor.push(userId),
  });

  const mfaStore = new MemoryMfaEnrollmentStore();
  const mfa = new MfaService({ store: mfaStore, clock });

  const apiKeyStore = new MemoryApiKeyStore();
  const apiKeys = new ApiKeyService({ store: apiKeyStore, clock, pepper: 'test-pepper' });

  return {
    clock,
    cache,
    directory,
    history,
    breachRegistry,
    policy,
    login,
    events,
    refresh,
    refreshStore,
    tokens,
    signer,
    reset,
    resetStore,
    delivered,
    revokedFor,
    mfa,
    mfaStore,
    apiKeys,
    apiKeyStore,
  };
}
