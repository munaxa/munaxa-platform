import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import {
  FixedClock,
  ROOT_TENANT_ID,
  unsafeId,
  type CorrelationId,
  type SecurityEvent,
} from '@munaxa/types';
import {
  ChainConflictError,
  nextSequence,
  sameSequence,
  type AuditRecord,
  type AuditRepositoryPort,
  type ChainHead,
} from '@munaxa/interfaces';
import {
  AuditService,
  CANONICAL_FORMAT_V1,
  CanonicalFormatRegistry,
  MemoryAuditRepository,
  canonicalize,
  compareSequences,
  verifyChain,
  type CanonicalFormat,
  type CanonicalInput,
} from '../src/index.js';
import { context } from './helpers.js';

/**
 * P-1: the audit framework has to be able to change without invalidating the evidence it has
 * already produced. These tests are the contract for that — each one fails loudly if a future
 * change makes historical digests unverifiable, which is the failure mode that matters, because it
 * looks exactly like tampering.
 */

const EVENT: SecurityEvent = {
  name: 'auth.login.succeeded',
  occurredAt: 1_700_000_000_000,
  tenantId: ROOT_TENANT_ID,
  correlationId: unsafeId<CorrelationId>('corr-1'),
  outcome: 'success',
  severity: 'info',
  actor: { id: 'u1', kind: 'user' },
  source: { ipAddress: '198.51.100.4' },
};

function seal(format: CanonicalFormat, previous: ChainHead | null, sequence?: bigint): AuditRecord {
  const recordedAt = 1_700_000_000_000;
  const position = sequence ?? (previous === null ? 1 : nextSequence(previous.sequence));
  const previousHash = previous?.hash ?? null;
  const hash = createHash('sha256')
    .update(format.canonicalize({ event: EVENT, previousHash, recordedAt, sequence: position }))
    .digest('hex');
  return {
    id: `aud_${position.toString(36)}`,
    event: EVENT,
    recordedAt,
    sequence: position,
    previousHash,
    hash,
    ...(format.version === 1 ? {} : { formatVersion: format.version }),
  };
}

/** Format 2, for testing only: same tuple with the user agent appended. */
const FORMAT_V2: CanonicalFormat = {
  version: 2,
  canonicalize(input: CanonicalInput): string {
    return `${CANONICAL_FORMAT_V1.canonicalize(input).slice(0, -1)},"ua"]`;
  },
};

describe('sequence representation', () => {
  it('compares and advances across both representations', () => {
    expect(sameSequence(1, 1n)).toBe(true);
    expect(sameSequence(1, 2n)).toBe(false);
    expect(nextSequence(1)).toBe(2);
    expect(nextSequence(1n)).toBe(2n);
    expect(compareSequences(1, 2n)).toBe(-1);
    expect(compareSequences(2n, 1)).toBe(1);
    expect(compareSequences(2n, 2)).toBe(0);
  });

  it('hashes a bigint sequence to the same bytes as the equivalent number', () => {
    // The property that lets a store change representation without re-sealing anything: the
    // digest depends on the position, not on how JavaScript happened to hold it.
    const asNumber = canonicalize(EVENT, null, 1_700_000_000_000, 7);
    const asBigint = canonicalize(EVENT, null, 1_700_000_000_000, 7n);
    expect(asBigint).toBe(asNumber);
  });

  it('renders a sequence past 2^53 exactly', () => {
    // `Number(9007199254740993n)` is 9007199254740992 — a different record's position. Rounding
    // here would make two records hash identically at the point where the chain proves that
    // nothing was removed from its end.
    const huge = 9_007_199_254_740_993n;
    expect(canonicalize(EVENT, null, 1_700_000_000_000, huge)).toContain('[9007199254740993,');
  });

  it('verifies a chain sequenced with bigints', () => {
    const first = seal(CANONICAL_FORMAT_V1, null, 9_007_199_254_740_993n);
    const second = seal(
      CANONICAL_FORMAT_V1,
      { sequence: first.sequence, hash: first.hash },
      9_007_199_254_740_994n,
    );
    expect(verifyChain([first, second])).toEqual({ valid: true, checked: 2 });
  });

  it('still detects a gap in a bigint chain', () => {
    const first = seal(CANONICAL_FORMAT_V1, null, 10n);
    const skipped = seal(CANONICAL_FORMAT_V1, { sequence: first.sequence, hash: first.hash }, 12n);
    const result = verifyChain([first, skipped]);
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(12n);
    expect(result.checked).toBe(1);
  });
});

describe('versioned canonical formats', () => {
  it('treats a record with no formatVersion as format 1', () => {
    const record = seal(CANONICAL_FORMAT_V1, null);
    expect(record.formatVersion).toBeUndefined();
    expect(verifyChain([record]).valid).toBe(true);
  });

  it('verifies a chain that spans a format change', () => {
    // The whole point of P-1: records written before the change keep verifying, in the same pass,
    // against the format that actually sealed them.
    const first = seal(CANONICAL_FORMAT_V1, null);
    const second = seal(FORMAT_V2, { sequence: first.sequence, hash: first.hash });
    expect(second.formatVersion).toBe(2);

    const formats = new CanonicalFormatRegistry([CANONICAL_FORMAT_V1, FORMAT_V2]);
    expect(verifyChain([first, second], { formats })).toEqual({ valid: true, checked: 2 });
  });

  it('refuses a record whose format it does not know, rather than skipping it', () => {
    const record = seal(FORMAT_V2, null);
    const result = verifyChain([record]);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('unknown canonical format version 2');
  });

  it('still detects tampering in a record sealed by a later format', () => {
    const first = seal(CANONICAL_FORMAT_V1, null);
    const second = seal(FORMAT_V2, { sequence: first.sequence, hash: first.hash });
    const tampered: AuditRecord = {
      ...second,
      event: { ...second.event, outcome: 'failure' },
    };
    const formats = new CanonicalFormatRegistry([CANONICAL_FORMAT_V1, FORMAT_V2]);
    const result = verifyChain([first, tampered], { formats });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('record contents do not match its hash');
  });

  it('refuses to redefine a registered version', () => {
    const registry = new CanonicalFormatRegistry();
    expect(() => registry.register({ version: 1, canonicalize: () => 'nope' })).toThrow(
      /already registered/,
    );
    expect(registry.versions).toEqual([1]);
  });

  it('seals new records with the configured format', async () => {
    const repository = new MemoryAuditRepository();
    const audit = new AuditService({
      repository,
      clock: new FixedClock(1_700_000_000_000),
      canonicalFormat: FORMAT_V2,
    });

    const record = await audit.record(context(), {
      name: 'auth.login.succeeded',
      outcome: 'success',
    });

    expect(record?.formatVersion).toBe(2);
    const formats = new CanonicalFormatRegistry([CANONICAL_FORMAT_V1, FORMAT_V2]);
    expect(verifyChain(repository.chain(ROOT_TENANT_ID), { formats }).valid).toBe(true);
    // …and the default verifier, which only knows format 1, says so instead of guessing.
    expect(verifyChain(repository.chain(ROOT_TENANT_ID)).valid).toBe(false);
  });
});

describe('appending inside the caller transaction', () => {
  it('passes the caller transaction through to the repository', async () => {
    const handle = { tx: 'the caller unit of work' };
    let seen: unknown;
    const repository = new MemoryAuditRepository();
    const spy = {
      joinsTransactions: true,
      write: repository.write.bind(repository),
      query: repository.query.bind(repository),
      latest: repository.latest.bind(repository),
      appendChained: async (tenantId, sealer, options) => {
        seen = options?.transaction;
        return repository.appendChained(tenantId, sealer);
      },
    } satisfies AuditRepositoryPort;

    const audit = new AuditService({ repository: spy, clock: new FixedClock(1) });
    await audit.record(
      context(),
      { name: 'auth.login.succeeded', outcome: 'success' },
      { transaction: handle },
    );

    expect(seen).toBe(handle);
  });

  it('refuses rather than silently opening its own, when the store cannot join one', async () => {
    // The failure that matters: an append that escapes the caller's transaction records a change
    // that was then rolled back — evidence of something that never happened.
    const repository = new MemoryAuditRepository();
    expect(repository.joinsTransactions).toBe(false);
    await expect(
      repository.appendChained(ROOT_TENANT_ID, () => seal(CANONICAL_FORMAT_V1, null), {
        transaction: {},
      }),
    ).rejects.toThrow(/cannot join an external transaction/);
  });

  it('does not retry a conflict inside the caller transaction', async () => {
    // A conflict has already aborted that transaction, so a retry inside it cannot commit — it
    // would just burn attempts and return a misleading error.
    let attempts = 0;
    const repository = new MemoryAuditRepository();
    const conflicting = {
      joinsTransactions: true,
      write: repository.write.bind(repository),
      query: repository.query.bind(repository),
      latest: repository.latest.bind(repository),
      appendChained: async () => {
        attempts++;
        throw new ChainConflictError(ROOT_TENANT_ID, 1);
      },
    } satisfies AuditRepositoryPort;

    const audit = new AuditService({ repository: conflicting, clock: new FixedClock(1) });

    await expect(
      audit.record(
        context(),
        { name: 'auth.login.succeeded', outcome: 'success' },
        { transaction: {} },
      ),
    ).rejects.toBeInstanceOf(ChainConflictError);
    expect(attempts).toBe(1);

    // Without a transaction the retry loop still runs, so the change is scoped to the joined case.
    attempts = 0;
    await expect(
      audit.record(context(), { name: 'auth.login.succeeded', outcome: 'success' }),
    ).rejects.toBeInstanceOf(ChainConflictError);
    expect(attempts).toBe(5);
  });
});
