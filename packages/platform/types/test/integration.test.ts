import { describe, expect, it, vi } from 'vitest';
import {
  composeMiddleware,
  emptyResponse,
  header,
  platformError,
  type PlatformMiddleware,
  type PlatformRequest,
} from '../src/index.js';

function request(overrides: Partial<PlatformRequest> = {}): PlatformRequest {
  return {
    method: 'POST',
    path: '/api/login',
    headers: { 'content-type': 'application/json', 'x-correlation-id': 'c-1' },
    ...overrides,
  };
}

describe('middleware composition', () => {
  it('runs steps in order and stops at the first response', async () => {
    const order: string[] = [];
    const step = (name: string, short = false): PlatformMiddleware => {
      return (_req, res) => {
        order.push(name);
        return short ? { ...res, status: 403 } : undefined;
      };
    };

    const chain = composeMiddleware(step('normalize'), step('rate-limit', true), step('auth'));
    const result = await chain(request(), emptyResponse());

    expect(order).toEqual(['normalize', 'rate-limit']);
    expect(result?.status).toBe(403);
  });

  it('lets every step mutate the shared response when none short-circuits', async () => {
    const chain = composeMiddleware(
      (_req, res) => {
        res.headers['x-frame-options'] = 'DENY';
      },
      (_req, res) => {
        res.cookies.push({ name: 'sid', value: 'abc', options: { httpOnly: true } });
      },
    );

    const response = emptyResponse();
    await expect(chain(request(), response)).resolves.toBeUndefined();
    expect(response.headers['x-frame-options']).toBe('DENY');
    expect(response.cookies).toHaveLength(1);
  });

  it('awaits asynchronous steps', async () => {
    const slow = vi.fn(async () => {
      await Promise.resolve();
    });
    await composeMiddleware(slow, slow)(request(), emptyResponse());
    expect(slow).toHaveBeenCalledTimes(2);
  });
});

describe('header access', () => {
  it('is case-insensitive at the call site', () => {
    expect(header(request(), 'Content-Type')).toBe('application/json');
    expect(header(request(), 'X-Missing')).toBeUndefined();
  });
});

describe('error transport', () => {
  it('produces a response body carrying only the public shape', () => {
    const error = platformError('AUTHZ_PERMISSION_DENIED', 'user lacks docs:write on doc_42', {
      details: { permission: 'docs:write', documentId: 'doc_42' },
    });

    const response = { ...emptyResponse(), status: error.status, body: error.toPublicJSON() };

    expect(response.status).toBe(403);
    expect(JSON.stringify(response.body)).not.toContain('doc_42');
    expect(JSON.stringify(response.body)).not.toContain('docs:write');
  });
});
