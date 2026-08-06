import type { CachePort, LockAcquireOptions, LockHandle, LockPort } from '@munaxa/interfaces';
import { systemClock, type Clock, type DurationMs } from '@munaxa/types';
import { randomUUID } from 'node:crypto';

/**
 * A leased lock with a fencing token, built on `setIfAbsent`.
 *
 * Three properties, each of which is a bug when missing:
 *
 * - **Leased.** Every lock expires. A holder that crashes cannot deadlock the system.
 * - **Fenced.** Release and extend compare the token. A holder that stalls past its lease and
 *   wakes up later cannot release the lock a second holder now owns — the classic double-unlock.
 * - **Non-blocking by default.** `acquire` returns null immediately unless the caller asks to
 *   wait, so a contended path degrades to "someone else is doing it" rather than to a queue.
 *
 * This is not a distributed consensus lock. Under a Redis failover a lease can, in principle, be
 * held twice; use it to deduplicate work (one mailer, one rotation job), never as the only thing
 * standing between two writers and a corrupted invariant.
 */
export class CacheLock implements LockPort {
  readonly #cache: CachePort;
  readonly #clock: Clock;

  constructor(cache: CachePort, clock: Clock = systemClock) {
    this.#cache = cache;
    this.#clock = clock;
  }

  async acquire(
    key: string,
    lease: DurationMs,
    options: LockAcquireOptions = {},
  ): Promise<LockHandle | null> {
    const deadline = this.#clock.now() + (options.waitFor ?? 0);
    const retryInterval = options.retryInterval ?? 50;

    for (;;) {
      const token = randomUUID();
      const acquired = await this.#cache.setIfAbsent(key, token, { ttl: lease });
      if (acquired) {
        const acquiredAt = this.#clock.now();
        return { key, token, acquiredAt, expiresAt: acquiredAt + lease };
      }
      if (this.#clock.now() + retryInterval > deadline) return null;
      await sleep(retryInterval);
    }
  }

  async release(handle: LockHandle): Promise<boolean> {
    const current = await this.#cache.get<string>(handle.key);
    if (current !== handle.token) return false;
    return this.#cache.delete(handle.key);
  }

  async extend(handle: LockHandle, lease: DurationMs): Promise<boolean> {
    const current = await this.#cache.get<string>(handle.key);
    if (current !== handle.token) return false;
    await this.#cache.set(handle.key, handle.token, { ttl: lease });
    return true;
  }
}

/**
 * Run `work` while holding the lock, releasing it whatever happens.
 *
 * Returns `undefined` when the lock could not be taken — the caller decides whether that means
 * "skip" or "retry". A thrown error still releases.
 */
export async function withLock<T>(
  locks: LockPort,
  key: string,
  lease: DurationMs,
  work: (handle: LockHandle) => Promise<T>,
  options?: LockAcquireOptions,
): Promise<T | undefined> {
  const handle = await locks.acquire(key, lease, options);
  if (!handle) return undefined;
  try {
    return await work(handle);
  } finally {
    await locks.release(handle);
  }
}

function sleep(ms: DurationMs): Promise<void> {
  return new Promise((resolve) => {
    // `unref` keeps a waiting lock from holding a process — or a test run — open.
    const timer = setTimeout(resolve, ms);
    if (typeof timer === 'object' && 'unref' in timer) timer.unref();
  });
}
