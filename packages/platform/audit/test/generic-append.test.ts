import { describe, expect, it } from 'vitest';
import { ROOT_TENANT_ID, unsafeId, type CorrelationId } from '@munaxa/types';
import type { AuditRecord, AuditRepositoryPort, AuditSealer, ChainHead } from '@munaxa/interfaces';
import {
  AuditService,
  CANONICAL_FORMAT_V1,
  CanonicalFormatRegistry,
  MemoryAuditRepository,
  verifyChain,
  type CanonicalFormat,
  type CanonicalInput,
} from '../src/index.js';

/**
 * P-8 and P-9: a product must be able to *append* under its own vocabulary and its own record
 * identity, not merely verify what it wrote by hand.
 *
 * The three consumers this was designed against want three different identifier strategies —
 * `uuidv7` in Munaxa Docs, plain `uuid` in Munaxa School, nothing yet in Munaxa Work — so the
 * tests below cover a product id, the platform default, and the interaction with a format that
 * hashes the id.
 */

type DocsAction = 'DOCUMENT_DOWNLOADED' | 'WORKFLOW_APPROVED';

const TENANT = ROOT_TENANT_ID;

function docsEvent(name: DocsAction) {
  return {
    name,
    occurredAt: 1_700_000_000_000,
    tenantId: TENANT,
    correlationId: unsafeId<CorrelationId>('corr-1'),
    outcome: 'success' as const,
    severity: 'info' as const,
    actor: { id: 'u1', kind: 'user' },
  };
}

/** A format that hashes the record id — the case P-6 opened and P-9 makes appendable. */
const idCoveringFormat: CanonicalFormat = {
  version: 901,
  requires: ['recordId'],
  covers: 'previousHash, recordId, sequence, event name',
  canonicalize: ({ previousHash, recordId, sequence, event }: CanonicalInput) =>
    [previousHash ?? '0'.repeat(64), recordId ?? '', sequence.toString(), event.name].join('|'),
};

describe('P-8 — appending under a product vocabulary', () => {
  it('accepts a repository typed to the product vocabulary', async () => {
    // The declaration that did not compile before this phase.
    const repository: AuditRepositoryPort<DocsAction> = new MemoryAuditRepository<DocsAction>();
    const audit = new AuditService<DocsAction>({ repository });

    const written = await audit.write(docsEvent('DOCUMENT_DOWNLOADED'));

    expect(written?.event.name).toBe('DOCUMENT_DOWNLOADED');
    expect(written?.sequence).toBe(1);
  });

  it('keeps exhaustiveness — an unknown name does not type-check', () => {
    // Compile-time only; the runtime assertion is incidental. `@ts-expect-error` fails the build
    // if the error stops happening, which is what makes this a real guard rather than a comment.
    const repository = new MemoryAuditRepository<DocsAction>();
    const audit = new AuditService<DocsAction>({ repository });

    // @ts-expect-error 'auth.login.succeeded' is not in this product's vocabulary
    void audit.write({ ...docsEvent('DOCUMENT_DOWNLOADED'), name: 'auth.login.succeeded' });
    expect(audit).toBeDefined();
  });

  it('chains product records and verifies them', async () => {
    const repository = new MemoryAuditRepository<DocsAction>();
    const audit = new AuditService<DocsAction>({ repository });

    await audit.write(docsEvent('DOCUMENT_DOWNLOADED'));
    await audit.write(docsEvent('WORKFLOW_APPROVED'));

    const chain = repository.chain(TENANT);
    expect(chain).toHaveLength(2);
    expect(verifyChain(chain)).toEqual({ valid: true, checked: 2 });
  });

  it('carries the vocabulary through a sealer', () => {
    // `AuditSealer<TName>` is the declaration P4.5B proved was closed.
    const sealer: AuditSealer<DocsAction> = (previous: ChainHead | null) => ({
      id: 'x',
      event: docsEvent('WORKFLOW_APPROVED'),
      recordedAt: 1,
      sequence: 1,
      previousHash: previous?.hash ?? null,
      hash: 'h',
    });
    expect(sealer(null).event.name).toBe('WORKFLOW_APPROVED');
  });
});

describe('P-9 — configurable record identity', () => {
  it('defaults to the platform identifier, unchanged', async () => {
    const repository = new MemoryAuditRepository();
    const audit = new AuditService({ repository });

    const written = await audit.write({
      ...docsEvent('DOCUMENT_DOWNLOADED'),
      name: 'auth.login.succeeded',
    });

    // `aud_${sequence.toString(36)}_${hash.slice(0, 12)}` — derived from the digest, as before.
    expect(written?.id).toMatch(/^aud_1_[0-9a-f]{12}$/);
    expect(written?.id.endsWith(written.hash.slice(0, 12))).toBe(true);
  });

  it('uses the product generator when supplied', async () => {
    const repository = new MemoryAuditRepository<DocsAction>();
    let minted = 0;
    const audit = new AuditService<DocsAction>({
      repository,
      generateId: () => `0199aaaa-0000-7000-8000-00000000000${++minted}`,
    });

    const written = await audit.write(docsEvent('DOCUMENT_DOWNLOADED'));
    expect(written?.id).toBe('0199aaaa-0000-7000-8000-000000000001');
  });

  it('mints the id before hashing, so a format may cover it', async () => {
    // The ordering that makes P-6 usable from the append path rather than only from verification.
    const repository = new MemoryAuditRepository<DocsAction>();
    const formats = new CanonicalFormatRegistry([CANONICAL_FORMAT_V1, idCoveringFormat]);
    const audit = new AuditService<DocsAction>({
      repository,
      canonicalFormat: idCoveringFormat,
      generateId: (sequence) => `doc-${sequence.toString()}`,
    });

    const written = await audit.write(docsEvent('DOCUMENT_DOWNLOADED'));

    expect(written?.id).toBe('doc-1');
    expect(written?.formatVersion).toBe(901);
    expect(verifyChain(repository.chain(TENANT), { formats })).toEqual({ valid: true, checked: 1 });
  });

  it('detects a swapped id on a record it appended itself', async () => {
    // End to end: the digest covers the id the service minted, so renumbering breaks it.
    const repository = new MemoryAuditRepository<DocsAction>();
    const formats = new CanonicalFormatRegistry([CANONICAL_FORMAT_V1, idCoveringFormat]);
    const audit = new AuditService<DocsAction>({
      repository,
      canonicalFormat: idCoveringFormat,
      generateId: (sequence) => `doc-${sequence.toString()}`,
    });
    await audit.write(docsEvent('DOCUMENT_DOWNLOADED'));

    const [record] = repository.chain(TENANT);
    const renumbered: AuditRecord<DocsAction>[] = [{ ...record!, id: 'doc-999' }];

    expect(verifyChain(renumbered, { formats }).valid).toBe(false);
  });

  it('receives the sequence and timestamp it is documented to receive', async () => {
    const repository = new MemoryAuditRepository<DocsAction>();
    const seen: Array<[unknown, number]> = [];
    const audit = new AuditService<DocsAction>({
      repository,
      generateId: (sequence, recordedAt) => {
        seen.push([sequence, recordedAt]);
        return `id-${sequence.toString()}`;
      },
    });

    await audit.write(docsEvent('DOCUMENT_DOWNLOADED'));
    await audit.write(docsEvent('WORKFLOW_APPROVED'));

    expect(seen.map(([sequence]) => sequence)).toEqual([1, 2]);
    expect(seen.every(([, at]) => typeof at === 'number' && at > 0)).toBe(true);
  });
});

describe('the platform default is untouched', () => {
  it('still writes platform events with platform ids and format 1', async () => {
    const repository = new MemoryAuditRepository();
    const audit = new AuditService({ repository });

    const written = await audit.write({
      name: 'auth.login.succeeded',
      occurredAt: 1_700_000_000_000,
      tenantId: TENANT,
      correlationId: unsafeId<CorrelationId>('corr-1'),
      outcome: 'success',
      severity: 'info',
    });

    expect(written?.formatVersion).toBeUndefined();
    expect(written?.id).toMatch(/^aud_/);
    expect(verifyChain(repository.chain(TENANT))).toEqual({ valid: true, checked: 1 });
  });
});
