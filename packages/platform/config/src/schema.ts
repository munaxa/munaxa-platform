import { PlatformError, parseDuration, type DurationMs } from '@munaxa/types';

/**
 * Environment schemas.
 *
 * The rule this enforces: a misconfigured service fails at startup, with every problem listed at
 * once, rather than at 3am on the first request that happens to read the missing value. Every
 * field declares its type, whether it is required, and whether it is a secret — and secrets are
 * excluded from every rendering of the resolved config, so a config dump in a log or an error
 * page cannot leak one.
 */

export interface FieldDefinition<T> {
  readonly kind: string;
  readonly required: boolean;
  readonly secret: boolean;
  readonly description?: string;
  readonly defaultValue?: T;
  /** Parse a raw string into T, or throw with a message describing the expected form. */
  parse(raw: string): T;
}

export interface FieldOptions<T> {
  readonly description?: string;
  readonly default?: T;
  /** Marks the value as sensitive: redacted everywhere it is rendered. */
  readonly secret?: boolean;
}

function field<T>(
  kind: string,
  parse: (raw: string) => T,
  options: FieldOptions<T> = {},
): FieldDefinition<T> {
  return {
    kind,
    parse,
    required: options.default === undefined,
    secret: options.secret ?? false,
    ...(options.description === undefined ? {} : { description: options.description }),
    ...(options.default === undefined ? {} : { defaultValue: options.default }),
  };
}

export function string(options: FieldOptions<string> & { minLength?: number } = {}): FieldDefinition<string> {
  const minLength = options.minLength ?? 1;
  return field(
    'string',
    (raw) => {
      if (raw.length < minLength) throw new Error(`expected at least ${minLength} characters`);
      return raw;
    },
    options,
  );
}

/** A secret string with a minimum length. Defaults to 32 characters — key material, not a word. */
export function secret(options: FieldOptions<string> & { minLength?: number } = {}): FieldDefinition<string> {
  return string({ minLength: 32, ...options, secret: true });
}

export function integer(
  options: FieldOptions<number> & { min?: number; max?: number } = {},
): FieldDefinition<number> {
  return field(
    'integer',
    (raw) => {
      const value = Number(raw);
      if (!Number.isInteger(value)) throw new Error('expected an integer');
      if (options.min !== undefined && value < options.min) throw new Error(`expected >= ${options.min}`);
      if (options.max !== undefined && value > options.max) throw new Error(`expected <= ${options.max}`);
      return value;
    },
    options,
  );
}

export function port(options: FieldOptions<number> = {}): FieldDefinition<number> {
  return integer({ min: 1, max: 65_535, ...options });
}

/**
 * Booleans, strictly.
 *
 * `'FALSE'`, `'no'` and `'0'` all mean false. Anything unrecognised is an error rather than
 * "truthy": `ENABLE_MFA=maybe` silently enabling MFA is bad, and silently disabling it is worse.
 */
export function boolean(options: FieldOptions<boolean> = {}): FieldDefinition<boolean> {
  return field(
    'boolean',
    (raw) => {
      const normalized = raw.trim().toLowerCase();
      if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
      if (['false', '0', 'no', 'off'].includes(normalized)) return false;
      throw new Error("expected one of true/false/1/0/yes/no/on/off");
    },
    options,
  );
}

export function duration(options: FieldOptions<DurationMs> = {}): FieldDefinition<DurationMs> {
  return field('duration', (raw) => parseDuration(raw), options);
}

export function url(options: FieldOptions<string> & { protocols?: readonly string[] } = {}): FieldDefinition<string> {
  const protocols = options.protocols ?? ['https:'];
  return field(
    'url',
    (raw) => {
      let parsed: URL;
      try {
        parsed = new URL(raw);
      } catch {
        throw new Error('expected an absolute URL');
      }
      if (!protocols.includes(parsed.protocol)) {
        throw new Error(`expected one of ${protocols.join(', ')}`);
      }
      return parsed.toString();
    },
    options,
  );
}

export function oneOf<const T extends readonly string[]>(
  values: T,
  options: FieldOptions<T[number]> = {},
): FieldDefinition<T[number]> {
  return field(
    `enum(${values.join('|')})`,
    (raw) => {
      if (!values.includes(raw)) throw new Error(`expected one of ${values.join(', ')}`);
      return raw as T[number];
    },
    options,
  );
}

export function list(
  options: FieldOptions<readonly string[]> & { separator?: string } = {},
): FieldDefinition<readonly string[]> {
  const separator = options.separator ?? ',';
  return field(
    'list',
    (raw) =>
      raw
        .split(separator)
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0),
    options,
  );
}

export type Schema = Readonly<Record<string, FieldDefinition<unknown>>>;

export type Resolved<S extends Schema> = {
  readonly [K in keyof S]: S[K] extends FieldDefinition<infer T> ? T : never;
};

export interface ConfigIssue {
  readonly key: string;
  readonly problem: string;
}

/**
 * Parse a source (usually `process.env`) against a schema.
 *
 * Collects every problem before failing. A deployment that is missing four variables should
 * learn all four in one restart, not one per restart.
 */
export function parseConfig<S extends Schema>(
  schema: S,
  source: Readonly<Record<string, string | undefined>>,
): Resolved<S> {
  const issues: ConfigIssue[] = [];
  const resolved: Record<string, unknown> = {};

  for (const [key, definition] of Object.entries(schema)) {
    // Own properties only. A source object with a polluted prototype must not be able to satisfy
    // a required field — `process.env` is safe, but config also arrives from parsed JSON.
    const raw = Object.hasOwn(source, key) ? source[key] : undefined;
    if (raw === undefined || raw === '') {
      if (definition.required) {
        issues.push({ key, problem: `missing required ${definition.kind}` });
      } else {
        resolved[key] = definition.defaultValue;
      }
      continue;
    }
    try {
      resolved[key] = definition.parse(raw);
    } catch (error) {
      // The raw value never appears in the message — half of these are secrets.
      issues.push({ key, problem: (error as Error).message });
    }
  }

  if (issues.length > 0) {
    throw new PlatformError(
      `Invalid configuration:\n${issues.map((issue) => `  ${issue.key}: ${issue.problem}`).join('\n')}`,
      { code: 'CONFIG_INVALID', details: { issues } },
    );
  }

  return resolved as Resolved<S>;
}

/**
 * A rendering of the resolved config with every secret replaced.
 *
 * This is what a `/healthz` endpoint, a startup log line or a support bundle should print.
 */
export function redactConfig<S extends Schema>(
  schema: S,
  resolved: Resolved<S>,
): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, definition] of Object.entries(schema)) {
    const value = (resolved as Record<string, unknown>)[key];
    output[key] = definition.secret && value !== undefined ? '[redacted]' : value;
  }
  return output;
}
