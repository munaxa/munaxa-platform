import { describe, expect, it } from 'vitest';
import { ROOT_TENANT_ID, isPlatformError, toTenantId } from '@munaxa/types';
import {
  CachingSecrets,
  EnvSecrets,
  FeatureFlags,
  LayeredConfig,
  Secret,
  StaticSecrets,
  TenantRegistry,
  boolean,
  bucketOf,
  duration,
  integer,
  list,
  oneOf,
  parseConfig,
  port,
  redactConfig,
  secret,
  string,
  url,
} from '../src/index.js';

describe('schema parsing', () => {
  const schema = {
    NAME: string(),
    PORT: port({ default: 3000 }),
    DEBUG: boolean({ default: false }),
    TIMEOUT: duration({ default: 15_000 }),
    MODE: oneOf(['a', 'b'] as const, { default: 'a' }),
    ORIGINS: list({ default: [] }),
    ENDPOINT: url({ default: 'https://example.com/' }),
    API_SECRET: secret(),
  };

  const valid = {
    NAME: 'service',
    PORT: '8080',
    DEBUG: 'yes',
    TIMEOUT: '30s',
    MODE: 'b',
    ORIGINS: 'https://a.test, https://b.test',
    ENDPOINT: 'https://api.test/v1',
    API_SECRET: 'x'.repeat(32),
  };

  it('produces typed values', () => {
    const config = parseConfig(schema, valid);
    expect(config.PORT).toBe(8080);
    expect(config.DEBUG).toBe(true);
    expect(config.TIMEOUT).toBe(30_000);
    expect(config.MODE).toBe('b');
    expect(config.ORIGINS).toEqual(['https://a.test', 'https://b.test']);
    expect(config.ENDPOINT).toBe('https://api.test/v1');
  });

  it('applies defaults for absent optional fields', () => {
    const config = parseConfig(schema, { NAME: 'service', API_SECRET: 'y'.repeat(32) });
    expect(config.PORT).toBe(3000);
    expect(config.MODE).toBe('a');
  });

  it('treats an empty string as absent', () => {
    const config = parseConfig(schema, { NAME: 'service', API_SECRET: 'y'.repeat(32), PORT: '' });
    expect(config.PORT).toBe(3000);
  });

  it('reports every problem at once', () => {
    try {
      parseConfig(schema, { PORT: 'eighty', MODE: 'c', TIMEOUT: '3600' });
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(isPlatformError(error)).toBe(true);
      const message = (error as Error).message;
      expect(message).toContain('NAME');
      expect(message).toContain('PORT');
      expect(message).toContain('MODE');
      expect(message).toContain('TIMEOUT');
      expect(message).toContain('API_SECRET');
    }
  });

  it.each([
    ['port below range', { PORT: '0' }],
    ['port above range', { PORT: '70000' }],
    ['ambiguous boolean', { DEBUG: 'maybe' }],
    ['http url when https required', { ENDPOINT: 'http://api.test' }],
    ['relative url', { ENDPOINT: '/v1' }],
    ['short secret', { API_SECRET: 'short' }],
  ])('rejects %s', (_label, overrides) => {
    expect(() => parseConfig(schema, { ...valid, ...overrides })).toThrow(/Invalid configuration/);
  });

  it('accepts every documented boolean spelling', () => {
    for (const raw of ['true', 'TRUE', '1', 'yes', 'on']) {
      expect(parseConfig({ B: boolean() }, { B: raw }).B).toBe(true);
    }
    for (const raw of ['false', 'FALSE', '0', 'no', 'off']) {
      expect(parseConfig({ B: boolean() }, { B: raw }).B).toBe(false);
    }
  });

  it('enforces integer bounds', () => {
    expect(() => parseConfig({ N: integer({ min: 5 }) }, { N: '4' })).toThrow();
    expect(parseConfig({ N: integer({ min: 5 }) }, { N: '5' }).N).toBe(5);
    expect(() => parseConfig({ N: integer() }, { N: '1.5' })).toThrow();
  });
});

describe('secrets', () => {
  it('reads from an environment-shaped source', async () => {
    const secrets = new EnvSecrets({ APP_TOKEN: 'value', EMPTY: '' }, '');
    expect(await secrets.get('APP_TOKEN')).toBe('value');
    expect(await secrets.get('EMPTY')).toBeUndefined();
    await expect(secrets.require('MISSING')).rejects.toThrow(/Missing required secret/);
  });

  it('applies a prefix', async () => {
    const secrets = new EnvSecrets({ MUNAXA_TOKEN: 'v' }, 'MUNAXA_');
    expect(await secrets.get('TOKEN')).toBe('v');
  });

  it('caches and can be invalidated after an external rotation', async () => {
    const inner = new StaticSecrets({ KEY: 'old' });
    const now = 0;
    const caching = new CachingSecrets(inner, 1_000, () => now);

    expect(await caching.get('KEY')).toBe('old');
    inner.set('KEY', 'new');
    expect(await caching.get('KEY')).toBe('old');

    await caching.invalidate('KEY');
    expect(await caching.get('KEY')).toBe('new');
  });

  it('expires cached secrets on time', async () => {
    const inner = new StaticSecrets({ KEY: 'old' });
    let now = 0;
    const caching = new CachingSecrets(inner, 1_000, () => now);
    await caching.get('KEY');
    inner.set('KEY', 'new');

    now = 1_001;
    expect(await caching.get('KEY')).toBe('new');
  });
});

describe('Secret wrapper', () => {
  it('hides the value everywhere except reveal()', () => {
    const value = new Secret('super-secret-token');
    expect(value.reveal()).toBe('super-secret-token');
    expect(String(value)).toBe('[redacted]');
    expect(`${String(value)}`).toBe('[redacted]');
    expect(JSON.stringify({ token: value })).toBe('{"token":"[redacted]"}');
  });
});

describe('feature flags', () => {
  it('is off for an unknown flag', async () => {
    await expect(new FeatureFlags().isEnabled('typo')).resolves.toBe(false);
  });

  it('honours explicit on and off', async () => {
    const flags = new FeatureFlags({ a: true, b: false });
    expect(await flags.isEnabled('a')).toBe(true);
    expect(await flags.isEnabled('b')).toBe(false);
  });

  it('force-enables listed tenants and users', async () => {
    const flags = new FeatureFlags({
      passkeys: { tenants: [toTenantId('acme')], users: ['u-internal'] },
    });
    expect(await flags.isEnabled('passkeys', { tenantId: toTenantId('acme') })).toBe(true);
    expect(await flags.isEnabled('passkeys', { tenantId: toTenantId('globex') })).toBe(false);
    expect(await flags.isEnabled('passkeys', { userId: 'u-internal' })).toBe(true);
  });

  it('buckets a subject stably', () => {
    const first = bucketOf('flag', 'user-1');
    expect(bucketOf('flag', 'user-1')).toBe(first);
    expect(bucketOf('other-flag', 'user-1')).not.toBe(first);
  });

  it('rolls out to approximately the requested share', async () => {
    const flags = new FeatureFlags({ rollout: { rolloutPercentage: 25 } });
    let enabled = 0;
    for (let i = 0; i < 4_000; i++) {
      if (await flags.isEnabled('rollout', { userId: `user-${i}` })) enabled++;
    }
    expect(enabled / 4_000).toBeGreaterThan(0.22);
    expect(enabled / 4_000).toBeLessThan(0.28);
  });

  it('requires all declared attributes to match', async () => {
    const flags = new FeatureFlags({ beta: { enabled: true, attributes: { plan: 'enterprise' } } });
    expect(await flags.isEnabled('beta', { attributes: { plan: 'enterprise' } })).toBe(true);
    expect(await flags.isEnabled('beta', { attributes: { plan: 'free' } })).toBe(false);
    expect(await flags.isEnabled('beta')).toBe(false);
  });

  it('returns a variant only when the flag is on', async () => {
    const flags = new FeatureFlags({
      theme: { enabled: true, variant: 'dark' },
      off: { variant: 'x' },
    });
    expect(await flags.variant('theme')).toBe('dark');
    expect(await flags.variant('off')).toBeUndefined();
  });
});

describe('layered configuration', () => {
  const acme = toTenantId('acme');

  it('resolves tenant over application over default', () => {
    const config = new LayeredConfig(
      { 'session.idleTimeout': 900_000 },
      { 'session.idleTimeout': 1_800_000 },
    );
    expect(config.resolve(ROOT_TENANT_ID, 'session.idleTimeout')).toBe(1_800_000);

    config.setTenantValue(acme, 'session.idleTimeout', 300_000);
    expect(config.resolve(acme, 'session.idleTimeout')).toBe(300_000);
    expect(config.resolve(ROOT_TENANT_ID, 'session.idleTimeout')).toBe(1_800_000);
  });

  it('reports where a value came from', () => {
    const config = new LayeredConfig({ a: 1 }, { b: 2 });
    config.setTenantValue(acme, 'c', 3);
    expect(config.originOf(acme, 'a')).toBe('default');
    expect(config.originOf(acme, 'b')).toBe('application');
    expect(config.originOf(acme, 'c')).toBe('tenant');
    expect(config.originOf(acme, 'd')).toBe('unset');
  });

  it('merges every layer in getAll', async () => {
    const config = new LayeredConfig({ a: 1, b: 1 }, { b: 2 });
    config.setTenantValue(acme, 'c', 3);
    expect(await config.getAll(acme)).toEqual({ a: 1, b: 2, c: 3 });
  });
});

describe('tenant registry', () => {
  it('always knows the root tenant', () => {
    expect(new TenantRegistry().isActive(ROOT_TENANT_ID)).toBe(true);
  });

  it('reports a suspended tenant as inactive', () => {
    const registry = new TenantRegistry([
      { id: toTenantId('acme'), isolationMode: 'shared', status: 'suspended' },
    ]);
    expect(registry.isActive(toTenantId('acme'))).toBe(false);
    expect(registry.isActive(toTenantId('unknown'))).toBe(false);
  });
});

describe('redaction', () => {
  it('replaces secret values and keeps the rest', () => {
    const schema = { NAME: string(), API_SECRET: secret() };
    const config = parseConfig(schema, { NAME: 'svc', API_SECRET: 'z'.repeat(32) });
    expect(redactConfig(schema, config)).toEqual({ NAME: 'svc', API_SECRET: '[redacted]' });
  });
});
