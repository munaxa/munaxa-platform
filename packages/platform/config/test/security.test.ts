import { inspect } from 'node:util';
import { describe, expect, it } from 'vitest';
import { isPlatformError, toTenantId } from '@munaxa/types';
import {
  FeatureFlags,
  LayeredConfig,
  PLATFORM_SCHEMA,
  Secret,
  parseConfig,
  redactConfig,
  secret,
  string,
} from '../src/index.js';

describe('secrets never reach a log', () => {
  it('keeps the rejected value out of the validation error', () => {
    try {
      parseConfig({ API_SECRET: secret() }, { API_SECRET: 'leaked-secret-value' });
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(isPlatformError(error)).toBe(true);
      const rendered = `${(error as Error).message}${JSON.stringify((error as { details: unknown }).details)}`;
      expect(rendered).not.toContain('leaked-secret-value');
      expect(rendered).toContain('API_SECRET');
    }
  });

  it('redacts secrets in every rendering path', () => {
    const wrapped = new Secret('super-secret');
    expect(inspect(wrapped)).not.toContain('super-secret');
    expect(inspect({ nested: { token: wrapped } })).not.toContain('super-secret');
    expect(JSON.stringify(wrapped)).not.toContain('super-secret');
    expect(`${String(wrapped)}`).not.toContain('super-secret');
  });

  it('redacts every field marked secret in the platform schema', () => {
    const config = parseConfig(PLATFORM_SCHEMA, {
      MUNAXA_SIGNING_SECRET: 'signing-'.repeat(6),
      MUNAXA_ENCRYPTION_KEY: 'encrypt-'.repeat(6),
    });
    const rendered = redactConfig(PLATFORM_SCHEMA, config);

    expect(rendered.MUNAXA_SIGNING_SECRET).toBe('[redacted]');
    expect(rendered.MUNAXA_ENCRYPTION_KEY).toBe('[redacted]');
    expect(JSON.stringify(rendered)).not.toContain('signing-');
  });
});

describe('defaults are the secure ones', () => {
  it('never lets a security floor be configured below the platform minimum', () => {
    // MUNAXA_PASSWORD_MIN_LENGTH has min: 12. Setting 8 is a startup failure, not a warning.
    expect(() =>
      parseConfig(PLATFORM_SCHEMA, {
        MUNAXA_SIGNING_SECRET: 's'.repeat(48),
        MUNAXA_ENCRYPTION_KEY: 'e'.repeat(43),
        MUNAXA_PASSWORD_MIN_LENGTH: '8',
      }),
    ).toThrow(/MUNAXA_PASSWORD_MIN_LENGTH/);
  });

  it('requires https for the CSP report endpoint', () => {
    expect(() =>
      parseConfig(PLATFORM_SCHEMA, {
        MUNAXA_SIGNING_SECRET: 's'.repeat(48),
        MUNAXA_ENCRYPTION_KEY: 'e'.repeat(43),
        MUNAXA_CSP_REPORT_URI: 'http://reports.test',
      }),
    ).toThrow(/MUNAXA_CSP_REPORT_URI/);
  });

  it('defaults an unknown flag to off', async () => {
    // The failure mode of a typo'd flag name must be "feature stays off", never "feature is on".
    const flags = new FeatureFlags({ 'auth.passkeys': true });
    expect(await flags.isEnabled('auth.passkey')).toBe(false);
    expect(await flags.isEnabled('')).toBe(false);
  });
});

describe('tenant configuration isolation', () => {
  it('does not leak one tenant’s override into another', async () => {
    const config = new LayeredConfig({ 'mfa.required': false });
    config.setTenantValue(toTenantId('bank'), 'mfa.required', true);

    expect(config.resolve(toTenantId('bank'), 'mfa.required')).toBe(true);
    expect(config.resolve(toTenantId('startup'), 'mfa.required')).toBe(false);
    expect(await config.getAll(toTenantId('startup'))).toEqual({ 'mfa.required': false });
  });

  it('does not let a prototype-polluting key reach the resolver', () => {
    const config = new LayeredConfig({ a: 1 });
    // A key sourced from tenant-controlled input must not resolve to Object.prototype members.
    expect(config.resolve(toTenantId('t'), '__proto__')).toBeUndefined();
    expect(config.resolve(toTenantId('t'), 'constructor')).toBeUndefined();
    expect(config.resolve(toTenantId('t'), 'toString')).toBeUndefined();
  });

  it('parses config from a source with a polluted prototype', () => {
    const hostile = Object.create({ INJECTED: 'value' }) as Record<string, string>;
    hostile.NAME = 'svc';
    // Only own properties are read; an inherited INJECTED must not satisfy a required field.
    expect(() => parseConfig({ NAME: string(), INJECTED: string() }, hostile)).toThrow(/INJECTED/);
  });
});
