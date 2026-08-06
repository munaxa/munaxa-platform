import type { SecretsPort } from '@munaxa/interfaces';
import { PlatformError } from '@munaxa/types';

/**
 * Secrets from the process environment.
 *
 * The baseline every deployment already has. `require` throws a typed configuration error, which
 * is the behaviour you want at boot; the value itself never appears in the message.
 */
export class EnvSecrets implements SecretsPort {
  readonly #source: Readonly<Record<string, string | undefined>>;
  readonly #prefix: string;

  constructor(source: Readonly<Record<string, string | undefined>> = process.env, prefix = '') {
    this.#source = source;
    this.#prefix = prefix;
  }

  async get(name: string): Promise<string | undefined> {
    const value = this.#source[this.#prefix + name];
    return value === '' ? undefined : value;
  }

  async require(name: string): Promise<string> {
    const value = await this.get(name);
    if (value === undefined) {
      throw new PlatformError(`Missing required secret ${this.#prefix}${name}`, {
        code: 'CONFIG_INVALID',
        details: { secret: `${this.#prefix}${name}` },
      });
    }
    return value;
  }
}

/**
 * Caches another provider's answers.
 *
 * A managed secret store charges per call and rate limits; resolving the JWT signing secret on
 * every token issue would be both slow and expensive. `invalidate()` is what an external rotation
 * webhook calls to drop the cached copy without a restart.
 */
export class CachingSecrets implements SecretsPort {
  readonly #inner: SecretsPort;
  readonly #ttl: number;
  readonly #now: () => number;
  readonly #cache = new Map<string, { value: string | undefined; expiresAt: number }>();

  constructor(inner: SecretsPort, ttlMs = 300_000, now: () => number = Date.now) {
    this.#inner = inner;
    this.#ttl = ttlMs;
    this.#now = now;
  }

  async get(name: string): Promise<string | undefined> {
    const cached = this.#cache.get(name);
    if (cached && this.#now() < cached.expiresAt) return cached.value;

    const value = await this.#inner.get(name);
    this.#cache.set(name, { value, expiresAt: this.#now() + this.#ttl });
    return value;
  }

  async require(name: string): Promise<string> {
    const value = await this.get(name);
    if (value === undefined) {
      throw new PlatformError(`Missing required secret ${name}`, {
        code: 'CONFIG_INVALID',
        details: { secret: name },
      });
    }
    return value;
  }

  async invalidate(name?: string): Promise<void> {
    if (name === undefined) this.#cache.clear();
    else this.#cache.delete(name);
    await this.#inner.invalidate?.(name);
  }
}

/** Secrets held in memory. For tests, and for wiring a provider a product already resolved. */
export class StaticSecrets implements SecretsPort {
  readonly #values: Map<string, string>;

  constructor(values: Readonly<Record<string, string>> = {}) {
    this.#values = new Map(Object.entries(values));
  }

  set(name: string, value: string): this {
    this.#values.set(name, value);
    return this;
  }

  async get(name: string): Promise<string | undefined> {
    return this.#values.get(name);
  }

  async require(name: string): Promise<string> {
    const value = this.#values.get(name);
    if (value === undefined) {
      throw new PlatformError(`Missing required secret ${name}`, { code: 'CONFIG_INVALID' });
    }
    return value;
  }

  /**
   * A no-op, deliberately. `invalidate` means "drop anything you have cached", and a static
   * provider caches nothing — it *is* the source. Deleting the values here would make a caching
   * wrapper's invalidation erase the store underneath it.
   */
  async invalidate(): Promise<void> {}

  /** Remove a value. For tests that need to simulate a secret disappearing. */
  delete(name: string): boolean {
    return this.#values.delete(name);
  }
}

/**
 * Wraps a secret so it cannot be logged by accident.
 *
 * `console.log(secret)`, string interpolation and `JSON.stringify` all produce `[redacted]`;
 * only an explicit `.reveal()` yields the value. It is not a security boundary — anyone with
 * code execution can call `reveal()` — it is a defence against the accident that actually
 * happens, which is a secret ending up in a log aggregator forever.
 */
export class Secret {
  readonly #value: string;

  constructor(value: string) {
    this.#value = value;
  }

  reveal(): string {
    return this.#value;
  }

  toString(): string {
    return '[redacted]';
  }

  toJSON(): string {
    return '[redacted]';
  }

  /** `console.log` goes through util.inspect, which ignores `toString`. Cover it explicitly. */
  [Symbol.for('nodejs.util.inspect.custom')](): string {
    return 'Secret([redacted])';
  }

  get [Symbol.toStringTag](): string {
    return 'Secret';
  }
}
