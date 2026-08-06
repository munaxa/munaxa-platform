import { createHash } from 'node:crypto';
import type {
  AuthorizationCallback,
  AuthorizationRedirect,
  AuthorizationRequest,
  ExternalIdentity,
  HttpClientPort,
  IdentityProviderPort,
} from '@munaxa/interfaces';
import { PlatformError } from '@munaxa/types';
import { constantTimeEqual, fromBase64Url, secureToken, toBase64Url } from '@munaxa/crypto';

/**
 * External identity providers.
 *
 * One `IdentityProviderPort` covers OIDC, SAML, Firebase, Azure AD, Google and Microsoft, because
 * every one of them reduces to the same two steps: send the browser somewhere, then turn what
 * comes back into a verified identity. Products get a registry rather than six integrations.
 *
 * The OIDC implementation below is the one the platform ships, and it is strict about the four
 * things that go wrong in practice: PKCE is mandatory, `state` is compared in constant time, the
 * nonce is bound to the id token, and the token endpoint is called server-side so the code is
 * never exchanged in a browser.
 */
export interface OidcProviderConfig {
  readonly id: string;
  readonly issuer: string;
  readonly authorizationEndpoint: string;
  readonly tokenEndpoint: string;
  readonly jwksUri?: string;
  readonly clientId: string;
  readonly clientSecret?: string;
  readonly scopes?: readonly string[];
  /** Claim carrying the group or role list, when the provider supplies one. */
  readonly groupsClaim?: string;
  readonly kind?: ExternalIdentityKind;
}

export type ExternalIdentityKind = IdentityProviderPort['kind'];

export class OidcProvider implements IdentityProviderPort {
  readonly id: string;
  readonly kind: ExternalIdentityKind;
  readonly #config: OidcProviderConfig;
  readonly #http: HttpClientPort;

  constructor(config: OidcProviderConfig, http: HttpClientPort) {
    this.id = config.id;
    this.kind = config.kind ?? 'oidc';
    this.#config = config;
    this.#http = http;
  }

  async beginAuthorization(request: AuthorizationRequest): Promise<AuthorizationRedirect> {
    // PKCE is not optional here even though the spec calls it optional for confidential clients:
    // it costs one hash and it removes authorization-code interception entirely.
    const codeVerifier = secureToken(32);
    const codeChallenge = toBase64Url(createHash('sha256').update(codeVerifier).digest());
    const state = request.state ?? secureToken(16);
    const nonce = secureToken(16);

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.#config.clientId,
      redirect_uri: request.redirectUri,
      scope: (request.scopes ?? this.#config.scopes ?? ['openid', 'email', 'profile']).join(' '),
      state,
      nonce,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      ...(request.loginHint === undefined ? {} : { login_hint: request.loginHint }),
      ...(request.prompt === undefined ? {} : { prompt: request.prompt }),
    });

    return {
      url: `${this.#config.authorizationEndpoint}?${params.toString()}`,
      state,
      codeVerifier,
      nonce,
    };
  }

  async completeAuthorization(callback: AuthorizationCallback): Promise<ExternalIdentity> {
    const error = callback.params.error;
    if (error) {
      throw new PlatformError(`Identity provider returned ${error}`, {
        code: 'AUTH_PROVIDER_ERROR',
      });
    }

    const state = callback.params.state;
    // Constant-time, because `state` is the CSRF defence for the callback and comparing it with
    // `===` leaks its prefix to anyone who can time the endpoint.
    if (!state || !constantTimeEqual(state, callback.expectedState)) {
      throw new PlatformError('Authorization state mismatch', { code: 'AUTH_PROVIDER_ERROR' });
    }

    const code = callback.params.code;
    if (!code) {
      throw new PlatformError('Authorization response carried no code', {
        code: 'AUTH_PROVIDER_ERROR',
      });
    }

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: callback.redirectUri,
      client_id: this.#config.clientId,
      ...(this.#config.clientSecret === undefined
        ? {}
        : { client_secret: this.#config.clientSecret }),
      ...(callback.codeVerifier === undefined ? {} : { code_verifier: callback.codeVerifier }),
    });

    const response = await this.#http.request({
      method: 'POST',
      url: this.#config.tokenEndpoint,
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: body.toString(),
      timeoutMs: 10_000,
    });

    if (response.status >= 300) {
      // The provider's body may contain the client secret it was sent back; it is not surfaced.
      throw new PlatformError(`Token exchange failed with status ${response.status}`, {
        code: 'AUTH_PROVIDER_ERROR',
      });
    }

    let payload: { id_token?: string; access_token?: string };
    try {
      payload = JSON.parse(response.body) as { id_token?: string; access_token?: string };
    } catch {
      throw new PlatformError('Token endpoint returned a malformed response', {
        code: 'AUTH_PROVIDER_ERROR',
      });
    }
    if (!payload.id_token) {
      throw new PlatformError('Token endpoint returned no id token', {
        code: 'AUTH_PROVIDER_ERROR',
      });
    }

    const claims = decodeIdTokenClaims(payload.id_token);

    if (claims.iss !== this.#config.issuer) {
      throw new PlatformError('Id token issuer mismatch', { code: 'AUTH_PROVIDER_ERROR' });
    }
    if (!audienceMatches(claims.aud, this.#config.clientId)) {
      throw new PlatformError('Id token audience mismatch', { code: 'AUTH_PROVIDER_ERROR' });
    }
    // The nonce is what ties this id token to the authorization request this browser started; a
    // replayed token from another session fails here.
    if (callback.nonce !== undefined && claims.nonce !== callback.nonce) {
      throw new PlatformError('Id token nonce mismatch', { code: 'AUTH_PROVIDER_ERROR' });
    }

    const groups = this.#config.groupsClaim ? claims[this.#config.groupsClaim] : undefined;

    return {
      provider: this.id,
      subject: asText(claims.sub) ?? '',
      claims,
      ...(asText(claims.email) === undefined ? {} : { email: asText(claims.email) as string }),
      ...(claims.email_verified === undefined
        ? {}
        : { emailVerified: Boolean(claims.email_verified) }),
      ...(asText(claims.name) === undefined ? {} : { displayName: asText(claims.name) as string }),
      ...(Array.isArray(groups) ? { groups: groups.map(String) } : {}),
      ...(claims.amr === undefined ? {} : { mfaSatisfied: assertsMfa(claims.amr) }),
    };
  }
}

/**
 * Read an id token's claims *without* verifying its signature.
 *
 * Safe only because the token arrived over TLS directly from the provider's token endpoint in the
 * step above — never from the browser. A token that reached us any other way must have its
 * signature verified against the provider's JWKS first, and `jwksUri` is on the config for a
 * product that needs the implicit or hybrid flow.
 */
export function decodeIdTokenClaims(idToken: string): Record<string, unknown> {
  const payload = idToken.split('.')[1];
  if (!payload) {
    throw new PlatformError('Malformed id token', { code: 'AUTH_PROVIDER_ERROR' });
  }
  try {
    return JSON.parse(fromBase64Url(payload).toString('utf8')) as Record<string, unknown>;
  } catch {
    throw new PlatformError('Malformed id token', { code: 'AUTH_PROVIDER_ERROR' });
  }
}

/** Claims arrive as `unknown`; anything that is not already a primitive is not a name or an id. */
function asText(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return undefined;
}

function audienceMatches(aud: unknown, clientId: string): boolean {
  if (typeof aud === 'string') return aud === clientId;
  if (Array.isArray(aud)) return aud.includes(clientId);
  return false;
}

function assertsMfa(amr: unknown): boolean {
  const methods = Array.isArray(amr) ? amr.map(String) : [];
  return methods.some((method) => ['mfa', 'otp', 'hwk', 'swk', 'fpt', 'face'].includes(method));
}

/**
 * Pre-filled configurations for the providers the ecosystem uses.
 *
 * They are functions rather than constants because each needs a tenant or a client id, and
 * because a wrong endpoint URL copied between products is exactly the sort of thing that should
 * be fixed in one place.
 */
export const providerPresets = {
  google(clientId: string, clientSecret: string): OidcProviderConfig {
    return {
      id: 'google',
      kind: 'google',
      issuer: 'https://accounts.google.com',
      authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenEndpoint: 'https://oauth2.googleapis.com/token',
      jwksUri: 'https://www.googleapis.com/oauth2/v3/certs',
      clientId,
      clientSecret,
      scopes: ['openid', 'email', 'profile'],
    };
  },

  microsoft(tenant: string, clientId: string, clientSecret: string): OidcProviderConfig {
    return {
      id: 'microsoft',
      kind: 'microsoft',
      issuer: `https://login.microsoftonline.com/${tenant}/v2.0`,
      authorizationEndpoint: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`,
      tokenEndpoint: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
      jwksUri: `https://login.microsoftonline.com/${tenant}/discovery/v2.0/keys`,
      clientId,
      clientSecret,
      scopes: ['openid', 'email', 'profile'],
    };
  },

  azureAd(tenant: string, clientId: string, clientSecret: string): OidcProviderConfig {
    return {
      ...providerPresets.microsoft(tenant, clientId, clientSecret),
      id: 'azure-ad',
      kind: 'azure-ad',
      // Azure emits group object ids here; products map them to platform roles.
      groupsClaim: 'groups',
    };
  },

  firebase(projectId: string, clientId: string): OidcProviderConfig {
    return {
      id: 'firebase',
      kind: 'firebase',
      issuer: `https://securetoken.google.com/${projectId}`,
      authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenEndpoint: 'https://securetoken.googleapis.com/v1/token',
      jwksUri:
        'https://www.googleapis.com/service_accounts/v1/metadata/x509/securetoken@system.gserviceaccount.com',
      clientId,
      scopes: ['openid', 'email'],
    };
  },
} as const;

/**
 * SAML, declared and not implemented.
 *
 * The port fits SAML's POST binding, and this class exists so a product can register a SAML
 * provider today and get a clear error rather than discovering at integration time that the
 * abstraction does not accommodate it. Implementing it properly means XML canonicalisation and
 * signature verification, which needs a vetted library rather than a hand-rolled parser — XML
 * signature wrapping is a decades-old family of bypasses and nothing about it should be
 * improvised. See docs/security-platform/extension-guide.md.
 */
export class SamlProviderPlaceholder implements IdentityProviderPort {
  readonly kind = 'saml' as const;

  constructor(readonly id: string) {}

  async beginAuthorization(): Promise<AuthorizationRedirect> {
    throw new PlatformError(
      'SAML is not implemented in the platform yet. The port is stable; supply an implementation backed by a vetted XML-signature library.',
      { code: 'AUTH_PROVIDER_ERROR' },
    );
  }

  async completeAuthorization(): Promise<ExternalIdentity> {
    throw new PlatformError('SAML is not implemented in the platform yet.', {
      code: 'AUTH_PROVIDER_ERROR',
    });
  }
}

/** The registry a product wires its configured providers into. */
export class IdentityProviderRegistry {
  readonly #providers = new Map<string, IdentityProviderPort>();

  register(provider: IdentityProviderPort): this {
    this.#providers.set(provider.id, provider);
    return this;
  }

  get(id: string): IdentityProviderPort {
    const provider = this.#providers.get(id);
    if (!provider) {
      throw new PlatformError(`Unknown identity provider ${id}`, { code: 'AUTH_PROVIDER_ERROR' });
    }
    return provider;
  }

  has(id: string): boolean {
    return this.#providers.has(id);
  }

  list(): readonly IdentityProviderPort[] {
    return [...this.#providers.values()];
  }
}
