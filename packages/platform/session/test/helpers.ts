import { FixedClock, ROOT_TENANT_ID, unsafeId, type UserId } from '@munaxa/types';
import {
  DeviceService,
  MemoryDeviceRegistry,
  MemorySessionStore,
  SessionManager,
  type CreateSessionInput,
  type SessionEvent,
  type SessionPolicy,
} from '../src/index.js';

export const USER = unsafeId<UserId>('u1');
export const START = 1_700_000_000_000;

export function fixture(policy: Partial<SessionPolicy> = {}) {
  const clock = new FixedClock(START);
  const store = new MemorySessionStore();
  const events: SessionEvent[] = [];
  const manager = new SessionManager({
    store,
    clock,
    policy,
    onEvent: (event) => void events.push(event),
  });

  const registry = new MemoryDeviceRegistry();
  const devices = new DeviceService({ registry, clock });

  return { clock, store, manager, events, registry, devices };
}

export function createInput(overrides: Partial<CreateSessionInput> = {}): CreateSessionInput {
  return {
    tenantId: ROOT_TENANT_ID,
    userId: USER,
    authMethods: ['password'],
    mfaSatisfied: false,
    tokenVersion: 1,
    ipAddress: '198.51.100.10',
    userAgent: 'Mozilla/5.0',
    ...overrides,
  };
}
