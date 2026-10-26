import { entitlementsPath, readEntitlementResponse, unreachable, usagePath } from '../src/index.js';
import { snapshot } from './fixtures.js';

const expected = { product: 'product-a', tenantId: 'ten_1' };
const ok = (body: unknown) => ({ status: 200, body: JSON.stringify(body) });

describe('the control-plane wire format', () => {
  it('names the routes, encoding what the product passes', () => {
    expect(entitlementsPath('docs', 'a/b')).toBe(
      '/api/v1/products/docs/tenants/a%2Fb/entitlements',
    );
    expect(usagePath('work')).toBe('/api/v1/products/work/usage');
  });

  it('reads a snapshot for the tenant and product asked about', () => {
    const answer = readEntitlementResponse(ok(snapshot()), expected);
    expect(answer.kind).toBe('SNAPSHOT');
  });

  it('reads 404 as no subscription, and nothing else as one', () => {
    expect(readEntitlementResponse({ status: 404, body: '' }, expected)).toEqual({
      kind: 'NONE',
      reason: 'CONTROL_PLANE_NO_SUBSCRIPTION',
    });
    for (const status of [204, 301, 401, 403, 429, 500, 503]) {
      expect(readEntitlementResponse({ status, body: '' }, expected)).toEqual({
        kind: 'UNAVAILABLE',
        reason: `CONTROL_PLANE_HTTP_${String(status)}`,
      });
    }
  });

  it('reads a body it cannot trust as an outage, never as a grant or a cancellation', () => {
    expect(readEntitlementResponse({ status: 200, body: '{' }, expected).kind).toBe('UNAVAILABLE');
    expect(readEntitlementResponse(ok({ features: ['everything'] }), expected)).toMatchObject({
      reason: 'CONTROL_PLANE_INVALID_SNAPSHOT',
    });
    expect(readEntitlementResponse(ok(snapshot({ tenantId: 'ten_2' })), expected)).toMatchObject({
      reason: 'CONTROL_PLANE_SUBJECT_MISMATCH',
    });
    expect(readEntitlementResponse(ok(snapshot({ product: 'product-b' })), expected)).toMatchObject(
      { reason: 'CONTROL_PLANE_SUBJECT_MISMATCH' },
    );
    expect(unreachable('timeout')).toEqual({
      kind: 'UNAVAILABLE',
      reason: 'CONTROL_PLANE_TIMEOUT',
    });
  });
});
