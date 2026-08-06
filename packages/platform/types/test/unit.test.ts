import { describe, expect, it } from 'vitest';
import {
  cacheKey,
  keySegment,
  DAY,
  FixedClock,
  MINUTE,
  PlatformError,
  ROOT_TENANT_ID,
  anonymous,
  assertSameTenant,
  emptyPage,
  err,
  isErr,
  isExpired,
  isOk,
  mapResult,
  normalizePageRequest,
  ok,
  parseDuration,
  platformError,
  principalSubject,
  severityFor,
  toTenantId,
  toUserId,
  unsafeId,
  unwrap,
  unwrapOr,
  type UserId,
  type UserPrincipal,
} from '../src/index.js';

describe('identifiers', () => {
  it('accepts well-formed identifiers', () => {
    expect(toUserId('user_01HQ')).toBe('user_01HQ');
    expect(toTenantId('acme-eu')).toBe('acme-eu');
  });

  it.each([
    ['empty', ''],
    ['whitespace', 'user 1'],
    ['newline injection', 'user\nrole=admin'],
    ['path traversal', '../../etc/passwd'],
    ['too long', 'a'.repeat(191)],
  ])('rejects %s', (_label, value) => {
    expect(() => toUserId(value)).toThrow(TypeError);
  });

  it('truncates the offending value in the error message', () => {
    expect(() => toUserId('!'.repeat(500))).toThrow(/…/);
  });
});

describe('Result', () => {
  it('narrows through the ok/err guards', () => {
    const good = ok(3);
    const bad = err(new Error('nope'));
    expect(isOk(good) && good.value).toBe(3);
    expect(isErr(bad)).toBe(true);
    expect(unwrap(good)).toBe(3);
    expect(unwrapOr(bad, 7)).toBe(7);
    expect(unwrap(mapResult(good, (n) => n * 2))).toBe(6);
  });

  it('unwrap throws the carried error', () => {
    expect(() => unwrap(err(new Error('boom')))).toThrow('boom');
  });
});

describe('time', () => {
  it.each([
    ['250ms', 250],
    ['30s', 30_000],
    ['15m', 15 * MINUTE],
    ['7d', 7 * DAY],
    ['1w', 7 * DAY],
  ])('parses %s', (input, expected) => {
    expect(parseDuration(input)).toBe(expected);
  });

  it('rejects a bare numeric string rather than guessing the unit', () => {
    expect(() => parseDuration('3600')).toThrow(TypeError);
  });

  it('treats the deadline itself as expired', () => {
    expect(isExpired(1_000, 1_000)).toBe(true);
    expect(isExpired(1_000, 999)).toBe(false);
  });

  it('FixedClock only moves when told to', () => {
    const clock = new FixedClock(5_000);
    expect(clock.now()).toBe(5_000);
    clock.advance(MINUTE);
    expect(clock.now()).toBe(5_000 + MINUTE);
  });
});

describe('principals', () => {
  it('derives a stable subject per kind', () => {
    const user: UserPrincipal = {
      kind: 'user',
      tenantId: ROOT_TENANT_ID,
      userId: unsafeId<UserId>('u1'),
    };
    expect(principalSubject(user)).toBe('u1');
    expect(principalSubject(anonymous(ROOT_TENANT_ID))).toBe('anonymous');
    expect(
      principalSubject({ kind: 'system', tenantId: ROOT_TENANT_ID, component: 'scheduler' }),
    ).toBe('system:scheduler');
  });

  it('assertSameTenant rejects a cross-tenant record', () => {
    expect(() => assertSameTenant(toTenantId('a'), toTenantId('b'))).toThrow(/Tenant mismatch/);
    expect(() => assertSameTenant(toTenantId('a'), toTenantId('a'))).not.toThrow();
  });
});

describe('errors', () => {
  it('derives status and public message from the code', () => {
    const error = platformError('SECURITY_RATE_LIMITED', 'bucket empty', { retryAfterSeconds: 30 });
    expect(error).toBeInstanceOf(PlatformError);
    expect(error.status).toBe(429);
    expect(error.toPublicJSON()).toEqual({
      code: 'SECURITY_RATE_LIMITED',
      message: 'Too many requests. Try again shortly.',
      retryAfterSeconds: 30,
    });
  });
});

describe('events', () => {
  it('assigns a raised severity to the events that matter', () => {
    expect(severityFor('auth.token.reuse.detected')).toBe('critical');
    expect(severityFor('auth.login.succeeded')).toBe('info');
  });
});

describe('pagination', () => {
  it('clamps caller-supplied limits', () => {
    expect(normalizePageRequest({ limit: 10_000 }).limit).toBe(500);
    expect(normalizePageRequest({ limit: 0 }).limit).toBe(50);
    expect(normalizePageRequest().limit).toBe(50);
    expect(emptyPage().items).toEqual([]);
  });
});

describe('cache key composition', () => {
  it('keeps distinct segment lists distinct', () => {
    // The collision this exists to prevent: tenant "a:b" + user "c" and tenant "a" + user "b:c"
    // both produced "rbac:a:b:c" when keys were interpolated by hand. For a permission cache that
    // is one tenant being served another tenant's resolved grants.
    expect(cacheKey('rbac', 'a:b', 'c')).not.toBe(cacheKey('rbac', 'a', 'b:c'));
  });

  it('keeps an escaped separator distinct from a literal one', () => {
    // '%' must be escaped before ':', or a literal '%3A' in the input decodes to the same key as
    // an escaped ':' and the encoding stops being injective.
    expect(cacheKey('t', '%3A')).not.toBe(cacheKey('t', ':'));
  });

  it('is stable, so a key survives a deployment', () => {
    expect(cacheKey('rbac', 'tenant-1', 'user-1')).toBe('rbac:tenant-1:user-1');
  });

  it('escapes every segment, including the prefix', () => {
    expect(keySegment('a:b')).toBe('a%3Ab');
    expect(keySegment('100%')).toBe('100%25');
  });
});
