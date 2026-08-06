import {
  FixedClock,
  ROOT_TENANT_ID,
  unsafeId,
  type CorrelationId,
  type SecurityContext,
  type TenantId,
  type UserId,
} from '@munaxa/types';
import { AuditService, MemoryAuditRepository } from '../src/index.js';

export function context(overrides: Partial<SecurityContext> = {}): SecurityContext {
  return {
    tenantId: ROOT_TENANT_ID,
    principal: { kind: 'user', tenantId: ROOT_TENANT_ID, userId: unsafeId<UserId>('u1') },
    correlationId: unsafeId<CorrelationId>('corr-1'),
    ipAddress: '198.51.100.4',
    userAgent: 'Mozilla/5.0',
    ...overrides,
  };
}

export function tenantContext(tenantId: TenantId): SecurityContext {
  return context({
    tenantId,
    principal: { kind: 'user', tenantId, userId: unsafeId<UserId>('u1') },
  });
}

export function auditFixture(): {
  audit: AuditService;
  repository: MemoryAuditRepository;
  clock: FixedClock;
} {
  const clock = new FixedClock(1_700_000_000_000);
  const repository = new MemoryAuditRepository();
  const audit = new AuditService({ sinks: [repository], clock });
  return { audit, repository, clock };
}
