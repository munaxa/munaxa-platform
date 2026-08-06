import { describe, expect, it } from 'vitest';
import { ROOT_TENANT_ID, unsafeId, type UserId } from '@munaxa/types';
import {
  PORTS,
  REQUIRED_AUTH_PORTS,
  ServiceRegistry,
  type AuditSinkPort,
  type CredentialRecord,
  type RefreshTokenStorePort,
  type SessionStorePort,
  type UserDirectoryPort,
} from '../src/index.js';

/**
 * A composition-root rehearsal: wire the ports an authentication stack needs, exactly the way a
 * product would, and check that the registry catches a half-wired application before it serves a
 * request rather than after.
 */
describe('composition root', () => {
  const userId = unsafeId<UserId>('u1');

  const directory: UserDirectoryPort = {
    findByIdentifier: async (tenantId, identifier): Promise<CredentialRecord | undefined> => ({
      userId,
      tenantId,
      identifier,
      passwordHash: null,
      status: 'active',
      tokenVersion: 1,
      mfaEnrolled: false,
    }),
    findById: async () => undefined,
    updatePasswordHash: async () => undefined,
    incrementTokenVersion: async () => 2,
    setStatus: async () => undefined,
  };

  const sessions: SessionStorePort = {
    create: async () => undefined,
    get: async () => undefined,
    listByUser: async () => [],
    update: async () => undefined,
    delete: async () => false,
    deleteExpired: async () => 0,
  };

  const refreshTokens: RefreshTokenStorePort = {
    save: async () => undefined,
    findByHash: async () => undefined,
    update: async () => undefined,
    listFamily: async () => [],
    revokeFamily: async () => 0,
    revokeForUser: async () => 0,
    deleteExpired: async () => 0,
  };

  const audit: AuditSinkPort = { write: async () => undefined };

  it('refuses to start when a required port is unwired', () => {
    const registry = new ServiceRegistry()
      .register(PORTS.clock, { now: () => 0 })
      .register(PORTS.userDirectory, directory);

    expect(() => registry.assertRegistered(...REQUIRED_AUTH_PORTS)).toThrow(
      /platform\.sessionStore/,
    );
  });

  it('starts once every required port is wired', () => {
    const registry = new ServiceRegistry()
      .register(PORTS.clock, { now: () => 1_700_000_000_000 })
      .register(PORTS.userDirectory, directory)
      .register(PORTS.sessionStore, sessions)
      .register(PORTS.refreshTokens, refreshTokens)
      .register(PORTS.auditSink, audit);

    expect(() => registry.assertRegistered(...REQUIRED_AUTH_PORTS)).not.toThrow();
  });

  it('lets a substituted implementation satisfy the same consumer', async () => {
    const registry = new ServiceRegistry().register(PORTS.userDirectory, directory);
    const record = await registry
      .get(PORTS.userDirectory)
      .findByIdentifier(ROOT_TENANT_ID, 'ada@example.com');

    expect(record?.userId).toBe(userId);
    expect(record?.tenantId).toBe(ROOT_TENANT_ID);
  });
});
