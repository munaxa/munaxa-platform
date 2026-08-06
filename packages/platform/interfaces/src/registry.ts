/**
 * A twenty-line typed service registry.
 *
 * The platform does not ship a DI container and does not require one: NestJS products bind these
 * ports with their own providers, and everything else can use this. What it buys over a plain
 * object is a compile-time link between a token and the type it resolves to, and a clear failure
 * when something is missing at wiring time rather than a `TypeError` at request time.
 */

declare const tokenType: unique symbol;

export interface ServiceToken<T> {
  readonly description: string;
  readonly [tokenType]?: T;
}

export function createToken<T>(description: string): ServiceToken<T> {
  return { description };
}

export class MissingDependencyError extends Error {
  constructor(readonly token: ServiceToken<unknown>) {
    super(
      `No provider registered for "${token.description}". Register it during composition — the platform never constructs infrastructure on your behalf.`,
    );
    this.name = 'MissingDependencyError';
  }
}

export class ServiceRegistry {
  readonly #instances = new Map<ServiceToken<unknown>, unknown>();
  readonly #factories = new Map<ServiceToken<unknown>, () => unknown>();

  register<T>(token: ServiceToken<T>, value: T): this {
    this.#instances.set(token, value);
    return this;
  }

  /** Lazily constructed, then memoised. Useful when a port is expensive and rarely used. */
  registerFactory<T>(token: ServiceToken<T>, factory: () => T): this {
    this.#factories.set(token, factory);
    return this;
  }

  get<T>(token: ServiceToken<T>): T {
    const resolved = this.tryGet(token);
    if (resolved === undefined) throw new MissingDependencyError(token);
    return resolved;
  }

  tryGet<T>(token: ServiceToken<T>): T | undefined {
    if (this.#instances.has(token)) return this.#instances.get(token) as T;
    const factory = this.#factories.get(token);
    if (!factory) return undefined;
    const value = factory() as T;
    this.#instances.set(token, value);
    return value;
  }

  has(token: ServiceToken<unknown>): boolean {
    return this.#instances.has(token) || this.#factories.has(token);
  }

  /** Fail fast at boot: name every port the application forgot to wire, not just the first. */
  assertRegistered(...tokens: readonly ServiceToken<unknown>[]): void {
    const missing = tokens.filter((token) => !this.has(token));
    if (missing.length > 0) {
      throw new Error(
        `Missing platform dependencies: ${missing.map((token) => token.description).join(', ')}`,
      );
    }
  }
}
