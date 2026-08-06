import type { Clock } from '@munaxa/types';
import type { RedisLike } from '../src/index.js';

/**
 * An in-memory stand-in for a Redis server, honouring the argument forms `RedisCache` uses:
 * `SET key value [NX] [PX ms] [KEEPTTL]`, `INCRBY`, `PEXPIRE`, `PTTL`, `SCAN MATCH COUNT`.
 *
 * It exists to test the adapter's command construction — the part that breaks when someone
 * "simplifies" an option away — without a server in CI. It is not a Redis emulator, and the
 * integration suite says so where behaviour would differ.
 */
export class FakeRedis implements RedisLike {
  readonly #values = new Map<string, string>();
  readonly #expiries = new Map<string, number>();
  readonly #clock: Clock;
  readonly commands: string[] = [];

  constructor(clock: Clock) {
    this.#clock = clock;
  }

  async get(key: string): Promise<string | null> {
    this.commands.push(`GET ${key}`);
    this.#expireIfDue(key);
    return this.#values.get(key) ?? null;
  }

  async set(key: string, value: string, ...args: readonly (string | number)[]): Promise<string | null> {
    this.commands.push(['SET', key, ...args.map(String)].join(' '));
    this.#expireIfDue(key);
    const flags = args.map((arg) => String(arg).toUpperCase());

    if (flags.includes('NX') && this.#values.has(key)) return null;

    this.#values.set(key, value);
    const pxIndex = flags.indexOf('PX');
    if (pxIndex >= 0) {
      this.#expiries.set(key, this.#clock.now() + Number(args[pxIndex + 1]));
    } else if (!flags.includes('KEEPTTL')) {
      this.#expiries.delete(key);
    }
    return 'OK';
  }

  async del(...keys: readonly string[]): Promise<number> {
    this.commands.push(`DEL ${keys.join(' ')}`);
    let removed = 0;
    for (const key of keys) {
      if (this.#values.delete(key)) removed++;
      this.#expiries.delete(key);
    }
    return removed;
  }

  async exists(...keys: readonly string[]): Promise<number> {
    return keys.filter((key) => {
      this.#expireIfDue(key);
      return this.#values.has(key);
    }).length;
  }

  async incrby(key: string, increment: number): Promise<number> {
    this.commands.push(`INCRBY ${key} ${increment}`);
    this.#expireIfDue(key);
    const next = Number(this.#values.get(key) ?? '0') + increment;
    this.#values.set(key, String(next));
    return next;
  }

  async pexpire(key: string, milliseconds: number): Promise<number> {
    this.commands.push(`PEXPIRE ${key} ${milliseconds}`);
    if (!this.#values.has(key)) return 0;
    this.#expiries.set(key, this.#clock.now() + milliseconds);
    return 1;
  }

  async pttl(key: string): Promise<number> {
    this.#expireIfDue(key);
    if (!this.#values.has(key)) return -2;
    const expiry = this.#expiries.get(key);
    return expiry === undefined ? -1 : Math.max(0, expiry - this.#clock.now());
  }

  async scan(cursor: string, ...args: readonly (string | number)[]): Promise<[string, string[]]> {
    this.commands.push(['SCAN', cursor, ...args.map(String)].join(' '));
    const matchIndex = args.findIndex((arg) => String(arg).toUpperCase() === 'MATCH');
    const pattern = matchIndex >= 0 ? String(args[matchIndex + 1]) : '*';
    const regex = new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`);
    const keys = [...this.#values.keys()].filter((key) => regex.test(key));
    return ['0', keys];
  }

  raw(key: string): string | undefined {
    this.#expireIfDue(key);
    return this.#values.get(key);
  }

  get size(): number {
    return this.#values.size;
  }

  #expireIfDue(key: string): void {
    const expiry = this.#expiries.get(key);
    if (expiry !== undefined && this.#clock.now() >= expiry) {
      this.#values.delete(key);
      this.#expiries.delete(key);
    }
  }
}
