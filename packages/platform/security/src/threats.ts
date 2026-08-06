import { normalizePath, normalizeText } from './normalize.js';

/**
 * Threat detection.
 *
 * What this is: a cheap, high-signal tripwire that turns obvious probing into an audit event and
 * a rate-limit penalty.
 *
 * What this is **not**: a web application firewall, and not a substitute for parameterised
 * queries, output encoding or path resolution. Pattern matching on request content is trivially
 * evaded by anyone trying, so a detector firing is worth *recording*; a detector staying silent
 * proves nothing. Every product must still be safe with detection turned off — which is why the
 * default action is to flag rather than to block.
 */
export type ThreatKind =
  | 'sql-injection'
  | 'xss'
  | 'path-traversal'
  | 'command-injection'
  | 'template-injection'
  | 'nosql-injection'
  | 'header-injection';

export interface ThreatFinding {
  readonly kind: ThreatKind;
  /** Where it was seen: `query.q`, `body.name`, `path`. */
  readonly location: string;
  /** 0–100. High means the pattern is rarely benign, not that exploitation was confirmed. */
  readonly confidence: number;
  /** A short, already-truncated excerpt. Never the whole value. */
  readonly excerpt: string;
}

interface Detector {
  readonly kind: ThreatKind;
  readonly pattern: RegExp;
  readonly confidence: number;
}

/**
 * Patterns are anchored on structure rather than keywords wherever possible: matching the bare
 * word "select" flags every search box in the product, which is how detection gets switched off.
 */
const DETECTORS: readonly Detector[] = [
  {
    kind: 'sql-injection',
    pattern:
      /(\bunion\b[\s\S]{0,20}\bselect\b)|(\bor\b\s+['"]?\d+['"]?\s*=\s*['"]?\d+)|(;\s*(drop|truncate|delete)\s+(table|from)\b)|(\/\*[\s\S]*?\*\/\s*(select|union)\b)/i,
    confidence: 85,
  },
  {
    kind: 'xss',
    pattern:
      /<script[\s>]|javascript:\s*[^\s]|on(?:error|load|click|mouseover)\s*=\s*["']?[^"'\s]|<iframe[\s>]|<svg[^>]*\bon\w+\s*=/i,
    confidence: 80,
  },
  {
    kind: 'path-traversal',
    pattern: /(^|[/\\])\.\.([/\\]|$)|%2e%2e[/\\%]|\.\.%2f/i,
    confidence: 75,
  },
  {
    kind: 'command-injection',
    pattern: /[;|&`]\s*(cat|ls|rm|curl|wget|nc|bash|sh|powershell|cmd)\b|\$\([^)]+\)|`[^`]+`/i,
    confidence: 70,
  },
  {
    kind: 'template-injection',
    pattern:
      /\{\{[\s\S]{0,60}?(constructor|process|require|globals|__proto__)[\s\S]{0,60}?\}\}|\$\{[\s\S]{0,60}?(process|require)[\s\S]{0,60}?\}/i,
    confidence: 80,
  },
  {
    kind: 'nosql-injection',
    pattern: /\$(?:where|ne|gt|lt|regex|expr|function)\b\s*:/i,
    confidence: 70,
  },
  {
    kind: 'header-injection',
    pattern: /[\r\n](?:set-cookie|location|content-length)\s*:/i,
    confidence: 90,
  },
];

export interface ScanOptions {
  /** Fields never scanned. A password may legitimately contain anything at all. */
  readonly skipFields?: readonly string[];
  readonly maxDepth?: number;
  /** Values longer than this are truncated before matching, to bound the work. */
  readonly maxValueLength?: number;
}

const DEFAULT_SKIP = [
  'password',
  'newpassword',
  'currentpassword',
  'passphrase',
  'content',
  'body',
  'markdown',
];

/**
 * Scan a structured value for threat patterns.
 *
 * `skipFields` is important and defaults to more than passwords: a document editor's body, a
 * markdown field, a code snippet — all legitimately contain the same characters an injection
 * does. Scanning them produces noise, and noise is how a detector gets disabled entirely.
 */
export function scanForThreats(
  value: unknown,
  location = 'input',
  options: ScanOptions = {},
): readonly ThreatFinding[] {
  const skip = new Set((options.skipFields ?? DEFAULT_SKIP).map((field) => field.toLowerCase()));
  const maxDepth = options.maxDepth ?? 5;
  const maxValueLength = options.maxValueLength ?? 4_096;
  const findings: ThreatFinding[] = [];

  const walk = (current: unknown, path: string, depth: number): void => {
    if (depth > maxDepth) return;

    if (typeof current === 'string') {
      const candidate = normalizeText(current).slice(0, maxValueLength);
      for (const detector of DETECTORS) {
        if (detector.pattern.test(candidate)) {
          findings.push({
            kind: detector.kind,
            location: path,
            confidence: detector.confidence,
            excerpt: candidate.slice(0, 120),
          });
        }
      }
      return;
    }

    if (Array.isArray(current)) {
      for (const [index, entry] of current.slice(0, 100).entries()) {
        walk(entry, `${path}[${index}]`, depth + 1);
      }
      return;
    }

    if (current && typeof current === 'object') {
      for (const [key, entry] of Object.entries(current as Record<string, unknown>)) {
        if (skip.has(key.toLowerCase())) continue;
        walk(entry, `${path}.${key}`, depth + 1);
      }
    }
  };

  walk(value, location, 0);
  return findings;
}

/** The highest confidence among findings, or zero. What a risk signal reads. */
export function threatScore(findings: readonly ThreatFinding[]): number {
  return findings.reduce((highest, finding) => Math.max(highest, finding.confidence), 0);
}

/**
 * Path-specific check, used before a request reaches a route matcher.
 *
 * Traversal in a path is the one case where blocking outright is right: there is no legitimate
 * request whose path needs to climb above the application root.
 */
export function inspectPath(path: string): ThreatFinding | undefined {
  const normalized = normalizePath(path);
  if (normalized === path) return undefined;
  if (!/(^|[/\\])\.\.([/\\]|$)|%2e%2e/i.test(decodeSafely(path))) return undefined;
  return {
    kind: 'path-traversal',
    location: 'path',
    confidence: 90,
    excerpt: path.slice(0, 120),
  };
}

function decodeSafely(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
