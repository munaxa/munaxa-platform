# API reference

The public surface of each package. Every package exports from its root; there are no deep imports.

Types are the source of truth — this is a map, not a substitute for reading the `.d.ts`.

---

## @munaxa/types

**Identifiers** — `TenantId`, `UserId`, `SessionId`, `DeviceId`, `CorrelationId`, `RoleId`,
`TokenFamilyId`, `ClientId`, `AuditEventId`. Branded strings; construct with `toTenantId()`,
`toUserId()`, … (validating) or `unsafeId<T>()` (for values already known good).
`ROOT_TENANT_ID` is the tenant a single-tenant deployment runs as.

**Errors** — `PlatformError`, `platformError(code, message?, options?)`, `isPlatformError()`,
`ERROR_CODES`. `toPublicJSON()` is the only representation that may cross the network.

**Time** — `Clock`, `systemClock`, `FixedClock`, `parseDuration('15m')`, `isExpired()`, plus
`SECOND`/`MINUTE`/`HOUR`/`DAY`.

**Principals** — `Principal` (`user` | `service` | `api-key` | `system` | `anonymous`),
`principalSubject()`, `isAuthenticated()`, `anonymous()`, `AuthMethod`.

**Context** — `SecurityContext`, `TenantContext`, `withPrincipal()`, `assertSameTenant()`,
`TenantMismatchError`.

**Events** — `SECURITY_EVENTS` (closed vocabulary), `SecurityEvent`, `severityFor()`,
`isSecurityEventName()`.

**HTTP** — `PlatformRequest`, `PlatformResponse`, `PlatformMiddleware`, `composeMiddleware()`,
`emptyResponse()`, `header()`, `CookieOptions`.

**Results and pages** — `Result<T, E>`, `ok()`, `err()`, `unwrap()`, `Page<T>`,
`normalizePageRequest()`.

---

## @munaxa/interfaces

Ports only, plus `PORTS` (the token table), `ServiceRegistry`, `createToken()` and
`REQUIRED_AUTH_PORTS`.

| Port | Implemented by the platform as |
| --- | --- |
| `CachePort`, `CounterPort`, `LockPort` | `MemoryCache`, `RedisCache`, `FixedWindowCounter`, `SlidingWindowCounter`, `CacheLock` |
| `LoggerPort`, `MetricsPort` | `StructuredLogger`, `MemoryLogger`, `nullLogger`, `MemoryMetrics` |
| `AuditSinkPort`, `AuditRepositoryPort`, `AuditExporterPort` | `MemoryAuditRepository`, `LoggingAuditSink`, `BatchingSink`, `NdjsonExporter`, `CsvExporter`, `WebhookExporter` |
| `UserDirectoryPort`, `PasswordHistoryPort`, `BreachRegistryPort`, `MfaEnrollmentStorePort` | `MemoryUserDirectory`, `MemoryPasswordHistory`, `StaticBreachRegistry`, `MemoryMfaEnrollmentStore` |
| `SessionStorePort`, `DeviceRegistryPort` | `MemorySessionStore`, `MemoryDeviceRegistry` |
| `RefreshTokenStorePort`, `ResetTokenStorePort`, `ApiKeyStorePort`, `SigningKeyPort` | `MemoryRefreshTokenStore`, `MemoryResetTokenStore`, `MemoryApiKeyStore` |
| `RoleRepositoryPort`, `RoleAssignmentPort` | `MemoryRoleRepository`, `MemoryRoleAssignments` |
| `NotificationTransportPort`, `TemplateRendererPort` | `MemoryTransport`, `LoggingTransport`, `NullTransport`, `TenantRoutingTransport`, `TemplateRegistry` |
| `SecretsPort`, `FeatureFlagPort`, `TenantConfigPort` | `EnvSecrets`, `CachingSecrets`, `StaticSecrets`, `FeatureFlags`, `LayeredConfig` |
| `IdentityProviderPort`, `HttpClientPort`, `RandomPort`, `IdGeneratorPort` | `OidcProvider`, `SamlProviderPlaceholder` |

---

## @munaxa/crypto

- **Passwords** — `ScryptPasswordHasher`, `PasswordHasherRegistry` (dispatches by hash prefix, for
  migrating off bcrypt/argon2), `defaultPasswordHasher`, `dummyPasswordHash()`,
  `DEFAULT_SCRYPT_PARAMS`.
- **Random** — `secureBytes()`, `secureToken()`, `secureHex()`, `secureInt()`, `uuid()`,
  `numericCode()`, `recoveryCode()`, `sortableId()`, `prefixedId()`.
- **Hashing** — `sha256()`, `sha256Hex()`, `sha512Hex()`, `sha1HexUpper()` (breach corpus only),
  `hmacSha256()`, `constantTimeEqual()`, `constantTimeEqualBytes()`, `tokenFingerprint()`.
- **Encryption** — `encrypt()`, `decrypt()`, `decryptToString()`, `reencrypt()`,
  `needsReencryption()`, `envelopeKid()`, `deriveKey()`. AES-256-GCM; envelope
  `v1.<kid>.<nonce>.<ciphertext>.<tag>`.
- **Keys** — `KeyRing` (`rotate`, `retire`, `deriveKid`), `KeyMaterial`.
- **Signing** — `HmacSigner`, `AsymmetricSigner` (RS256/ES256), `signValue()`,
  `verifySignedValue()`, `Signature`, `Signer`.
- **Encoding** — `toBase64Url()`, `fromBase64Url()`, `toHex()`, `fromHex()`, `utf8()`.

---

## @munaxa/config

- **Schema** — `parseConfig(schema, source)`, `redactConfig()`, and the field builders `string()`,
  `secret()`, `integer()`, `port()`, `boolean()`, `duration()`, `url()`, `oneOf()`, `list()`.
- **Platform schema** — `PLATFORM_SCHEMA`, `TENANT_OVERRIDABLE`, `isTenantOverridable()`.
- **Secrets** — `EnvSecrets`, `CachingSecrets`, `StaticSecrets`, `Secret` (redacts in `toString`,
  `JSON.stringify` and `util.inspect`).
- **Flags** — `FeatureFlags`, `bucketOf()`. Unknown flags are off.
- **Tenancy** — `LayeredConfig` (`resolve`, `originOf`), `TenantRegistry`, `TenantRecord`.

---

## @munaxa/cache

- `MemoryCache` — TTL, LRU bound, lazy plus sampled expiry, no timers.
- `RedisCache` — over a locally declared `RedisLike`; SCAN, never KEYS.
- `NamespacedCache` / `namespaced()` / `forTenant()` — structural key scoping.
- `TieredCache` — near + far, with counters bypassing the near tier.
- `TypedCache<T>` — typed view with `getOrLoad` (never caches absence).
- `FixedWindowCounter`, `SlidingWindowCounter`, `TokenBucket` (`consume`, `enforcement`).
- `MemoryCache.compareAndSet()` — optional `CachePort` member; `TokenBucket` degrades without it.
- `CacheLock`, `withLock()` — leased, fenced, non-blocking by default.

---

## @munaxa/logging

- `StructuredLogger`, `MemoryLogger`, `nullLogger`.
- `Redactor`, `defaultRedactor`, `DEFAULT_REDACTED_KEYS`, `REDACTED`, `mask()`, `maskEmail()`.
- `withCorrelation()`, `currentCorrelation()`, `currentCorrelationId()`, `newCorrelationId()`,
  `resolveCorrelationId()`, `sanitizeCorrelationId()`, `CORRELATION_HEADER`, `REQUEST_ID_HEADER`.
- `logSecurityEvent()`, `logSecurityNotice()`, `timed()`, `requestFields()`, `MemoryMetrics`.

---

## @munaxa/audit

- `AuditService` — `record(context, input)`, `write(event)`, `flush()`, `failureCount`,
  `conflictCount`. Requires `repository: AuditRepositoryPort`; `sinks` are optional mirrors.
- `verifyChain(records, { formats?, from? })` → `{ valid, checked }` when intact; on a failure also
  `code`, `reason`, `brokenAt`, `brokenAtId`, and the pair belonging to that `code`
  (`expectedHash`/`actualHash`, `expectedPreviousHash`/`actualPreviousHash`, `expectedSequence`).
  `from?: ChainHead | null` continues a walk from a head established elsewhere — a signed
  checkpoint, or the last record of the previous batch; absent or `null` means genesis.
  `code` is `SEQUENCE_GAP | LINK_MISMATCH | DIGEST_MISMATCH | UNKNOWN_FORMAT | MISSING_IDENTIFIER`.
  Also `canonicalize()`.
- `auditEvent()`, `anonymousAuditEvent()`, `actorOf()`, `sourceOf()`, `NON_SUPPRESSIBLE_EVENTS`.
- `MemoryAuditRepository`, `LoggingAuditSink`, `BatchingSink`.
- `NdjsonExporter`, `CsvExporter` (formula-guarded), `WebhookExporter`.
- `withAudit()`, `Audited()`, `auditMiddleware()`, `defaultClassifier()`.

---

## @munaxa/rbac

- **Permissions** — `hasPermission()`, `hasAllPermissions()`, `hasAnyPermission()`, `grantCovers()`,
  `normalizeGrants()`, `assertValidGrant()`, `assertValidCheck()`, `InvalidPermissionError`.
  Wildcards are legal in a grant, never in a check.
- **Roles** — `RoleHierarchy` (cycle-rejecting DAG, memoised `effectivePermissions`), `defaultRoles()`
  (`viewer`, `member`, `auditor`, `admin`, `owner`), `isAssignmentActive()`.
- **Resolution** — `PermissionResolver` (`resolve`, `invalidateUser`, `invalidateTenant`, `hierarchy`).
- **Policies** — `PolicyEngine` (deny-overrides), `conditions` (`isOwner`, `mfaSatisfied`,
  `riskAtMost`, `isMachine`, `resourceAttribute`), `BASELINE_POLICIES`.
- **Guards** — `Authorizer` (`check`, `require`), `requirePermissions()`, `RequirePermissions()`,
  `authorizationMiddleware()` (fail-closed by default).
- **Stores** — `MemoryRoleRepository`, `MemoryRoleAssignments`.

---

## @munaxa/session

- `SessionManager` — `create`, `validate`, `touch`, `listActive`, `revoke`, `revokeAllForUser`,
  `revokeDevice`, `isFreshEnoughForSensitiveAction`, `purgeExpired`, `policy`, `limitEnforcement`.
- `SessionPolicy`, `DEFAULT_SESSION_POLICY`, `SESSION_POLICY_CEILING`, `clampSessionPolicy()`.
- `DeviceService` — `recognize`, `trust`, `untrust`, `untrustAll`, `isTrusted`, `list`, `forget`;
  `fingerprint()`.
- `toPublicSession()` — masks the address, bounds the user agent.
- `MemorySessionStore`, `MemoryDeviceRegistry`.

---

## @munaxa/security

- **Headers** — `securityHeaders()` → `{ headers, nonce }`, `apiSecurityHeaders()`, `DEFAULT_CSP`,
  `DEFAULT_PERMISSIONS_POLICY`, `renderCsp()`, `renderPermissionsPolicy()`, `cspNonce()`.
- **CSRF** — `CsrfProtection` (`issue`, `verify`, `check`, `isSafeMethod`), `isTrustedOrigin()`.
- **Rate limiting** — `RateLimiter` (`check`, `reset`), `RateLimitRule`,
  `BASELINE_RATE_LIMIT_RULES`, `targetFor()`, `rateLimitHeaders()`.
- **Risk** — `RiskEngine`, `RiskSignal`, `DEFAULT_RISK_SIGNALS` (`new-device`, `impossible-travel`,
  `recent-failures`, `distinct-accounts-from-ip`, `automation-client`).
- **Threats** — `scanForThreats()`, `inspectPath()`, `threatScore()`, `ThreatKind`.
- **Normalization** — `normalizeText()`, `normalizeEmail()`, `normalizeIdentifier()`,
  `normalizePhone()`, `normalizeHeaderValue()`, `normalizePath()`, `hasTraversal()`, `bounded()`,
  `escapeHtml()`, `safeRedirect()`.
- **Pipeline** — `securityPipeline()`.

---

## @munaxa/notifications

- `NotificationService` — `send()`, `registerTransport()`, `channels`, `distributed`. Refuses any payload with a
  credential-shaped field (`SecretLeakError`); critical messages bypass deduplication and throw when
  no transport exists.
- `TemplateRegistry`, `NotificationTemplate`, `SECURITY_TEMPLATES` (password changed, reset
  requested, new device, MFA enabled/disabled, account locked, email OTP).
- `MemoryTransport`, `LoggingTransport`, `NullTransport`, `TenantRoutingTransport`.

---

## @munaxa/auth

- **Policy** — `PasswordPolicyService` (`validate`, `assertValid`, `isBreached`, `policy`),
  `DEFAULT_PASSWORD_POLICY`, `PASSWORD_POLICY_FLOOR`, `clampPasswordPolicy()`, `strengthOf()`.
- **Login** — `LoginService` (`authenticate`, `changePassword`, `failureCount`), `LoginOutcome`
  (`authenticated` | `mfa-required` | `password-change-required`).
- **Tokens** — `TokenService` (`issueAccessToken`, `verifyAccessToken`, `decodeUnsafe`),
  `RefreshTokenService` (`issue`, `rotate`, `revoke`, `revokeFamily`, `revokeAllForUser`,
  `inspect`), `AccessTokenClaims`, `hmacSignerFromSecret()`.
- **Reset** — `PasswordResetService` (`request`, `inspect`, `complete`, `revokeAll`).
- **MFA** — `MfaService` (`replayGuard`, `distributed`), `OtpService` (`issue`/`verify`/`get` are
  async; `cache`, `distributed`), `generateTotpSecret()`, `totpCode()`, `verifyTotp()`, `totpUri()`.
- **Machine** — `ApiKeyService` (`create`, `verify`, `revoke`, `list`), `ServiceAccountService`,
  `parseApiKey()`, `isAllowedAddress()`.
- **Providers** — `OidcProvider`, `providerPresets` (`google`, `microsoft`, `azureAd`, `firebase`),
  `SamlProviderPlaceholder`, `IdentityProviderRegistry`, `decodeIdTokenClaims()`.
- **HTTP** — `sessionCookie()`, `refreshCookie()`, `clearCookie()`, `bearerToken()`,
  `credentialFrom()`, `requireAuth()`, `requireMfa()`, `RequireAuth()`, `SESSION_COOKIE`,
  `REFRESH_COOKIE`.
- **Stores** — `MemoryUserDirectory`, `MemoryPasswordHistory`, `StaticBreachRegistry`,
  `MemoryRefreshTokenStore`, `MemoryResetTokenStore`, `MemoryApiKeyStore`,
  `MemoryMfaEnrollmentStore`, `COMMON_BREACHED_PASSWORDS`.

---

## @munaxa/conformance

The executable specification of every port. Depends on no test framework — the runner is a
parameter — so it runs under vitest, jest or node's own.

- `runCacheConformance()`, `runAuditConformance()`, `runRefreshTokenConformance()`,
  `runResetTokenConformance()`, `runSessionConformance()`.
- `TestHarness`, `ExpectFn` — the `{ describe, it, expect }` shape each suite takes.
- `tick()`, `race()`, `Seeded` — the interleaving helpers. `Seeded` is a deterministic xorshift, so
  a failing ordering reproduces instead of becoming a flake.

See the [adapter guide](./adapter-guide.md).
