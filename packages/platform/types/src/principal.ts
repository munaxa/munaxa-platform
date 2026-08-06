import type { ClientId, DeviceId, SessionId, TenantId, UserId } from './ids.js';

/**
 * Who is acting.
 *
 * A principal is not always a person: background jobs, service accounts and API keys all
 * authenticate, all get audited and all get authorized through the same path. Keeping them in
 * one union is what stops "machine calls" from quietly bypassing the checks humans go through.
 */
export type PrincipalKind = 'user' | 'service' | 'api-key' | 'system' | 'anonymous';

export interface BasePrincipal {
  readonly kind: PrincipalKind;
  readonly tenantId: TenantId;
  /** Permission strings already resolved for this principal, if the caller resolved them. */
  readonly permissions?: readonly string[];
  readonly roles?: readonly string[];
  /** Additional verified claims (from an OIDC token, an API key record, …). */
  readonly claims?: Readonly<Record<string, unknown>>;
}

export interface UserPrincipal extends BasePrincipal {
  readonly kind: 'user';
  readonly userId: UserId;
  readonly sessionId?: SessionId;
  readonly deviceId?: DeviceId;
  /** How this principal proved identity in the current context. */
  readonly authMethods?: readonly AuthMethod[];
  /** True when a second factor was satisfied in this session. */
  readonly mfaSatisfied?: boolean;
}

export interface ServicePrincipal extends BasePrincipal {
  readonly kind: 'service';
  readonly clientId: ClientId;
  readonly scopes: readonly string[];
}

export interface ApiKeyPrincipal extends BasePrincipal {
  readonly kind: 'api-key';
  readonly keyId: string;
  readonly scopes: readonly string[];
  /** The user or service the key acts on behalf of, when it is delegated. */
  readonly onBehalfOf?: UserId;
}

/** Internal platform work — migrations, schedulers, break-glass. Always audited. */
export interface SystemPrincipal extends BasePrincipal {
  readonly kind: 'system';
  readonly component: string;
}

export interface AnonymousPrincipal extends BasePrincipal {
  readonly kind: 'anonymous';
}

export type Principal =
  UserPrincipal | ServicePrincipal | ApiKeyPrincipal | SystemPrincipal | AnonymousPrincipal;

export type AuthMethod =
  | 'password'
  | 'passkey'
  | 'webauthn'
  | 'totp'
  | 'email-otp'
  | 'sms-otp'
  | 'recovery-code'
  | 'oidc'
  | 'saml'
  | 'firebase'
  | 'azure-ad'
  | 'google'
  | 'microsoft'
  | 'api-key'
  | 'client-credentials'
  | 'device-trust'
  | 'impersonation';

export function anonymous(tenantId: TenantId): AnonymousPrincipal {
  return { kind: 'anonymous', tenantId };
}

export function isAuthenticated(principal: Principal): boolean {
  return principal.kind !== 'anonymous';
}

/** The stable subject identifier used in logs, audit records and token `sub` claims. */
export function principalSubject(principal: Principal): string {
  switch (principal.kind) {
    case 'user':
      return principal.userId;
    case 'service':
      return `service:${principal.clientId}`;
    case 'api-key':
      return `apikey:${principal.keyId}`;
    case 'system':
      return `system:${principal.component}`;
    case 'anonymous':
      return 'anonymous';
  }
}
