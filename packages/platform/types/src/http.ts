/**
 * A minimal HTTP shape the platform's middleware speaks.
 *
 * The platform ships no Express, Fastify or Nest types. Everything that touches a request works
 * against these structures, and each product supplies a twenty-line adapter for its framework.
 * That is the whole of "framework agnostic where practical": one narrow shape, adapted once,
 * instead of a dependency on a web framework in a security library.
 */

export interface PlatformRequest {
  readonly method: string;
  /** Path only, no query string. Used for endpoint matching. */
  readonly path: string;
  /** Lowercased header names. Multi-value headers arrive joined with ', '. */
  readonly headers: Readonly<Record<string, string | undefined>>;
  readonly query?: Readonly<Record<string, string | string[] | undefined>>;
  readonly cookies?: Readonly<Record<string, string | undefined>>;
  /** Already-parsed body, when the framework parsed one. */
  readonly body?: unknown;
  /** Client address as resolved by the trusted edge, not the raw socket. */
  readonly ipAddress?: string;
  readonly protocol?: 'http' | 'https';
  readonly host?: string;
}

export interface PlatformResponse {
  status: number;
  headers: Record<string, string>;
  cookies: CookieInstruction[];
  body?: unknown;
}

export interface CookieInstruction {
  readonly name: string;
  readonly value: string;
  readonly options: CookieOptions;
}

export interface CookieOptions {
  readonly httpOnly?: boolean;
  readonly secure?: boolean;
  readonly sameSite?: 'strict' | 'lax' | 'none';
  readonly path?: string;
  readonly domain?: string;
  readonly maxAgeSeconds?: number;
  readonly expires?: Date;
  readonly partitioned?: boolean;
}

/** A middleware step. Returning a response short-circuits the chain. */
export type PlatformMiddleware = (
  request: PlatformRequest,
  response: PlatformResponse,
) => Promise<PlatformResponse | void> | PlatformResponse | void;

export function emptyResponse(): PlatformResponse {
  return { status: 200, headers: {}, cookies: [] };
}

/** Case-insensitive header read; callers should never index `headers` directly. */
export function header(request: PlatformRequest, name: string): string | undefined {
  return request.headers[name.toLowerCase()];
}

/**
 * Run middleware in order, stopping at the first one that produces a response.
 *
 * Order is the security property here: normalization before detection, rate limiting before
 * authentication, authentication before authorization. `composeMiddleware` keeps that order
 * explicit at the call site instead of buried in framework registration.
 */
export function composeMiddleware(...steps: readonly PlatformMiddleware[]): PlatformMiddleware {
  return async (request, response) => {
    for (const step of steps) {
      const result = await step(request, response);
      if (result) return result;
    }
    return undefined;
  };
}
