/**
 * Redaction.
 *
 * Structured logging makes it very easy to log an entire object, and objects on an auth path
 * contain passwords, tokens and cookies. Redaction here is by *key name*, applied recursively
 * before a line is serialised, because the alternative — remembering at every call site — has a
 * hit rate of about 95%, and 5% of authentication logs is a credential store.
 */

/** Key names redacted everywhere, matched case-insensitively against the whole key. */
export const DEFAULT_REDACTED_KEYS = [
  'password',
  'newpassword',
  'currentpassword',
  'passwordconfirmation',
  'passphrase',
  'secret',
  'token',
  'accesstoken',
  'refreshtoken',
  'idtoken',
  'apikey',
  'x-api-key',
  'apisecret',
  'clientsecret',
  'authorization',
  'cookie',
  'setcookie',
  'sessionid',
  'csrftoken',
  'otp',
  'totp',
  'mfacode',
  'recoverycode',
  'privatekey',
  'signature',
  'creditcard',
  'cvv',
  'ssn',
] as const;

export const REDACTED = '[redacted]';

export interface RedactionOptions {
  readonly keys?: readonly string[];
  /** Maximum depth to walk. Beyond it, values are replaced with '[depth]'. */
  readonly maxDepth?: number;
  /** Maximum array entries kept. The rest become a count. */
  readonly maxArrayLength?: number;
  /** Strings longer than this are truncated — a log line is not a document store. */
  readonly maxStringLength?: number;
}

export class Redactor {
  readonly #keys: Set<string>;
  readonly #maxDepth: number;
  readonly #maxArrayLength: number;
  readonly #maxStringLength: number;

  constructor(options: RedactionOptions = {}) {
    this.#keys = new Set(
      (options.keys ?? DEFAULT_REDACTED_KEYS).map((key) => normalizeKey(key)),
    );
    this.#maxDepth = options.maxDepth ?? 6;
    this.#maxArrayLength = options.maxArrayLength ?? 50;
    this.#maxStringLength = options.maxStringLength ?? 2_000;
  }

  /** Add product-specific sensitive keys without losing the defaults. */
  add(...keys: readonly string[]): this {
    for (const key of keys) this.#keys.add(normalizeKey(key));
    return this;
  }

  isSensitive(key: string): boolean {
    return this.#keys.has(normalizeKey(key));
  }

  redact(value: unknown): unknown {
    return this.#walk(value, 0, new WeakSet());
  }

  #walk(value: unknown, depth: number, seen: WeakSet<object>): unknown {
    if (value === null || value === undefined) return value;

    if (typeof value === 'string') {
      return value.length > this.#maxStringLength
        ? `${value.slice(0, this.#maxStringLength)}…[${value.length} chars]`
        : value;
    }

    if (typeof value !== 'object') {
      return typeof value === 'bigint' || typeof value === 'function' ? String(value) : value;
    }

    if (depth >= this.#maxDepth) return '[depth]';

    // A cycle in a logged object must produce a marker, not a stack overflow that takes the
    // process down — logging is the thing you need most when something is already wrong.
    if (seen.has(value)) return '[circular]';
    seen.add(value);

    if (value instanceof Error) {
      return {
        name: value.name,
        message: value.message,
        ...(value.stack === undefined ? {} : { stack: value.stack }),
      };
    }

    if (value instanceof Date) return value.toISOString();

    if (Array.isArray(value)) {
      const kept = value.slice(0, this.#maxArrayLength).map((entry) => this.#walk(entry, depth + 1, seen));
      return value.length > this.#maxArrayLength
        ? [...kept, `…and ${value.length - this.#maxArrayLength} more`]
        : kept;
    }

    const output: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      output[key] = this.isSensitive(key) ? REDACTED : this.#walk(entry, depth + 1, seen);
    }
    return output;
  }
}

function normalizeKey(key: string): string {
  // `X-Api-Key`, `api_key` and `apiKey` are the same field wearing three hats.
  return key.toLowerCase().replaceAll(/[^a-z0-9]/g, '');
}

export const defaultRedactor = new Redactor();

/**
 * Mask a value while keeping enough to correlate it across lines.
 *
 * For identifiers that are sensitive but not secret — an email address in a security event, the
 * tail of a token id — where full redaction would make an incident untraceable.
 */
export function mask(value: string, visible = 4): string {
  if (value.length <= visible) return REDACTED;
  return `${'*'.repeat(Math.min(8, value.length - visible))}${value.slice(-visible)}`;
}

/** Mask an email as `a***@example.com` — enough to recognise, not enough to harvest. */
export function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) return REDACTED;
  const local = email.slice(0, at);
  return `${local[0] as string}***${email.slice(at)}`;
}
