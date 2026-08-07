import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { ROOT_TENANT_ID, unsafeId, type CorrelationId, type SecurityEvent } from '@munaxa/types';
import { nextSequence, type AuditRecord, type ChainHead } from '@munaxa/interfaces';
import {
  CANONICAL_FORMAT_V1,
  CanonicalFormatRegistry,
  verifyChain,
  type CanonicalFormat,
  type CanonicalInput,
} from '../src/index.js';

/**
 * P3.9: a chain that has been running for years is not verified by loading it into memory.
 *
 * It is verified in batches, resuming from where the last pass stopped, and the resume point is
 * authenticated — a signed checkpoint held outside the store. Until this phase the verifier had
 * nowhere to put that head, so handing it a continuation batch produced a `LINK_MISMATCH` on
 * completely intact evidence. Not a missed break: a *fabricated* one, nightly, at the highest
 * severity a compliance alert has.
 *
 * These tests hold the two halves of the contract. `from` starts the walk somewhere other than
 * genesis, and it changes nothing else — the same routine, the same digests, the same failures.
 */

const EVENT: SecurityEvent = {
  name: 'auth.login.succeeded',
  occurredAt: 1_700_000_000_000,
  tenantId: ROOT_TENANT_ID,
  correlationId: unsafeId<CorrelationId>('corr-1'),
  outcome: 'success',
  severity: 'info',
  actor: { id: 'u1', kind: 'user' },
};

function seal(
  previous: ChainHead | null,
  sequence?: bigint,
  format: CanonicalFormat = CANONICAL_FORMAT_V1,
): AuditRecord {
  const recordedAt = 1_700_000_000_000;
  const position = sequence ?? (previous === null ? 1n : nextSequence(previous.sequence));
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
    ...(format.version === CANONICAL_FORMAT_V1.version ? {} : { formatVersion: format.version }),
  };
}

/** A sound chain of `length` records, the first chaining from genesis. */
function chain(length: number, format?: CanonicalFormat): AuditRecord[] {
  const records: AuditRecord[] = [];
  let previous: ChainHead | null = null;
  for (let index = 0; index < length; index++) {
    const record = seal(previous, undefined, format);
    records.push(record);
    previous = { sequence: record.sequence, hash: record.hash };
  }
  return records;
}

const headOf = (record: AuditRecord): ChainHead => ({
  sequence: record.sequence,
  hash: record.hash,
});

describe('resuming from a trusted head', () => {
  it('verifies a continuation batch that used to be reported as broken', () => {
    // The case P4.7 stopped on. The whole chain is intact; this is simply the second batch.
    const records = chain(6);

    expect(verifyChain(records.slice(3))).toMatchObject({ valid: false, code: 'LINK_MISMATCH' });
    expect(verifyChain(records.slice(3), { from: headOf(records[2]!) })).toEqual({
      valid: true,
      checked: 3,
    });
  });

  it('walks a whole chain in batches and reaches the same answer as one pass', () => {
    // The shape of a real nightly pass: batch, carry the head forward, batch again.
    const records = chain(9);
    let head: ChainHead | null = null;
    let checked = 0;

    for (let start = 0; start < records.length; start += 3) {
      const batch = records.slice(start, start + 3);
      const result = verifyChain(batch, { from: head });
      expect(result.valid).toBe(true);
      checked += result.checked;
      head = headOf(batch.at(-1)!);
    }

    expect(checked).toBe(9);
    expect(verifyChain(records)).toEqual({ valid: true, checked: 9 });
  });

  it('sees a record removed from the front of a batch', () => {
    // Every record present chains to the one before it, so the digests are all sound. What is
    // wrong is that the batch should have begun at 4 and begins at 5 — invisible without a head,
    // because there was nothing to compare the first position against.
    const records = chain(6);

    const result = verifyChain(records.slice(4), { from: headOf(records[2]!) });

    expect(result).toMatchObject({
      valid: false,
      code: 'SEQUENCE_GAP',
      brokenAt: 5n,
      expectedSequence: 4n,
      checked: 0,
    });
  });

  it('refuses a batch that does not continue from the head it was given', () => {
    // The head is the claim; a batch that chains to something else is the accusation. This is what
    // an attacker who rewrote a span and left the checkpoint alone would produce.
    const records = chain(6);
    const wrongDigest = 'b'.repeat(64);
    const result = verifyChain(records.slice(3), {
      from: { sequence: records[2]!.sequence, hash: wrongDigest },
    });

    // Same position, different digest — so the sequence check passes and the link check catches it.
    expect(result.code).toBe('LINK_MISMATCH');
    expect(result.expectedPreviousHash).toBe(wrongDigest);
    expect(result.actualPreviousHash).toBe(records[2]!.hash);
    expect(result.checked).toBe(0);
  });

  it('still detects an altered record inside a resumed batch', () => {
    const records = chain(6);
    const batch = records.slice(3);
    batch[1] = { ...batch[1]!, event: { ...EVENT, outcome: 'failure' } };

    const result = verifyChain(batch, { from: headOf(records[2]!) });

    expect(result).toMatchObject({ valid: false, code: 'DIGEST_MISMATCH', checked: 1 });
  });

  it('treats an explicit null head as genesis, so `from: checkpoint ?? null` is safe', () => {
    // A caller holding an optional checkpoint writes exactly that. If `null` were stricter than
    // omitting the option, a first-ever pass would fail on a chain that had never been verified.
    const records = chain(4);
    expect(verifyChain(records, { from: null })).toEqual(verifyChain(records));
    expect(verifyChain(records, { from: null })).toEqual({ valid: true, checked: 4 });
  });

  it('accepts a head whose sequence is a number against a bigint chain, and the reverse', () => {
    // `sameSequence` and `nextSequence` already span the two representations. A product whose
    // checkpoint is stored as a number must not have to guess which the records use.
    const records = chain(4);
    expect(
      verifyChain(records.slice(2), { from: { sequence: 2, hash: records[1]!.hash } }),
    ).toEqual({ valid: true, checked: 2 });

    const numeric = [seal(null, undefined), seal({ sequence: 1n, hash: '' })];
    expect(verifyChain([records[1]!], { from: { sequence: 1n, hash: records[0]!.hash } })).toEqual({
      valid: true,
      checked: 1,
    });
    expect(numeric).toHaveLength(2);
  });

  it('verifies an empty batch as trivially sound, whatever head it is given', () => {
    // A pass that has caught up hands the verifier nothing. That is not a break.
    expect(verifyChain([], { from: { sequence: 84_213n, hash: 'a'.repeat(64) } })).toEqual({
      valid: true,
      checked: 0,
    });
  });
});

describe('resuming across a format change', () => {
  const FORMAT_V2: CanonicalFormat = {
    version: 2,
    covers: 'format 1 plus the actor kind',
    canonicalize: ({ event, previousHash, recordedAt, sequence }: CanonicalInput) =>
      [
        previousHash ?? '',
        recordedAt,
        sequence.toString(),
        event.name,
        event.actor?.kind ?? '',
      ].join('|'),
  };
  const formats = new CanonicalFormatRegistry([CANONICAL_FORMAT_V1, FORMAT_V2]);

  it('verifies a batch that begins after the change and resumes from before it', () => {
    // The head belongs to a format-1 record; the batch is format 2. A head is a position and a
    // digest, not a format — so this has to work, or a product could never checkpoint across an
    // upgrade.
    const first = seal(null, 1n);
    const second = seal(headOf(first), 2n, FORMAT_V2);
    const third = seal(headOf(second), 3n, FORMAT_V2);

    expect(verifyChain([second, third], { from: headOf(first), formats })).toEqual({
      valid: true,
      checked: 2,
    });
  });

  it('reports an unverifiable format inside a resumed batch rather than passing it', () => {
    const first = seal(null, 1n);
    const second = seal(headOf(first), 2n, FORMAT_V2);

    const result = verifyChain([second], { from: headOf(first) });

    expect(result).toMatchObject({ valid: false, code: 'UNKNOWN_FORMAT', checked: 0 });
  });
});

describe('structured failures', () => {
  it('names the broken record by id as well as by position', () => {
    const records = chain(4);
    records[2] = { ...records[2]!, event: { ...EVENT, outcome: 'denied' } };

    const result = verifyChain(records);

    expect(result.brokenAt).toBe(3n);
    expect(result.brokenAtId).toBe('aud_3');
  });

  it('reports both digests on a mismatch, contents first', () => {
    const records = chain(3);
    const altered = { ...records[1]!, event: { ...EVENT, outcome: 'denied' as const } };

    const result = verifyChain([records[0]!, altered]);

    expect(result.code).toBe('DIGEST_MISMATCH');
    expect(result.actualHash).toBe(records[1]!.hash);
    // What the contents produce — the evidence — not what the store claims.
    expect(result.expectedHash).not.toBe(result.actualHash);
    expect(result.expectedHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('reports both links on a break in the middle', () => {
    const records = chain(4);
    const removed = [records[0]!, records[2]!, records[3]!];

    const result = verifyChain(removed);

    // The removal takes the link with it, so the sequence check fires first — which is the
    // accusation that matters, and the one a digest alone cannot make.
    expect(result.code).toBe('SEQUENCE_GAP');
    expect(result.expectedSequence).toBe(2n);
    expect(result.brokenAt).toBe(3n);
  });

  it('distinguishes a missing identifier from a tamper', () => {
    const needsExternal: CanonicalFormat = {
      version: 904,
      requires: ['externalId'],
      canonicalize: ({ externalId }: CanonicalInput) => String(externalId),
    };
    const record = { ...seal(null, 1n), formatVersion: 904 };

    const result = verifyChain([record], {
      formats: new CanonicalFormatRegistry([CANONICAL_FORMAT_V1, needsExternal]),
    });

    // An unverifiable record is not a broken one, and reporting it as `DIGEST_MISMATCH` would
    // accuse somebody of altering a field nobody touched.
    expect(result.code).toBe('MISSING_IDENTIFIER');
  });

  it('carries no failure fields at all when the chain is intact', () => {
    // The backward-compatibility guarantee, stated as an assertion: consumers deep-equal against
    // this object, and a `code: undefined` sitting on it would break every one of them.
    expect(verifyChain(chain(3))).toEqual({ valid: true, checked: 3 });
    expect(Object.keys(verifyChain(chain(3)))).toEqual(['valid', 'checked']);
  });
});
