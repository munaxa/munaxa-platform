import { describe, expect, it } from 'vitest';
import { PORTS } from '../src/index.js';

/**
 * Port descriptions are wiring keys. NestJS products pass them to `@Inject()`, and a renamed
 * description silently unbinds a provider — the application still starts, and the port resolves
 * to undefined at the first request. Pin them.
 */
const PORT_DESCRIPTIONS_1_0: Readonly<Record<string, string>> = {
  clock: 'platform.clock',
  cache: 'platform.cache',
  counters: 'platform.counters',
  locks: 'platform.locks',
  logger: 'platform.logger',
  events: 'platform.events',
  secrets: 'platform.secrets',
  auditSink: 'platform.auditSink',
  auditRepository: 'platform.auditRepository',
  userDirectory: 'platform.userDirectory',
  passwordHistory: 'platform.passwordHistory',
  breachRegistry: 'platform.breachRegistry',
  sessionStore: 'platform.sessionStore',
  deviceRegistry: 'platform.deviceRegistry',
  refreshTokens: 'platform.refreshTokens',
  resetTokens: 'platform.resetTokens',
  apiKeys: 'platform.apiKeys',
  signingKeys: 'platform.signingKeys',
  roles: 'platform.roles',
  roleAssignments: 'platform.roleAssignments',
};

describe('1.0 port catalogue', () => {
  it.each(Object.entries(PORT_DESCRIPTIONS_1_0))('%s keeps its wiring key', (key, description) => {
    const token = (PORTS as Record<string, { description: string } | undefined>)[key];
    expect(token, `PORTS.${key} was removed`).toBeDefined();
    expect(token?.description).toBe(description);
  });

  it('may add ports without breaking anyone', () => {
    expect(Object.keys(PORTS).length).toBeGreaterThanOrEqual(
      Object.keys(PORT_DESCRIPTIONS_1_0).length,
    );
  });
});
