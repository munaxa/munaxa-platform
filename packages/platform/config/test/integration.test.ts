import { describe, expect, it } from 'vitest';
import { ROOT_TENANT_ID, toTenantId } from '@munaxa/types';
import {
  FeatureFlags,
  LayeredConfig,
  PLATFORM_SCHEMA,
  StaticSecrets,
  TENANT_OVERRIDABLE,
  TenantRegistry,
  isTenantOverridable,
  parseConfig,
  redactConfig,
} from '../src/index.js';

const MINIMUM_ENV = {
  MUNAXA_SIGNING_SECRET: 's'.repeat(48),
  MUNAXA_ENCRYPTION_KEY: 'e'.repeat(43),
};

/**
 * A boot rehearsal. This is the sequence every product runs at startup: parse the environment,
 * build the layered config from it, resolve per-tenant settings, and hand the result to the
 * platform services.
 */
describe('platform boot', () => {
  it('starts with nothing but the two required secrets, on secure defaults', () => {
    const config = parseConfig(PLATFORM_SCHEMA, MINIMUM_ENV);

    expect(config.MUNAXA_PASSWORD_MIN_LENGTH).toBe(12);
    expect(config.MUNAXA_PASSWORD_BREACH_CHECK).toBe(true);
    expect(config.MUNAXA_SESSION_IDLE_TIMEOUT).toBe(900_000);
    expect(config.MUNAXA_AUDIT_ENABLED).toBe(true);
    expect(config.MUNAXA_ENV).toBe('production');
  });

  it('refuses to start without the signing secret', () => {
    expect(() => parseConfig(PLATFORM_SCHEMA, { MUNAXA_ENCRYPTION_KEY: 'e'.repeat(43) })).toThrow(
      /MUNAXA_SIGNING_SECRET/,
    );
  });

  it('refuses a signing secret short enough to brute force', () => {
    expect(() =>
      parseConfig(PLATFORM_SCHEMA, { ...MINIMUM_ENV, MUNAXA_SIGNING_SECRET: 'hunter2' }),
    ).toThrow(/MUNAXA_SIGNING_SECRET/);
  });

  it('feeds parsed values into the layered config a tenant can tighten', () => {
    const parsed = parseConfig(PLATFORM_SCHEMA, MINIMUM_ENV);
    const config = new LayeredConfig(
      {
        'session.idleTimeout': parsed.MUNAXA_SESSION_IDLE_TIMEOUT,
        'password.minLength': parsed.MUNAXA_PASSWORD_MIN_LENGTH,
        'mfa.required': parsed.MUNAXA_MFA_REQUIRED,
      },
      {},
    );

    const bank = toTenantId('bank');
    config.setTenantValue(bank, 'session.idleTimeout', 300_000);
    config.setTenantValue(bank, 'mfa.required', true);

    expect(config.resolve(bank, 'session.idleTimeout')).toBe(300_000);
    expect(config.resolve(bank, 'mfa.required')).toBe(true);
    expect(config.resolve(ROOT_TENANT_ID, 'session.idleTimeout')).toBe(900_000);
    expect(config.resolve(ROOT_TENANT_ID, 'mfa.required')).toBe(false);
  });

  it('keeps platform-wide controls off the tenant-overridable list', () => {
    // A tenant tightening its own policy is the point; a tenant disabling audit is not.
    for (const key of ['audit.enabled', 'crypto.algorithm', 'session.storeBackend']) {
      expect(isTenantOverridable(key), key).toBe(false);
    }
    for (const key of TENANT_OVERRIDABLE) {
      expect(isTenantOverridable(key), key).toBe(true);
    }
  });
});

describe('flags driving platform behaviour', () => {
  it('enables a capability for one tenant while the rest stay off', async () => {
    const registry = new TenantRegistry([
      { id: toTenantId('acme'), isolationMode: 'shared', status: 'active' },
      { id: toTenantId('globex'), isolationMode: 'shared', status: 'active' },
    ]);
    const flags = new FeatureFlags({ 'auth.passkeys': { tenants: [toTenantId('acme')] } });

    const enabledFor: string[] = [];
    for (const tenant of registry.list()) {
      if (await flags.isEnabled('auth.passkeys', { tenantId: tenant.id })) enabledFor.push(tenant.id);
    }

    expect(enabledFor).toEqual([toTenantId('acme')]);
  });
});

describe('operational rendering', () => {
  it('produces a startup summary with no secret in it', () => {
    const config = parseConfig(PLATFORM_SCHEMA, {
      ...MINIMUM_ENV,
      MUNAXA_SIGNING_SECRET: 'very-distinctive-signing-secret-value-123456',
    });
    const rendered = JSON.stringify(redactConfig(PLATFORM_SCHEMA, config));

    expect(rendered).not.toContain('very-distinctive');
    expect(rendered).toContain('[redacted]');
    expect(rendered).toContain('"MUNAXA_SESSION_IDLE_TIMEOUT":900000');
  });

  it('resolves secrets through the port the platform is wired with', async () => {
    const secrets = new StaticSecrets({ MUNAXA_SIGNING_SECRET: 's'.repeat(48) });
    await expect(secrets.require('MUNAXA_SIGNING_SECRET')).resolves.toHaveLength(48);
    await expect(secrets.require('ABSENT')).rejects.toThrow(/Missing required secret/);
  });
});
