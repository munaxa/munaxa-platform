import { connect, type Socket } from 'node:net';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { RedisCache, type RedisLike } from '@munaxa/cache';
import { ROOT_TENANT_ID } from '@munaxa/types';
import { BASELINE_RATE_LIMIT_RULES, RateLimiter, type RateLimitTarget } from '../src/index.js';

/**
 * The limiter against a real Redis (or Valkey) server: the atomic increment-with-expiry script, the
 * block record and the count shared by several limiter instances, each with its own connection —
 * the shape of several application tasks on one store.
 *
 * Runs when `MUNAXA_TEST_REDIS_URL` is set (CI sets it, with a Redis service). The client below is
 * the smallest RESP speaker that satisfies `RedisLike`; the platform deliberately has no Redis
 * driver dependency, so the test brings its own rather than adding one.
 */
const URL_ = process.env.MUNAXA_TEST_REDIS_URL;
// CI's dedicated step sets this, so a missing server fails the build instead of skipping quietly.
if (process.env.MUNAXA_REQUIRE_REDIS === '1' && URL_ === undefined) {
  throw new Error('MUNAXA_REQUIRE_REDIS is set but MUNAXA_TEST_REDIS_URL is not');
}

class RespClient implements RedisLike {
  readonly #socket: Socket;
  #buffer = Buffer.alloc(0);
  readonly #waiting: { resolve: (value: unknown) => void; reject: (error: Error) => void }[] = [];

  private constructor(socket: Socket) {
    this.#socket = socket;
    socket.on('data', (chunk) => {
      this.#buffer = Buffer.concat([this.#buffer, chunk]);
      for (;;) {
        const parsed = parse(this.#buffer, 0);
        if (parsed === undefined) return;
        this.#buffer = this.#buffer.subarray(parsed.end);
        const waiter = this.#waiting.shift();
        if (parsed.value instanceof Error) waiter?.reject(parsed.value);
        else waiter?.resolve(parsed.value);
      }
    });
  }

  static open(url: string): Promise<RespClient> {
    const { hostname, port } = new URL(url);
    return new Promise((resolve, reject) => {
      const socket = connect(Number(port || 6379), hostname, () => resolve(new RespClient(socket)));
      socket.once('error', reject);
    });
  }

  command(...args: readonly (string | number)[]): Promise<unknown> {
    const parts = args.map(String);
    const wire =
      `*${parts.length}\r\n` +
      parts.map((part) => `$${Buffer.byteLength(part)}\r\n${part}\r\n`).join('');
    return new Promise((resolve, reject) => {
      this.#waiting.push({ resolve, reject });
      this.#socket.write(wire);
    });
  }

  close(): void {
    this.#socket.destroy();
  }

  get = (key: string) => this.command('GET', key) as Promise<string | null>;
  set = (key: string, value: string, ...args: readonly (string | number)[]) =>
    this.command('SET', key, value, ...args) as Promise<string | null>;
  del = (...keys: readonly string[]) => this.command('DEL', ...keys) as Promise<number>;
  exists = (...keys: readonly string[]) => this.command('EXISTS', ...keys) as Promise<number>;
  incrby = (key: string, by: number) => this.command('INCRBY', key, by) as Promise<number>;
  pexpire = (key: string, ms: number) => this.command('PEXPIRE', key, ms) as Promise<number>;
  pttl = (key: string) => this.command('PTTL', key) as Promise<number>;
  eval = (script: string, numKeys: number, ...args: readonly string[]) =>
    this.command('EVAL', script, numKeys, ...args);
}

function parse(buffer: Buffer, at: number): { value: unknown; end: number } | undefined {
  const line = buffer.indexOf('\r\n', at);
  if (line === -1) return undefined;
  const head = buffer.toString('utf8', at, line);
  const rest = line + 2;
  switch (head[0]) {
    case '+':
      return { value: head.slice(1), end: rest };
    case '-':
      return { value: new Error(head.slice(1)), end: rest };
    case ':':
      return { value: Number(head.slice(1)), end: rest };
    case '$': {
      const length = Number(head.slice(1));
      if (length === -1) return { value: null, end: rest };
      if (buffer.length < rest + length + 2) return undefined;
      return { value: buffer.toString('utf8', rest, rest + length), end: rest + length + 2 };
    }
    case '*': {
      const count = Number(head.slice(1));
      const items: unknown[] = [];
      let end = rest;
      for (let index = 0; index < count; index += 1) {
        const item = parse(buffer, end);
        if (item === undefined) return undefined;
        items.push(item.value);
        end = item.end;
      }
      return { value: items, end };
    }
    default:
      throw new Error(`unexpected RESP reply: ${head}`);
  }
}

const LOGIN = BASELINE_RATE_LIMIT_RULES.find((rule) => rule.id === 'login-per-ip')!;

describe.skipIf(URL_ === undefined)('against a real Redis server', () => {
  const clients: RespClient[] = [];
  let prefix = '';

  beforeAll(async () => {
    for (let index = 0; index < 4; index += 1) clients.push(await RespClient.open(URL_!));
  });
  beforeEach(() => {
    prefix = `test:${randomUUID()}:`;
  });
  afterAll(() => {
    for (const client of clients) client.close();
  });

  const target: RateLimitTarget = {
    method: 'POST',
    path: '/api/auth/login',
    tenantId: ROOT_TENANT_ID,
    ipAddress: '203.0.113.7',
  };

  it('sets a counter and its expiry in one script', async () => {
    const cache = new RedisCache(clients[0]!, { keyPrefix: prefix });
    expect(await cache.increment('counter', 1, { ttl: 60_000 })).toBe(1);
    expect(await cache.increment('counter', 2, { ttl: 60_000 })).toBe(3);
    const ttl = await clients[0]!.pttl(`${prefix}counter`);
    expect(ttl).toBeGreaterThan(55_000);
    expect(ttl).toBeLessThanOrEqual(60_000);
  });

  it('repairs a counter that was left without an expiry', async () => {
    await clients[0]!.set(`${prefix}orphan`, '4');
    const cache = new RedisCache(clients[0]!, { keyPrefix: prefix });
    expect(await cache.increment('orphan', 1, { ttl: 30_000 })).toBe(5);
    expect(await clients[0]!.pttl(`${prefix}orphan`)).toBeGreaterThan(0);
  });

  it('holds one limit across four instances, each on its own connection, under concurrency', async () => {
    const limiters = clients.map(
      (client) =>
        new RateLimiter({ cache: new RedisCache(client, { keyPrefix: prefix }), rules: [LOGIN] }),
    );
    const decisions = await Promise.all(
      Array.from({ length: 60 }, (_, index) => limiters[index % 4]!.check(target)),
    );

    expect(decisions.filter((decision) => decision.allowed)).toHaveLength(10);
    for (const limiter of limiters) expect((await limiter.check(target)).allowed).toBe(false);
    expect(
      Number(await clients[1]!.get(`${prefix}rl:login-per-ip:root:203.0.113.7:violations`)),
    ).toBe(1);
  });

  it('regression: one address is refused from the 11th attempt on, not only on 11 and 22', async () => {
    const limiter = new RateLimiter({
      cache: new RedisCache(clients[2]!, { keyPrefix: prefix }),
      rules: [LOGIN],
    });
    const refused: number[] = [];
    for (let attempt = 1; attempt <= 30; attempt += 1) {
      if (!(await limiter.check(target)).allowed) refused.push(attempt);
    }
    expect(refused).toEqual(Array.from({ length: 20 }, (_, index) => index + 11));
  });
});
