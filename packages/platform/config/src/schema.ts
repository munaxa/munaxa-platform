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
  /**
   * Other source names this field will accept, tried in order after its own key.
   *
   * This is what makes the platform schema adoptable by a product that already has deployments.
   * `MUNAXA_LOG_LEVEL` naming the alias `LOG_LEVEL` lets an existing Helm chart, App Service
   * configuration and `.env` keep working unchanged — without it, adopting a platform field means
   * renaming a variable in every environment simultaneously, which no product will do and every
   * product will therefore skip.
   */
  readonly aliases?: readonly string[];
  /**
   * Dotted path this field occupies in the nested rendering. Defaults to the field's own key.
   *
   * The resolved object stays flat; `nestConfig` uses this. A product whose code reads
   * `config.acl.cacheTtlSeconds` can adopt platform fields without rewriting every consumer.
   */
  readonly path?: string;
  /** Parse a raw string into T, or throw with a message describing the expected form. */
  parse(raw: string): T;
}

export interface FieldOptions<T> {
  readonly description?: string;
  readonly default?: T;
  /** Marks the value as sensitive: redacted everywhere it is rendered. */
  readonly secret?: boolean;
  /** Alternative source names, tried in order after the field's own key. See `aliases`. */
  readonly env?: string | readonly string[];
  /** Dotted path in the nested rendering. See `path`. */
  readonly path?: string;
}

function field<T>(
  kind: string,
  parse: (raw: string) => T,
  options: FieldOptions<T> = {},
): FieldDefinition<T> {
  const aliases =
    options.env === undefined ? [] : typeof options.env === 'string' ? [options.env] : options.env;
  return {
    kind,
    parse,
    required: options.default === undefined,
    secret: options.secret ?? false,
    ...(options.description === undefined ? {} : { description: options.description }),
    ...(options.default === undefined ? {} : { defaultValue: options.default }),
    ...(aliases.length === 0 ? {} : { aliases }),
    ...(options.path === undefined ? {} : { path: options.path }),
  };
}

/**
 * Add aliases and paths to a schema someone else defined.
 *
 * `PLATFORM_SCHEMA` names its variables `MUNAXA_*` and renders flat, which is right for a new
 * deployment and wrong for an existing one. Rather than making a product fork the schema — and
 * then miss every field the platform adds later — this returns the same schema with the source
 * names and output shape it needs. The field types, defaults and secret flags are untouched, so
 * the platform still owns what a setting *means*; the product owns only where it is read from and
 * where it lands.
 */
export function remapSchema<S extends Schema>(
  schema: S,
  mapping: Readonly<Record<string, { env?: string | readonly string[]; path?: string }>>,
): S {
  const unknown = Object.keys(mapping).filter((key) => !Object.hasOwn(schema, key));
  if (unknown.length > 0) {
    // A typo in a remap is otherwise invisible: the field keeps its original name and the
    // deployment fails on a variable the operator believes they set.
    throw new PlatformError(`remapSchema: no such field: ${unknown.join(', ')}`, {
      code: 'CONFIG_INVALID',
    });
  }

  const output: Record<string, FieldDefinition<unknown>> = {};
  for (const [key, definition] of Object.entries(schema)) {
    const remap = mapping[key];
    if (remap === undefined) {
      output[key] = definition;
      continue;
    }
    const aliases =
      remap.env === undefined ? [] : typeof remap.env === 'string' ? [remap.env] : remap.env;
    output[key] = {
      ...definition,
      ...(aliases.length === 0 ? {} : { aliases: [...(definition.aliases ?? []), ...aliases] }),
      ...(remap.path === undefined ? {} : { path: remap.path }),
    };
  }
  return output as S;
}

export function string(
  options: FieldOptions<string> & { minLength?: number } = {},
): FieldDefinition<string> {
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
export function secret(
  options: FieldOptions<string> & { minLength?: number } = {},
): FieldDefinition<string> {
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
      if (options.min !== undefined && value < options.min)
        throw new Error(`expected >= ${options.min}`);
      if (options.max !== undefined && value > options.max)
        throw new Error(`expected <= ${options.max}`);
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
      throw new Error('expected one of true/false/1/0/yes/no/on/off');
    },
    options,
  );
}

export function duration(options: FieldOptions<DurationMs> = {}): FieldDefinition<DurationMs> {
  return field('duration', (raw) => parseDuration(raw), options);
}

export function url(
  options: FieldOptions<string> & { protocols?: readonly string[] } = {},
): FieldDefinition<string> {
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
      return raw;
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
 * A rule that spans more than one field.
 *
 * Per-field parsing cannot express "required only when the deployment profile is `hosted`" or
 * "these two catalogue sources are mutually exclusive", and a product that has such rules — every
 * real product does — has to put them somewhere. Somewhere else means they stop being part of the
 * schema: they run later, on a different code path, and the startup failure they were supposed to
 * cause becomes a runtime failure instead.
 *
 * Return nothing when the rule holds; return one issue or several when it does not. Refinements
 * run only after every field parsed, so they can read `resolved` without guarding each access, and
 * their issues join the field issues in one message.
 */
export type Refinement<S extends Schema> = (
  resolved: Resolved<S>,
) => ConfigIssue | readonly ConfigIssue[] | undefined | void;

/**
 * A schema plus the rules that span its fields.
 *
 * `parseConfig` accepts either this or a bare field map, so nothing that worked before changes.
 */
export interface ConfigSchema<S extends Schema> {
  readonly fields: S;
  readonly refinements: readonly Refinement<S>[];
}

export function defineConfig<S extends Schema>(
  fields: S,
  options: { readonly refine?: Refinement<S> | readonly Refinement<S>[] } = {},
): ConfigSchema<S> {
  const refine = options.refine;
  return { fields, refinements: toArray(refine) };
}

/**
 * Add a product's own fields to a platform schema.
 *
 * The intended shape of adoption: the platform owns its ~25 settings and a product keeps its
 * ~100, in one schema that fails once at startup with every problem listed. Redefining a platform
 * field is refused rather than merged — a product silently overriding the platform's definition of
 * a session timeout or a password policy is how a security setting quietly stops meaning what the
 * platform says it means. Use `remapSchema` to change where a field is read from; use a different
 * key to hold a different value.
 */
export function extendConfig<B extends Schema, E extends Schema>(
  base: ConfigSchema<B> | B,
  extension: E,
  options: { readonly refine?: Refinement<B & E> | readonly Refinement<B & E>[] } = {},
): ConfigSchema<B & E> {
  const baseSchema = isConfigSchema(base) ? base : defineConfig(base);
  const collisions = Object.keys(extension).filter((key) => Object.hasOwn(baseSchema.fields, key));
  if (collisions.length > 0) {
    throw new PlatformError(
      `extendConfig: cannot redefine platform fields: ${collisions.join(', ')}`,
      { code: 'CONFIG_INVALID', details: { collisions } },
    );
  }

  return {
    fields: { ...baseSchema.fields, ...extension },
    // Base refinements still apply: extending a schema must not be a way to drop its rules. They
    // are widened rather than re-checked: every field the base rule reads is still present.
    refinements: [
      ...(baseSchema.refinements as unknown as readonly Refinement<B & E>[]),
      ...toArray(options.refine),
    ],
  };
}

/** One-or-many to many, without `Array.isArray` widening a readonly array to `any[]`. */
function toArray<T>(value: T | readonly T[] | undefined): readonly T[] {
  if (value === undefined) return [];
  return value instanceof Array ? value : [value];
}

function isConfigSchema<S extends Schema>(value: ConfigSchema<S> | S): value is ConfigSchema<S> {
  return Object.hasOwn(value, 'fields') && Object.hasOwn(value, 'refinements');
}

/**
 * Parse a source (usually `process.env`) against a schema.
 *
 * Collects every problem before failing. A deployment that is missing four variables should
 * learn all four in one restart, not one per restart — and that now includes cross-field rules,
 * which report alongside the field problems rather than after a second restart.
 */
export function parseConfig<S extends Schema>(
  schema: ConfigSchema<S> | S,
  source: Readonly<Record<string, string | undefined>>,
): Resolved<S> {
  const { fields, refinements } = isConfigSchema(schema) ? schema : defineConfig(schema);
  const issues: ConfigIssue[] = [];
  const resolved: Record<string, unknown> = {};

  for (const [key, definition] of Object.entries(fields)) {
    const found = read(source, key, definition.aliases);
    if (found === undefined) {
      if (definition.required) {
        const names = [key, ...(definition.aliases ?? [])].join(' or ');
        issues.push({ key, problem: `missing required ${definition.kind} (${names})` });
      } else {
        resolved[key] = definition.defaultValue;
      }
      continue;
    }
    try {
      resolved[key] = definition.parse(found.raw);
    } catch (error) {
      // The raw value never appears in the message — half of these are secrets. The *name* does,
      // because with aliases the operator needs to know which of them was the one that was wrong.
      issues.push({ key, problem: `${(error as Error).message} (from ${found.name})` });
    }
  }

  // Refinements only run on a complete object: a rule reading a field that failed to parse would
  // report a second, misleading problem for the same cause.
  if (issues.length === 0) {
    for (const refinement of refinements) {
      const result = refinement(resolved as Resolved<S>);
      if (result === undefined || result === null) continue;
      issues.push(...toArray(result));
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
 * Find a field's value under its own name or any alias.
 *
 * Own properties only. A source object with a polluted prototype must not be able to satisfy a
 * required field — `process.env` is safe, but config also arrives from parsed JSON.
 */
function read(
  source: Readonly<Record<string, string | undefined>>,
  key: string,
  aliases: readonly string[] | undefined,
): { raw: string; name: string } | undefined {
  for (const name of [key, ...(aliases ?? [])]) {
    const raw = Object.hasOwn(source, name) ? source[name] : undefined;
    // An empty string is "not set", the same as it has always been: a Helm value that renders to
    // `FOO=` should fall through to the next alias rather than fail as an empty required string.
    if (raw !== undefined && raw !== '') return { raw, name };
  }
  return undefined;
}

/**
 * Render a resolved config as a nested object, using each field's `path`.
 *
 * The flat record is right for the platform, which knows its fields by name, and wrong for an
 * application whose code reads `config.app.name`. Producing the nested shape here rather than
 * making every consumer flatten is the difference between a configuration migration and a rewrite
 * of every call site.
 */
export function nestConfig<S extends Schema>(
  schema: ConfigSchema<S> | S,
  resolved: Resolved<S>,
): Record<string, unknown> {
  const fields = isConfigSchema(schema) ? schema.fields : schema;
  const output: Record<string, unknown> = {};

  for (const [key, definition] of Object.entries(fields)) {
    const segments = (definition.path ?? key).split('.');
    const leaf = segments.pop() as string;
    let cursor = output;
    for (const segment of segments) {
      if (segment === '__proto__' || segment === 'constructor' || segment === 'prototype') {
        throw new PlatformError(`nestConfig: unsafe path segment '${segment}' on field ${key}`, {
          code: 'CONFIG_INVALID',
        });
      }
      const next = cursor[segment];
      if (next === undefined) {
        cursor[segment] = {};
      } else if (typeof next !== 'object' || next === null) {
        // Two fields whose paths disagree — `a.b` and `a.b.c`. Silently letting one win produces a
        // config object missing a value, discovered wherever it is eventually read.
        throw new PlatformError(
          `nestConfig: path conflict at '${segment}' between field ${key} and an earlier field`,
          { code: 'CONFIG_INVALID' },
        );
      }
      cursor = cursor[segment] as Record<string, unknown>;
    }
    cursor[leaf] = (resolved as Record<string, unknown>)[key];
  }

  return output;
}

/**
 * A rendering of the resolved config with every secret replaced.
 *
 * This is what a `/healthz` endpoint, a startup log line or a support bundle should print.
 */
export function redactConfig<S extends Schema>(
  schema: ConfigSchema<S> | S,
  resolved: Resolved<S>,
): Record<string, unknown> {
  const fields = isConfigSchema(schema) ? schema.fields : schema;
  const output: Record<string, unknown> = {};
  for (const [key, definition] of Object.entries(fields)) {
    const value = (resolved as Record<string, unknown>)[key];
    output[key] = definition.secret && value !== undefined ? '[redacted]' : value;
  }
  return output;
}
