import { describe, expect, it } from 'vitest';
import { MemoryAuditRepository, canonicalize, verifyChain } from '@munaxa/audit';
import { MemoryRefreshTokenStore } from '@munaxa/auth';
import { MemoryCache } from '@munaxa/cache';
import { MemorySessionStore } from '@munaxa/session';
import { createHash } from 'node:crypto';
import {
  FixedClock,
  unsafeId,
  type CorrelationId,
  type SecurityEvent,
  type SessionId,
  type TenantId,
  type TokenFamilyId,
  type UserId,
} from '@munaxa/types';
import type { AuditRecord, ChainHead, RefreshTokenRecord, SessionRecord } from '@munaxa/interfaces';
import {
  runAuditConformance,
  runCacheConformance,
  runRefreshTokenConformance,
  runSessionConformance,
} from '../src/index.js';

/**
 * The platform's own memory adapters run the conformance suite.
 *
 * They are the reference implementations, so they have to pass what every product adapter is
 * asked to pass — otherwise "behave like the memory store" is advice nobody can check. This file
 * is also how the suite itself is tested: a bug in an assertion shows up here first.
 */
const harness = { describe, it, expect };

// A clock the cache suite can drive, so TTL assertions are deterministic rather than timed.
const clock = new FixedClock(1_700_000_000_000);

runCacheConformance(harness, {
  createCache: () => new MemoryCache({ clock: { now: () => clock.now() }, maxEntries: 100_000 }),
  advance: (ms) => {
    clock.advance(ms);
  },
});

runAuditConformance(harness, {
  createRepository: () => new MemoryAuditRepository(),
  readChain: async (repository, tenantId) =>
    (repository as MemoryAuditRepository).chain(tenantId),
  verifyChain: (records) => verifyChain(records),
  seal: (event, previous: ChainHead | null, recordedAt): AuditRecord => {
    const sequence = (previous?.sequence ?? 0) + 1;
    const previousHash = previous?.hash ?? null;
    const hash = createHash('sha256')
      .update(canonicalize(event, previousHash, recordedAt, sequence))
      .digest('hex');
    return {
      id: `aud_${sequence.toString(36)}_${hash.slice(0, 12)}`,
      event,
      recordedAt,
      sequence,
      previousHash,
      hash,
    };
  },
  makeEvent: (tenantId, index): SecurityEvent => ({
    name: 'auth.login.succeeded',
    occurredAt: 1_700_000_000_000 + index,
    tenantId,
    correlationId: unsafeId<CorrelationId>(`corr-${index}`),
    outcome: 'success',
    severity: 'info',
    actor: { id: 'u1', kind: 'user' },
  }),
});

runRefreshTokenConformance(harness, {
  createStore: () => new MemoryRefreshTokenStore(),
  makeRecord: (overrides = {}): RefreshTokenRecord => ({
    id: 'rt-conformance',
    tenantId: 'conformance' as TenantId,
    userId: unsafeId<UserId>('u1'),
    familyId: unsafeId<TokenFamilyId>('fam-1'),
    tokenHash: 'hash-conformance',
    issuedAt: 1_700_000_000_000,
    expiresAt: 1_700_000_000_000 + 30 * 24 * 60 * 60 * 1_000,
    tokenVersion: 1,
    ...overrides,
  }),
});

runSessionConformance(harness, {
  createStore: () => new MemorySessionStore(),
  makeSession: (overrides = {}): SessionRecord => ({
    id: unsafeId<SessionId>('sess-conformance'),
    tenantId: 'conformance' as TenantId,
    userId: unsafeId<UserId>('u1'),
    createdAt: 1_700_000_000_000,
    lastSeenAt: 1_700_000_000_000,
    idleExpiresAt: 1_700_000_000_000 + 900_000,
    absoluteExpiresAt: 1_700_000_000_000 + 43_200_000,
    authMethods: ['password'],
    mfaSatisfied: false,
    tokenVersion: 1,
    ...overrides,
  }),
});
