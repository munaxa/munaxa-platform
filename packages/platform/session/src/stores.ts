import type {
  DeviceRecord,
  DeviceRegistryPort,
  SessionRecord,
  SessionStorePort,
} from '@munaxa/interfaces';
import {
  assertSameTenant,
  type DeviceId,
  type SessionId,
  type TenantId,
  type UserId,
} from '@munaxa/types';

/**
 * In-memory session and device stores.
 *
 * Reference implementations, and the right choice for a single-process deployment or a test.
 * Note what both do on every read: assert the tenant. A store that looks a session up by id alone
 * will happily return another tenant's session to a caller that guessed an id, and session ids
 * appear in cookies, logs and support tickets.
 */
export class MemorySessionStore implements SessionStorePort {
  readonly #sessions = new Map<SessionId, SessionRecord>();

  async create(session: SessionRecord): Promise<void> {
    this.#sessions.set(session.id, session);
  }

  async get(tenantId: TenantId, sessionId: SessionId): Promise<SessionRecord | undefined> {
    const session = this.#sessions.get(sessionId);
    if (!session) return undefined;
    // Returning undefined rather than throwing: a mismatched tenant is indistinguishable from a
    // missing session to the caller, which is exactly what an id-guessing attacker should see.
    return session.tenantId === tenantId ? session : undefined;
  }

  async listByUser(tenantId: TenantId, userId: UserId): Promise<readonly SessionRecord[]> {
    return [...this.#sessions.values()].filter(
      (session) => session.tenantId === tenantId && session.userId === userId,
    );
  }

  async update(session: SessionRecord): Promise<void> {
    const existing = this.#sessions.get(session.id);
    if (existing) assertSameTenant(existing.tenantId, session.tenantId);
    this.#sessions.set(session.id, session);
  }

  async delete(tenantId: TenantId, sessionId: SessionId): Promise<boolean> {
    const session = this.#sessions.get(sessionId);
    if (!session || session.tenantId !== tenantId) return false;
    return this.#sessions.delete(sessionId);
  }

  async deleteExpired(tenantId: TenantId, now: number): Promise<number> {
    let removed = 0;
    for (const [id, session] of this.#sessions) {
      if (session.tenantId !== tenantId) continue;
      if (now >= session.absoluteExpiresAt || now >= session.idleExpiresAt) {
        this.#sessions.delete(id);
        removed++;
      }
    }
    return removed;
  }

  get size(): number {
    return this.#sessions.size;
  }
}

export class MemoryDeviceRegistry implements DeviceRegistryPort {
  readonly #devices = new Map<DeviceId, DeviceRecord>();

  async find(
    tenantId: TenantId,
    userId: UserId,
    fingerprint: string,
  ): Promise<DeviceRecord | undefined> {
    return [...this.#devices.values()].find(
      (device) =>
        device.tenantId === tenantId &&
        device.userId === userId &&
        device.fingerprint === fingerprint,
    );
  }

  async get(tenantId: TenantId, deviceId: DeviceId): Promise<DeviceRecord | undefined> {
    const device = this.#devices.get(deviceId);
    return device?.tenantId === tenantId ? device : undefined;
  }

  async list(tenantId: TenantId, userId: UserId): Promise<readonly DeviceRecord[]> {
    return [...this.#devices.values()].filter(
      (device) => device.tenantId === tenantId && device.userId === userId,
    );
  }

  async save(device: DeviceRecord): Promise<void> {
    // Upsert on the fingerprint, not only on the id: two concurrent first sightings of one device
    // must not become two records, or the user is asked to verify a device they just verified.
    const existing = [...this.#devices.values()].find(
      (candidate) =>
        candidate.tenantId === device.tenantId &&
        candidate.userId === device.userId &&
        candidate.fingerprint === device.fingerprint,
    );
    if (existing && existing.id !== device.id) this.#devices.delete(existing.id);
    this.#devices.set(device.id, device);
  }

  async touch(
    tenantId: TenantId,
    deviceId: DeviceId,
    at: number,
    ipAddress?: string,
  ): Promise<void> {
    // Only the two named fields. Writing the whole record here is what would let a request in
    // flight carry an old `trustedAt` over an untrust that had already landed.
    const device = this.#devices.get(deviceId);
    if (!device || device.tenantId !== tenantId) return;
    this.#devices.set(deviceId, {
      ...device,
      lastSeenAt: at,
      ...(ipAddress === undefined ? {} : { lastIpAddress: ipAddress }),
    });
  }

  async remove(tenantId: TenantId, deviceId: DeviceId): Promise<boolean> {
    const device = this.#devices.get(deviceId);
    if (!device || device.tenantId !== tenantId) return false;
    return this.#devices.delete(deviceId);
  }

  get size(): number {
    return this.#devices.size;
  }
}
