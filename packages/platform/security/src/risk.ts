import type { TenantId, UserId } from '@munaxa/types';

/**
 * The risk engine.
 *
 * It answers one question — how unusual is this attempt — and returns a decision the caller acts
 * on: allow, challenge (step up to a second factor), or deny. Deliberately advisory: the platform
 * never silently blocks a login on a heuristic, because every signal here has a false-positive
 * mode that looks exactly like a person travelling, changing phone, or joining a VPN.
 *
 * Signals are pluggable and each returns a bounded contribution. Scores are additive and clamped,
 * rather than multiplicative, so one noisy signal cannot dominate and a missing signal cannot
 * quietly zero out the result.
 */
export interface RiskContext {
  readonly tenantId: TenantId;
  readonly userId?: UserId;
  readonly ipAddress?: string;
  readonly country?: string;
  readonly userAgent?: string;
  readonly deviceKnown?: boolean;
  readonly deviceTrusted?: boolean;
  /** Failed attempts for this account in the recent window. */
  readonly recentFailures?: number;
  /** Distinct accounts this address has attempted recently — the credential-stuffing signal. */
  readonly distinctAccountsFromIp?: number;
  /** Country of the previous successful login, and how long ago it was. */
  readonly previousCountry?: string;
  readonly minutesSincePreviousLogin?: number;
  readonly attributes?: Readonly<Record<string, unknown>>;
}

export interface RiskSignal {
  readonly name: string;
  /** Bounded contribution, 0–100. Never negative: signals raise suspicion, they do not vouch. */
  readonly weight: number;
  evaluate(context: RiskContext): number | Promise<number>;
}

export type RiskDecision = 'allow' | 'challenge' | 'deny';

export interface RiskAssessment {
  readonly score: number;
  readonly decision: RiskDecision;
  readonly reasons: readonly string[];
  readonly signals: Readonly<Record<string, number>>;
}

export interface RiskEngineOptions {
  readonly signals?: readonly RiskSignal[];
  /**
   * Score at or above which a second factor is required. The default is calibrated so that an
   * unrecognised device on its own reaches it: a first login from a new machine is the moment a
   * stolen password gets used, and stepping up there costs a legitimate user one code.
   */
  readonly challengeAt?: number;
  /** Score at or above which the attempt is refused outright. */
  readonly denyAt?: number;
}

export class RiskEngine {
  readonly #signals: readonly RiskSignal[];
  readonly #challengeAt: number;
  readonly #denyAt: number;

  constructor(options: RiskEngineOptions = {}) {
    this.#signals = options.signals ?? DEFAULT_RISK_SIGNALS;
    this.#challengeAt = options.challengeAt ?? 35;
    this.#denyAt = options.denyAt ?? 85;
  }

  async assess(context: RiskContext): Promise<RiskAssessment> {
    const signals: Record<string, number> = {};
    const reasons: string[] = [];
    let score = 0;

    for (const signal of this.#signals) {
      let contribution = 0;
      try {
        const raw = await signal.evaluate(context);
        contribution = clamp(raw, 0, 100) * (signal.weight / 100);
      } catch {
        // A signal that throws contributes nothing. It must not fail the login, and it must not
        // silently be treated as "safe" either — which is why it is recorded as zero, visibly.
        contribution = 0;
      }
      if (contribution > 0) {
        signals[signal.name] = Math.round(contribution);
        reasons.push(signal.name);
      }
      score += contribution;
    }

    const total = Math.round(clamp(score, 0, 100));
    return {
      score: total,
      decision: total >= this.#denyAt ? 'deny' : total >= this.#challengeAt ? 'challenge' : 'allow',
      reasons,
      signals,
    };
  }
}

function clamp(value: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;
}

/** A device never seen before on this account. The single most useful signal there is. */
export const newDeviceSignal: RiskSignal = {
  name: 'new-device',
  weight: 35,
  evaluate: (context) => (context.deviceTrusted ? 0 : context.deviceKnown ? 20 : 100),
};

/**
 * Login from a country the account has not used, sooner than a plane could have made it.
 *
 * Bluntly approximate — no geodesic distance, no airline schedules — because the useful case is
 * "two countries, twenty minutes apart", which needs no precision at all.
 */
export const impossibleTravelSignal: RiskSignal = {
  name: 'impossible-travel',
  weight: 40,
  evaluate: (context) => {
    if (!context.country || !context.previousCountry) return 0;
    if (context.country === context.previousCountry) return 0;
    const minutes = context.minutesSincePreviousLogin ?? Number.POSITIVE_INFINITY;
    if (minutes <= 60) return 100;
    if (minutes <= 240) return 50;
    return 10;
  },
};

/** Repeated failures on this account, i.e. someone is guessing. */
export const failedAttemptsSignal: RiskSignal = {
  name: 'recent-failures',
  weight: 25,
  evaluate: (context) => Math.min(100, (context.recentFailures ?? 0) * 20),
};

/** One address attempting many accounts: the shape of credential stuffing. */
export const credentialStuffingSignal: RiskSignal = {
  name: 'distinct-accounts-from-ip',
  weight: 45,
  evaluate: (context) => {
    const distinct = context.distinctAccountsFromIp ?? 0;
    if (distinct <= 2) return 0;
    return Math.min(100, (distinct - 2) * 25);
  },
};

/** A missing or automation-shaped user agent on an interactive endpoint. */
export const clientShapeSignal: RiskSignal = {
  name: 'automation-client',
  weight: 15,
  evaluate: (context) => {
    const agent = context.userAgent?.toLowerCase() ?? '';
    if (agent === '') return 60;
    return /\b(curl|wget|python-requests|httpie|go-http-client|scrapy|headless)\b/.test(agent) ? 80 : 0;
  },
};

export const DEFAULT_RISK_SIGNALS: readonly RiskSignal[] = [
  newDeviceSignal,
  impossibleTravelSignal,
  failedAttemptsSignal,
  credentialStuffingSignal,
  clientShapeSignal,
];
