/**
 * Input normalization.
 *
 * Normalization is a security control, not a formatting nicety. Two identifiers that a human
 * reads as the same string but that compare unequal give an attacker a way to register a
 * near-duplicate account; two that compare equal after a *lossy* normalization give them a way to
 * collide with someone else's. The functions here draw that line deliberately, and each one says
 * which side it is on.
 */

// Written as escapes rather than as literals: a source file containing an actual zero-width or
// bidi character is unreadable in review — which is the same property that makes these worth
// stripping from user input in the first place.
const ZERO_WIDTH = /[\u200b-\u200d\u2060\ufeff]/g;
// Bidirectional overrides let "admin\u202etxt.exe" render as something else entirely.
const BIDI_CONTROL = /[\u202a-\u202e\u2066-\u2069]/g;
// eslint-disable-next-line no-control-regex -- removing control characters is the whole point
const CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

/**
 * The baseline for any string that will be stored, compared or displayed.
 *
 * NFKC folds compatibility variants (fullwidth Ａ to A, ligature ﬁ to fi), which is what makes
 * two visually identical strings compare equal. Zero-width and bidi characters are removed
 * outright: they have no legitimate use in an identifier and every use in a homograph attack.
 */
export function normalizeText(value: string): string {
  return value
    .normalize('NFKC')
    .replace(ZERO_WIDTH, '')
    .replace(BIDI_CONTROL, '')
    .replace(CONTROL_CHARS, '')
    .trim();
}

/**
 * Normalize an email address for *comparison and lookup*.
 *
 * The domain is lowercased, because DNS is case-insensitive. The local part is **not**: RFC 5321
 * says it is case-sensitive, and while most providers ignore case, some do not. Lowercasing it
 * anyway is the pragmatic choice most systems make and the platform makes it too — but only for
 * the lookup key. The address as typed is what gets delivered to.
 *
 * Deliberately *not* done: stripping `+tags` or dots. Gmail treats them as aliases; almost
 * nothing else does, and stripping them lets one person's address collide with another's mailbox
 * on any provider that treats them as distinct.
 */
export function normalizeEmail(email: string): string {
  const cleaned = normalizeText(email).toLowerCase();
  const at = cleaned.lastIndexOf('@');
  if (at <= 0) return cleaned;
  return `${cleaned.slice(0, at)}@${cleaned.slice(at + 1)}`;
}

/** A username or handle: normalized, folded to lowercase, with runs of whitespace collapsed. */
export function normalizeIdentifier(value: string): string {
  return normalizeText(value).toLowerCase().replaceAll(/\s+/g, ' ');
}

/**
 * Normalize a phone number to E.164-ish digits.
 *
 * Not a validator — that needs a country database this package will not carry. It exists so the
 * same number typed three ways produces one lookup key.
 */
export function normalizePhone(value: string): string {
  const digits = normalizeText(value).replaceAll(/[^\d+]/g, '');
  return digits.startsWith('+') ? `+${digits.slice(1).replaceAll('+', '')}` : digits;
}

/**
 * Strip a header value down to what may safely be echoed or logged.
 *
 * CR and LF are removed rather than escaped: a header value containing either is a response- or
 * log-splitting attempt, and there is no legitimate case for keeping it.
 */
export function normalizeHeaderValue(value: string, maxLength = 1_024): string {
  return value
    .replaceAll(/[\r\n]/g, '')
    .replace(CONTROL_CHARS, '')
    .slice(0, maxLength);
}

/**
 * Normalize a URL path for matching.
 *
 * Percent-decoding happens *before* traversal removal, because `%2e%2e%2f` is `../` and a matcher
 * that checks the raw string sees neither. Decoding is single-pass on purpose: repeatedly
 * decoding until stable turns `%25%32%65` into `.` and makes the platform *more* permissive than
 * the server it is protecting.
 */
export function normalizePath(path: string): string {
  let decoded = path;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    // A malformed escape sequence is itself suspicious; keep the raw value and let the traversal
    // and control-character checks below see it.
  }

  const withoutControl = decoded.replace(CONTROL_CHARS, '').replaceAll('\\', '/');
  const segments: string[] = [];
  for (const segment of withoutControl.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  return `/${segments.join('/')}`;
}

/**
 * The route a request path names, for matching a rule against it.
 *
 * A request target may be absolute-form (`POST http://host/login`), carry a query or fragment,
 * differ in case, repeat or trail slashes, percent-encode letters or contain dot segments.
 * Frameworks route several of those spellings to the same handler (Express, for one, ignores case
 * and a trailing slash), so a rule that compares the raw string can be stepped around by
 * respelling the path. This answers one lowercase, slash-collapsed, decoded path for all of them,
 * so a rule matched against it holds for every spelling. Spellings the server itself would not
 * route are mapped onto the route too, which only ever counts more requests, never fewer.
 */
export function canonicalRoutePath(path: string): string {
  let target = path;
  const scheme = /^[a-z][a-z0-9+.-]*:\/\/[^/?#]*/i.exec(target);
  if (scheme) target = target.slice(scheme[0].length);
  const end = target.search(/[?#]/);
  if (end !== -1) target = target.slice(0, end);
  return normalizePath(target).toLowerCase();
}

/** True when a path tried to escape its root before normalization flattened it. */
export function hasTraversal(path: string): boolean {
  let decoded = path;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    return true;
  }
  return /(^|[/\\])\.\.([/\\]|$)/.test(decoded);
}

/**
 * Bound a string before it is stored or logged.
 *
 * Every field that reaches the platform from a client goes through this. Unbounded strings are a
 * denial-of-service primitive against anything that hashes, indexes or serialises them.
 */
export function bounded(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : value.slice(0, maxLength);
}

/**
 * Escape a string for inclusion in HTML.
 *
 * Present because a notification template renders one, not as a general-purpose sanitiser. Do not
 * use it to make attacker-controlled markup safe — that needs a real sanitiser with a parser.
 */
export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * Validate a redirect target against an allow-list of origins.
 *
 * Open redirects are how a phishing link borrows a trusted domain, and how an OAuth code gets
 * delivered to the wrong place. Relative paths are allowed (they cannot leave the origin);
 * protocol-relative `//evil.test` is not, because it looks relative and is not.
 */
export function safeRedirect(
  target: string,
  allowedOrigins: readonly string[],
  fallback = '/',
): string {
  const value = normalizeText(target);
  if (value === '') return fallback;
  if (value.startsWith('//') || value.includes('\\')) return fallback;
  if (value.startsWith('/')) return value;

  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return fallback;
    return allowedOrigins.includes(url.origin) ? url.toString() : fallback;
  } catch {
    return fallback;
  }
}
