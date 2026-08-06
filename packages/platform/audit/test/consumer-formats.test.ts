import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { ROOT_TENANT_ID, unsafeId, type CorrelationId, type AnyAuditEvent } from '@munaxa/types';
import type { AuditRecord } from '@munaxa/interfaces';
import {
  CANONICAL_FORMAT_V1,
  CanonicalFormatRegistry,
  canonicalize,
  verifyChain,
  type CanonicalFormat,
  type CanonicalInput,
} from '../src/index.js';

/**
 * P-6: a chain whose digest covers an independently minted record id must be expressible.
 *
 * The format below is Munaxa Docs' v3 digest, reproduced from its own source: `sha256` over a
 * `|`-joined material list that begins `previousHash, eventId, tenantId, …`. It is here rather than
 * in that repository because the claim being tested is a *platform* claim — that an arbitrary
 * historical chain design can be expressed as a `CanonicalFormat` without the platform knowing
 * anything about the product.
 */

const DOCS_FORMAT_V3 = 903;

/** Munaxa Docs' v3 digest. Its material starts with the record id, which is why P-6 exists. */
const docsV3: CanonicalFormat = {
  version: DOCS_FORMAT_V3,
  requires: ['recordId'],
  covers:
    'previousHash, eventId, tenant, occurredAt, actor, action, subject, outcome, payload, ' +
    'sequence, channel, onBehalfOf, reason, correlation, ip, userAgent, apiClientId',
  canonicalize({ event, previousHash, sequence, recordId }: CanonicalInput): string {
    const p = event.payload as Record<string, string | undefined>;
    return [
      previousHash ?? '',
      recordId ?? '',
      event.tenantId,
      new Date(event.occurredAt).toISOString(),
      event.actor?.id ?? '',
      event.name,
      event.target?.type ?? '',
      event.target?.id ?? '',
      event.outcome,
      JSON.stringify(p['docsPayload'] ?? {}),
      sequence.toString(),
      p['channel'] ?? '',
      p['onBehalfOfId'] ?? '',
      p['reason'] ?? '',
      event.correlationId,
      event.source?.ipAddress ?? '',
      p['userAgent'] ?? '',
      p['apiClientId'] ?? '',
    ].join('|');
  },
};

function docsEvent(action: string): AnyAuditEvent {
  return {
    name: action,
    occurredAt: 1_700_000_000_000,
    tenantId: ROOT_TENANT_ID,
    correlationId: unsafeId<CorrelationId>('corr-docs'),
    outcome: 'success',
    severity: 'info',
    actor: { id: 'user-1', kind: 'user' },
    target: { id: 'doc-42', type: 'DOCUMENT' },
    source: { ipAddress: '198.51.100.4' },
    payload: {
      channel: 'API',
      onBehalfOfId: 'delegate-7',
      reason: 'CONFIDENTIAL_ACCESS',
      userAgent: 'Mozilla/5.0',
      apiClientId: 'key-3',
      docsPayload: { pages: 12 },
    },
  };
}

/** Seal a record the way the product's own writer would, outside the platform. */
function sealDocs(id: string, sequence: bigint, previousHash: string | null): AuditRecord<string> {
  const event = docsEvent('DOCUMENT_DOWNLOADED');
  const hash = createHash('sha256')
    .update(docsV3.canonicalize({ event, previousHash, recordedAt: 0, sequence, recordId: id }))
    .digest('hex');
  return {
    id,
    event,
    recordedAt: 1_700_000_000_000,
    sequence,
    previousHash,
    hash,
    formatVersion: DOCS_FORMAT_V3,
  };
}

const registry = new CanonicalFormatRegistry([CANONICAL_FORMAT_V1, docsV3]);

describe('a consumer chain whose digest covers its own record id', () => {
  it('verifies end to end', () => {
    const first = sealDocs('0199-aaaa', 1n, null);
    const second = sealDocs('0199-bbbb', 2n, first.hash);

    expect(verifyChain([first, second], { formats: registry })).toEqual({
      valid: true,
      checked: 2,
    });
  });

  it('still detects a record whose id was swapped', () => {
    // The property the product bought by hashing the id: renumbering a row breaks its digest.
    // Before P-6 this could not even be expressed, so it could not be checked.
    const record = sealDocs('0199-aaaa', 1n, null);
    const renumbered: AuditRecord<string> = { ...record, id: '0199-cccc' };

    const result = verifyChain([renumbered], { formats: registry });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('record contents do not match its hash');
  });

  it('refuses to run a format whose required identifier is missing', () => {
    // Rather than hashing `undefined` and reporting a tamper that did not happen.
    const needsExternal: CanonicalFormat = {
      version: 904,
      requires: ['externalId'],
      canonicalize: ({ externalId }) => String(externalId),
    };
    const record = { ...sealDocs('0199-aaaa', 1n, null), formatVersion: 904 };

    const result = verifyChain([record], {
      formats: new CanonicalFormatRegistry([CANONICAL_FORMAT_V1, needsExternal]),
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/requires externalId/);
  });
});

describe('mixed chains', () => {
  it('verifies platform-native and consumer records in one pass', () => {
    // A product adopting the platform format for new records while its history stays in its own.
    const legacy = sealDocs('0199-aaaa', 1n, null);

    const nativeEvent = docsEvent('auth.login.succeeded');
    const nativeHash = createHash('sha256')
      .update(
        CANONICAL_FORMAT_V1.canonicalize({
          event: nativeEvent,
          previousHash: legacy.hash,
          recordedAt: 1_700_000_000_001,
          sequence: 2n,
        }),
      )
      .digest('hex');
    const native: AuditRecord<string> = {
      id: 'aud_2_abc',
      event: nativeEvent,
      recordedAt: 1_700_000_000_001,
      sequence: 2n,
      previousHash: legacy.hash,
      hash: nativeHash,
    };

    expect(verifyChain([legacy, native], { formats: registry })).toEqual({
      valid: true,
      checked: 2,
    });
  });
});

describe('platform digests are unchanged by P-6', () => {
  it('produces the byte-identical format 1 material', () => {
    // The 2.0.0 bytes, pinned here as a literal rather than recomputed, so a change to
    // `CanonicalInput` that altered them would fail rather than move with the code.
    const event: AnyAuditEvent = {
      name: 'auth.login.succeeded',
      occurredAt: 1_700_000_000_000,
      tenantId: ROOT_TENANT_ID,
      correlationId: unsafeId<CorrelationId>('corr-1'),
      outcome: 'success',
      severity: 'info',
      actor: { id: 'u1', kind: 'user' },
      source: { ipAddress: '198.51.100.4' },
    };

    expect(canonicalize(event, null, 1_700_000_000_000, 1)).toBe(
      '[1,null,1700000000000,"auth.login.succeeded",1700000000000,"root","corr-1","success","info","u1","user",null,null,"198.51.100.4",null]',
    );
  });

  it('ignores a record id even when one is present', () => {
    // Format 1 does not declare `recordId`, so it is never passed one — the guarantee that made
    // this additive rather than breaking.
    const event = docsEvent('auth.login.succeeded');
    const withId = CANONICAL_FORMAT_V1.canonicalize({
      event,
      previousHash: null,
      recordedAt: 1,
      sequence: 1,
      recordId: 'should-not-appear',
    });
    expect(withId).not.toContain('should-not-appear');
    expect(withId).toBe(
      CANONICAL_FORMAT_V1.canonicalize({
        event,
        previousHash: null,
        recordedAt: 1,
        sequence: 1,
      }),
    );
  });
});
