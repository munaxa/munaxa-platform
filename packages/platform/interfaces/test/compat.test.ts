import { describe, expect, it } from 'vitest';
import { PORTS } from '../src/index.js';

/**
 * Port descriptions are wiring keys. NestJS products pass them to `@Inject()`, and a renamed
 * description silently unbinds a provider — the application still starts, and the port resolves
 * to undefined at the first request. Pin them.
 *
 * A key that is *removed* is a different matter from one that is renamed: the product's
 * `@Inject()` fails to compile, which is the loud failure a rename is not. Four were removed in
 * 2.0 because they were declared and wired to nothing — see `REMOVED_IN_2_0` below.
 */
const PORT_DESCRIPTIONS_1_0: Readonly<Record<string, string>> = {
  clock: 'platform.clock',
  cache: 'platform.cache',
  counters: 'platform.counters',
  locks: 'platform.locks',
  logger: 'platform.logger',
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
  roles: 'platform.roles',
  roleAssignments: 'platform.roleAssignments',
};

/**
 * Removed in 2.0, deliberately.
 *
 * Each of these was declared in `@munaxa/interfaces` and consumed by no package. A port that
 * nothing implements is not an extension seam, it is a promise: `signingKeys` advertised JWT key
 * rotation that `TokenService` does not do, and a product reading the catalogue would reasonably
 * have believed otherwise. Removing them is a breaking change to a package that has never been
 * published, which is the cheapest moment it will ever be.
 */
const REMOVED_IN_2_0 = ['random', 'ids', 'events', 'signingKeys'] as const;

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

  it.each(REMOVED_IN_2_0)('%s stays removed rather than returning unimplemented', (key) => {
    // Reinstating one of these should be a decision with an implementation attached, not an
    // accident of a merge.
    expect(Object.keys(PORTS)).not.toContain(key);
  });
});
