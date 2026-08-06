import type { BreachRegistryPort, PasswordHistoryPort } from '@munaxa/interfaces';
import { PlatformError, type DurationMs, type TenantId, type UserId } from '@munaxa/types';
import { sha1HexUpper, type PasswordHasher } from '@munaxa/crypto';

/**
 * Password policy.
 *
 * The defaults follow NIST SP 800-63B rather than the composition rules most products inherited
 * from the 2000s, because the evidence is unambiguous:
 *
 * - **Length beats character classes.** A 12-character minimum with no mandatory symbol produces
 *   stronger passwords than an 8-character minimum with four required classes, which reliably
 *   produces `Password1!`.
 * - **Check against breach corpora, not dictionaries.** What matters is whether *this* password
 *   is already in an attacker's list, not whether it contains a vowel.
 * - **Do not expire passwords on a schedule.** Forced rotation produces `Password1!` then
 *   `Password2!`. Rotation on evidence of compromise is a different thing, and is supported.
 *
 * Composition requirements are still available, because some customers are contractually
 * required to have them. They are off by default and each one is a knob a tenant turns on
 * knowingly.
 */
export interface PasswordPolicy {
  readonly minLength: number;
  readonly maxLength: number;
  /** Number of previous passwords that may not be reused. 0 disables history. */
  readonly historyCount: number;
  /** Reject passwords found in a breach corpus. */
  readonly checkBreaches: boolean;
  /** Forced rotation age. 0 — the default — disables it, deliberately. */
  readonly maxAge: DurationMs;
  /** Optional composition requirements, off by default. */
  readonly requireUppercase: boolean;
  readonly requireLowercase: boolean;
  readonly requireDigit: boolean;
  readonly requireSymbol: boolean;
  /** Reject passwords containing the user's own identifier. */
  readonly rejectUserInfo: boolean;
  /** Reject a password that is a single repeated character or a simple sequence. */
  readonly rejectTrivialPatterns: boolean;
  /** Additional forbidden values — the product name, the company name. */
  readonly blocklist: readonly string[];
}

export const DEFAULT_PASSWORD_POLICY: PasswordPolicy = {
  minLength: 12,
  // Bounded because the hash function's cost is paid on every login, and an unbounded password is
  // a denial-of-service knob. 128 accommodates any real passphrase.
  maxLength: 128,
  historyCount: 5,
  checkBreaches: true,
  maxAge: 0,
  requireUppercase: false,
  requireLowercase: false,
  requireDigit: false,
  requireSymbol: false,
  rejectUserInfo: true,
  rejectTrivialPatterns: true,
  blocklist: [],
};

/** The platform floor. A tenant may be stricter; it may never go below this. */
export const PASSWORD_POLICY_FLOOR = { minLength: 12, maxLength: 64 } as const;

export function clampPasswordPolicy(policy: Partial<PasswordPolicy>): PasswordPolicy {
  const merged = { ...DEFAULT_PASSWORD_POLICY, ...policy };
  return {
    ...merged,
    minLength: Math.max(merged.minLength, PASSWORD_POLICY_FLOOR.minLength),
    maxLength: Math.max(merged.maxLength, PASSWORD_POLICY_FLOOR.maxLength),
  };
}

export type PasswordViolation =
  | 'too-short'
  | 'too-long'
  | 'missing-uppercase'
  | 'missing-lowercase'
  | 'missing-digit'
  | 'missing-symbol'
  | 'contains-user-info'
  | 'trivial-pattern'
  | 'blocklisted'
  | 'breached'
  | 'reused';

export interface PasswordValidation {
  readonly valid: boolean;
  readonly violations: readonly PasswordViolation[];
  /** 0–100, for a strength meter. Advisory only; it never gates acceptance on its own. */
  readonly strength: number;
}

export interface ValidateOptions {
  readonly policy?: Partial<PasswordPolicy>;
  readonly tenantId?: TenantId;
  readonly userId?: UserId;
  /** The identifier and any names, so the password cannot simply be the email address. */
  readonly userInfo?: readonly string[];
  readonly breachRegistry?: BreachRegistryPort;
  readonly history?: PasswordHistoryPort;
  readonly hasher?: PasswordHasher;
}

export class PasswordPolicyService {
  readonly #policy: PasswordPolicy;
  readonly #policyFor: ((tenantId: TenantId) => Partial<PasswordPolicy> | undefined) | undefined;
  readonly #breachRegistry: BreachRegistryPort | undefined;
  readonly #history: PasswordHistoryPort | undefined;
  readonly #hasher: PasswordHasher | undefined;

  constructor(
    options: {
      policy?: Partial<PasswordPolicy>;
      policyFor?: (tenantId: TenantId) => Partial<PasswordPolicy> | undefined;
      breachRegistry?: BreachRegistryPort;
      history?: PasswordHistoryPort;
      hasher?: PasswordHasher;
    } = {},
  ) {
    this.#policy = clampPasswordPolicy(options.policy ?? {});
    this.#policyFor = options.policyFor;
    this.#breachRegistry = options.breachRegistry;
    this.#history = options.history;
    this.#hasher = options.hasher;
  }

  policy(tenantId?: TenantId): PasswordPolicy {
    const override = tenantId ? this.#policyFor?.(tenantId) : undefined;
    return override ? clampPasswordPolicy({ ...this.#policy, ...override }) : this.#policy;
  }

  /**
   * Check a candidate password against every applicable rule.
   *
   * Returns every violation rather than the first, so a user fixing their password learns all of
   * the problems at once instead of one per submission.
   */
  async validate(password: string, options: ValidateOptions = {}): Promise<PasswordValidation> {
    const policy = options.policy
      ? clampPasswordPolicy({ ...this.policy(options.tenantId), ...options.policy })
      : this.policy(options.tenantId);
    const violations: PasswordViolation[] = [];

    // Normalized the same way the hasher normalizes it, so length is measured on what is stored.
    const candidate = password.normalize('NFKC');

    if (candidate.length < policy.minLength) violations.push('too-short');
    if (candidate.length > policy.maxLength) violations.push('too-long');
    if (policy.requireUppercase && !/\p{Lu}/u.test(candidate)) violations.push('missing-uppercase');
    if (policy.requireLowercase && !/\p{Ll}/u.test(candidate)) violations.push('missing-lowercase');
    if (policy.requireDigit && !/\d/.test(candidate)) violations.push('missing-digit');
    if (policy.requireSymbol && !/[^\p{L}\p{N}]/u.test(candidate))
      violations.push('missing-symbol');

    if (policy.rejectTrivialPatterns && isTrivial(candidate)) violations.push('trivial-pattern');

    const lowered = candidate.toLowerCase();
    if (policy.blocklist.some((entry) => lowered.includes(entry.toLowerCase()))) {
      violations.push('blocklisted');
    }

    if (policy.rejectUserInfo && options.userInfo?.length) {
      const containsUserInfo = options.userInfo.some((info) => {
        const normalized = info.toLowerCase().split('@')[0] as string;
        return normalized.length >= 4 && lowered.includes(normalized);
      });
      if (containsUserInfo) violations.push('contains-user-info');
    }

    const registry = options.breachRegistry ?? this.#breachRegistry;
    if (policy.checkBreaches && registry && (await this.isBreached(candidate, registry))) {
      violations.push('breached');
    }

    const history = options.history ?? this.#history;
    const hasher = options.hasher ?? this.#hasher;
    if (
      policy.historyCount > 0 &&
      history &&
      hasher &&
      options.tenantId &&
      options.userId &&
      (await this.#isReused(
        candidate,
        policy.historyCount,
        history,
        hasher,
        options.tenantId,
        options.userId,
      ))
    ) {
      violations.push('reused');
    }

    return { valid: violations.length === 0, violations, strength: strengthOf(candidate) };
  }

  /** Validate, or throw the typed error a transport turns into a 422. */
  async assertValid(password: string, options: ValidateOptions = {}): Promise<void> {
    const result = await this.validate(password, options);
    if (result.valid) return;

    const code = result.violations.includes('breached')
      ? 'AUTH_PASSWORD_BREACHED'
      : result.violations.includes('reused')
        ? 'AUTH_PASSWORD_REUSED'
        : 'AUTH_PASSWORD_POLICY';

    throw new PlatformError(`Password rejected: ${result.violations.join(', ')}`, {
      code,
      // The violations are safe to show — they describe the policy, not the password.
      details: { violations: result.violations },
    });
  }

  /**
   * Breach lookup by k-anonymity.
   *
   * Only the first five characters of the SHA-1 leave this function; the caller's registry
   * returns every suffix under that prefix and the comparison happens locally. The full hash of a
   * live password is never sent anywhere, which is what makes using a hosted corpus acceptable.
   */
  async isBreached(password: string, registry: BreachRegistryPort): Promise<boolean> {
    const digest = sha1HexUpper(password.normalize('NFKC'));
    const prefix = digest.slice(0, 5);
    const suffix = digest.slice(5);

    try {
      const suffixes = await registry.suffixesForPrefix(prefix);
      return suffixes.some((candidate) => candidate.split(':')[0]?.toUpperCase() === suffix);
    } catch {
      // A breach service that is down must not stop people setting a password. The check is a
      // meaningful improvement, not a dependency of the login system.
      return false;
    }
  }

  async #isReused(
    password: string,
    count: number,
    history: PasswordHistoryPort,
    hasher: PasswordHasher,
    tenantId: TenantId,
    userId: UserId,
  ): Promise<boolean> {
    const previous = await history.recent(tenantId, userId, count);
    for (const encoded of previous) {
      if (await hasher.verify(password, encoded)) return true;
    }
    return false;
  }
}

const SEQUENCES = [
  '0123456789',
  'abcdefghijklmnopqrstuvwxyz',
  'qwertyuiop',
  'asdfghjkl',
  'zxcvbnm',
];

function isTrivial(password: string): boolean {
  const lowered = password.toLowerCase();
  if (/^(.)\1+$/.test(lowered)) return true;

  // A run of six or more characters straight off a keyboard row or the alphabet.
  for (const sequence of SEQUENCES) {
    for (let i = 0; i + 6 <= sequence.length; i++) {
      const run = sequence.slice(i, i + 6);
      if (lowered.includes(run) || lowered.includes([...run].reverse().join(''))) return true;
    }
  }

  // A short unit repeated to reach the length requirement: "abcabcabcabc".
  for (let unit = 1; unit <= 4; unit++) {
    if (lowered.length >= unit * 3 && lowered.length % unit === 0) {
      const head = lowered.slice(0, unit);
      if (head.repeat(lowered.length / unit) === lowered) return true;
    }
  }

  return false;
}

/**
 * A rough entropy estimate for a strength meter.
 *
 * Advisory only. It never gates acceptance, because a scoring function that decides is a scoring
 * function attackers optimise against.
 */
export function strengthOf(password: string): number {
  const classes = [/\p{Ll}/u, /\p{Lu}/u, /\d/, /[^\p{L}\p{N}]/u].filter((pattern) =>
    pattern.test(password),
  ).length;
  const distinct = new Set(password).size;
  const bits = Math.log2(Math.max(distinct, 2)) * password.length + classes * 4;
  return Math.min(100, Math.round((bits / 90) * 100));
}
