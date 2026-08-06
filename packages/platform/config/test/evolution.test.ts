import { describe, expect, it } from 'vitest';
import type { PlatformError } from '@munaxa/types';
import {
  boolean,
  defineConfig,
  extendConfig,
  duration,
  fromMilliseconds,
  fromSeconds,
  integer,
  nestConfig,
  oneOf,
  parseConfig,
  redactConfig,
  remapSchema,
  secret,
  string,
  PLATFORM_SCHEMA,
} from '../src/index.js';

/** The two secrets PLATFORM_SCHEMA requires, so each test states only what it is about. */
const REQUIRED = {
  MUNAXA_SIGNING_SECRET: 's'.repeat(32),
  MUNAXA_ENCRYPTION_KEY: 'e'.repeat(32),
};

/**
 * P-4: a product with existing deployments has to be able to adopt the platform schema without
 * renaming every environment variable, flattening every consumer, or moving its cross-field rules
 * out of the schema. These tests are that contract.
 */

describe('environment aliases', () => {
  const schema = {
    MUNAXA_LOG_LEVEL: oneOf(['debug', 'info', 'warn'] as const, {
      default: 'info',
      env: 'LOG_LEVEL',
    }),
    MUNAXA_DB_URL: string({ env: ['DATABASE_URL', 'POSTGRES_URL'] }),
  };

  it('reads a field from its alias when the canonical name is absent', () => {
    const resolved = parseConfig(schema, { LOG_LEVEL: 'warn', DATABASE_URL: 'postgres://x' });
    expect(resolved.MUNAXA_LOG_LEVEL).toBe('warn');
    expect(resolved.MUNAXA_DB_URL).toBe('postgres://x');
  });

  it('prefers the canonical name over an alias', () => {
    // A deployment mid-migration sets both. The platform name is the one being migrated *to*, so
    // it has to win, or the rename never actually takes effect.
    const resolved = parseConfig(schema, {
      MUNAXA_LOG_LEVEL: 'debug',
      LOG_LEVEL: 'warn',
      DATABASE_URL: 'postgres://x',
    });
    expect(resolved.MUNAXA_LOG_LEVEL).toBe('debug');
  });

  it('tries aliases in order and skips an empty one', () => {
    // A Helm value that renders to `DATABASE_URL=` is not set, and must fall through rather than
    // fail as an empty required string.
    const resolved = parseConfig(schema, { DATABASE_URL: '', POSTGRES_URL: 'postgres://y' });
    expect(resolved.MUNAXA_DB_URL).toBe('postgres://y');
  });

  it('names every accepted variable when a required field is missing', () => {
    expect(() => parseConfig(schema, {})).toThrow(
      /MUNAXA_DB_URL or DATABASE_URL or POSTGRES_URL/,
    );
  });

  it('says which name held the bad value', () => {
    expect(() => parseConfig(schema, { LOG_LEVEL: 'shout', DATABASE_URL: 'x' })).toThrow(
      /from LOG_LEVEL/,
    );
  });

  it('adds aliases to a schema the product does not own', () => {
    // The point of `remapSchema`: adopt PLATFORM_SCHEMA without forking it, so fields the platform
    // adds later still arrive.
    const remapped = remapSchema(PLATFORM_SCHEMA, {
      MUNAXA_ENV: { env: 'NODE_ENV' },
      MUNAXA_LOG_LEVEL: { env: 'LOG_LEVEL' },
    });
    const resolved = parseConfig(remapped, { ...REQUIRED, NODE_ENV: 'production', LOG_LEVEL: 'warn' });
    expect(resolved.MUNAXA_ENV).toBe('production');
    expect(resolved.MUNAXA_LOG_LEVEL).toBe('warn');
    // Untouched fields keep their platform definition, defaults included.
    expect(resolved.MUNAXA_SESSION_IDLE_TIMEOUT).toBe(PLATFORM_SCHEMA.MUNAXA_SESSION_IDLE_TIMEOUT.defaultValue);
  });

  it('decodes a legacy encoding without renaming the variable', () => {
    // The gap this closes: an alias maps a name, and a name is not always the whole difference.
    // A deployment holding `JWT_ACCESS_TTL_SECONDS=900` cannot feed a duration field — `900` is
    // not `15m` — so without this the product is back to renaming a variable everywhere.
    const remapped = remapSchema(PLATFORM_SCHEMA, {
      MUNAXA_ACCESS_TOKEN_TTL: { env: fromSeconds('JWT_ACCESS_TTL_SECONDS') },
      MUNAXA_REFRESH_TOKEN_TTL: { env: fromSeconds('JWT_REFRESH_TTL_SECONDS') },
    });
    const resolved = parseConfig(remapped, {
      ...REQUIRED,
      JWT_ACCESS_TTL_SECONDS: '900',
      JWT_REFRESH_TTL_SECONDS: '2592000',
    });
    expect(resolved.MUNAXA_ACCESS_TOKEN_TTL).toBe(900_000);
    expect(resolved.MUNAXA_REFRESH_TOKEN_TTL).toBe(2_592_000_000);
  });

  it('leaves the canonical name alone when an alias declares a decoder', () => {
    // The transform belongs to the source, not the field: a deployment already using the platform
    // name writes a platform duration, and must not have seconds semantics applied to it.
    const remapped = remapSchema(PLATFORM_SCHEMA, {
      MUNAXA_ACCESS_TOKEN_TTL: { env: fromSeconds('JWT_ACCESS_TTL_SECONDS') },
    });
    const resolved = parseConfig(remapped, { ...REQUIRED, MUNAXA_ACCESS_TOKEN_TTL: '15m' });
    expect(resolved.MUNAXA_ACCESS_TOKEN_TTL).toBe(900_000);
  });

  it('reports a bad legacy value against the variable the operator actually set', () => {
    const remapped = remapSchema(PLATFORM_SCHEMA, {
      MUNAXA_ACCESS_TOKEN_TTL: { env: fromSeconds('JWT_ACCESS_TTL_SECONDS') },
    });
    expect(() =>
      parseConfig(remapped, { ...REQUIRED, JWT_ACCESS_TTL_SECONDS: '15m' }),
    ).toThrow(/JWT_ACCESS_TTL_SECONDS: expected whole seconds/);
  });

  it('collects a decode failure alongside other problems', () => {
    // A throwing decoder must not abort the run on the first bad variable — the whole point of
    // this schema is that a deployment learns everything in one restart.
    const remapped = remapSchema(PLATFORM_SCHEMA, {
      MUNAXA_ACCESS_TOKEN_TTL: { env: fromSeconds('JWT_ACCESS_TTL_SECONDS') },
      MUNAXA_LOG_LEVEL: { env: 'LOG_LEVEL' },
    });
    try {
      parseConfig(remapped, { ...REQUIRED, JWT_ACCESS_TTL_SECONDS: 'soon', LOG_LEVEL: 'shout' });
      expect.unreachable('should have thrown');
    } catch (error) {
      const message = (error as PlatformError).message;
      expect(message).toMatch(/JWT_ACCESS_TTL_SECONDS/);
      expect(message).toMatch(/LOG_LEVEL/);
    }
  });

  it('supports milliseconds too, and mixed notations in one list', () => {
    const schema = {
      TIMEOUT: duration({ default: 1_000, env: [fromMilliseconds('LEGACY_TIMEOUT_MS'), 'TIMEOUT_2'] }),
    };
    expect(parseConfig(schema, { LEGACY_TIMEOUT_MS: '250' }).TIMEOUT).toBe(250);
    expect(parseConfig(schema, { TIMEOUT_2: '2s' }).TIMEOUT).toBe(2_000);
  });

  it('refuses to remap a field that does not exist', () => {
    // Otherwise a typo is invisible: the field keeps its original name and the deployment fails on
    // a variable the operator believes they set.
    expect(() => remapSchema(PLATFORM_SCHEMA, { MUNAXA_TYPO: { env: 'X' } })).toThrow(
      /no such field: MUNAXA_TYPO/,
    );
  });
});

describe('nested output', () => {
  const schema = {
    APP_NAME: string({ path: 'app.name' }),
    APP_PORT: integer({ default: 3000, path: 'app.port' }),
    ACL_TTL: integer({ default: 60, path: 'acl.cacheTtlSeconds' }),
    ENV: string({ default: 'development' }),
  };

  it('builds the shape the application already reads', () => {
    const resolved = parseConfig(schema, { APP_NAME: 'docs' });
    expect(nestConfig(schema, resolved)).toEqual({
      app: { name: 'docs', port: 3000 },
      acl: { cacheTtlSeconds: 60 },
      ENV: 'development',
    });
  });

  it('refuses a path that would pollute the prototype', () => {
    const unsafe = { EVIL: string({ default: 'x', path: '__proto__.polluted' }) };
    expect(() => nestConfig(unsafe, parseConfig(unsafe, {}))).toThrow(/unsafe path segment/);
  });

  it('refuses two fields whose paths disagree', () => {
    // `a.b` and `a.b.c` cannot both exist; letting one win produces a config object silently
    // missing a value.
    const conflicting = {
      A: string({ default: 'x', path: 'a.b' }),
      B: string({ default: 'y', path: 'a.b.c' }),
    };
    expect(() => nestConfig(conflicting, parseConfig(conflicting, {}))).toThrow(/path conflict/);
  });
});

describe('cross-field refinement', () => {
  const schema = defineConfig(
    {
      PROFILE: oneOf(['local', 'hosted'] as const, { default: 'local' }),
      TENANT_CATALOGUE_URL: string({ default: '' }),
      TENANT_CATALOGUE_FILE: string({ default: '' }),
      SIGNING_KEY: secret({ default: 'x'.repeat(32) }),
    },
    {
      refine: [
        (config) =>
          config.PROFILE === 'hosted' && config.TENANT_CATALOGUE_URL === ''
            ? { key: 'TENANT_CATALOGUE_URL', problem: 'required when PROFILE is hosted' }
            : undefined,
        (config) =>
          config.TENANT_CATALOGUE_URL !== '' && config.TENANT_CATALOGUE_FILE !== ''
            ? { key: 'TENANT_CATALOGUE_FILE', problem: 'mutually exclusive with the URL source' }
            : undefined,
      ],
    },
  );

  it('accepts a configuration that satisfies every rule', () => {
    const resolved = parseConfig(schema, { PROFILE: 'hosted', TENANT_CATALOGUE_URL: 'https://x' });
    expect(resolved.PROFILE).toBe('hosted');
  });

  it('fails on a rule spanning two fields', () => {
    expect(() => parseConfig(schema, { PROFILE: 'hosted' })).toThrow(
      /required when PROFILE is hosted/,
    );
  });

  it('reports every broken rule at once', () => {
    try {
      parseConfig(schema, {
        PROFILE: 'local',
        TENANT_CATALOGUE_URL: 'https://x',
        TENANT_CATALOGUE_FILE: '/tmp/t.json',
      });
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as PlatformError).message).toMatch(/mutually exclusive/);
    }
  });

  it('does not run refinements when a field failed to parse', () => {
    // A rule reading a field that never parsed would report a second, misleading problem for the
    // same cause — and the operator would chase the wrong one.
    const strict = defineConfig(
      { COUNT: integer(), OTHER: string({ default: 'x' }) },
      { refine: () => ({ key: 'OTHER', problem: 'should not be reported' }) },
    );
    expect(() => parseConfig(strict, { COUNT: 'nope' })).toThrow(/expected an integer/);
    expect(() => parseConfig(strict, { COUNT: 'nope' })).not.toThrow(/should not be reported/);
  });
});

describe('application extension schemas', () => {
  it('parses platform and product fields in one pass', () => {
    const schema = extendConfig(PLATFORM_SCHEMA, {
      DOCS_STORAGE_BUCKET: string(),
      DOCS_OCR_ENABLED: boolean({ default: false }),
    });

    const resolved = parseConfig(schema, {
      ...REQUIRED,
      MUNAXA_ENV: 'production',
      DOCS_STORAGE_BUCKET: 'docs-prod',
    });

    expect(resolved.MUNAXA_ENV).toBe('production');
    expect(resolved.DOCS_STORAGE_BUCKET).toBe('docs-prod');
    expect(resolved.DOCS_OCR_ENABLED).toBe(false);
  });

  it('reports platform and product problems together', () => {
    const schema = extendConfig(PLATFORM_SCHEMA, { DOCS_STORAGE_BUCKET: string() });
    try {
      parseConfig(schema, { MUNAXA_LOG_LEVEL: 'shout' });
      expect.unreachable('should have thrown');
    } catch (error) {
      const message = (error as PlatformError).message;
      expect(message).toMatch(/MUNAXA_LOG_LEVEL/);
      expect(message).toMatch(/DOCS_STORAGE_BUCKET/);
    }
  });

  it('refuses to let a product redefine a platform field', () => {
    // The failure this prevents: a product overriding the platform's definition of a session
    // timeout or a password policy, so a security setting quietly stops meaning what the platform
    // documents it to mean.
    expect(() =>
      extendConfig(PLATFORM_SCHEMA, { MUNAXA_SESSION_IDLE_TIMEOUT: string({ default: 'forever' }) }),
    ).toThrow(/cannot redefine platform fields: MUNAXA_SESSION_IDLE_TIMEOUT/);
  });

  it('keeps the base schema refinements when extended', () => {
    // Extending must not be a way to drop the platform's own rules.
    const base = defineConfig(
      { A: string({ default: 'a' }) },
      { refine: () => ({ key: 'A', problem: 'base rule' }) },
    );
    const extended = extendConfig(base, { B: string({ default: 'b' }) });
    expect(() => parseConfig(extended, {})).toThrow(/base rule/);
  });

  it('still redacts secrets across the extended schema', () => {
    const schema = extendConfig(PLATFORM_SCHEMA, { DOCS_API_KEY: secret({ default: 'k'.repeat(32) }) });
    const rendered = redactConfig(schema, parseConfig(schema, REQUIRED));
    expect(rendered.DOCS_API_KEY).toBe('[redacted]');
  });
});

describe('backward compatibility', () => {
  it('accepts a bare field map exactly as before', () => {
    const schema = { NAME: string({ default: 'x' }) };
    expect(parseConfig(schema, {})).toEqual({ NAME: 'x' });
    expect(redactConfig(schema, parseConfig(schema, {}))).toEqual({ NAME: 'x' });
  });

  it('leaves PLATFORM_SCHEMA parsing unchanged', () => {
    const resolved = parseConfig(PLATFORM_SCHEMA, REQUIRED);
    expect(resolved.MUNAXA_ENV).toBe(PLATFORM_SCHEMA.MUNAXA_ENV.defaultValue);
  });
});
