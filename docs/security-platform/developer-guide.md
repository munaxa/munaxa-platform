# Developer guide

Wiring a product from nothing to a working, audited login.

## 1. Depend on what you need

```jsonc
// package.json
"dependencies": {
  "@munaxa/auth": "workspace:^",
  "@munaxa/rbac": "workspace:^",
  "@munaxa/security": "workspace:^",
  "@munaxa/audit": "workspace:^"
}
```

That transitively brings `session`, `crypto`, `logging`, `interfaces` and `types`. No third-party
runtime dependency arrives with them.

## 2. Parse the environment first

```ts
import { PLATFORM_SCHEMA, parseConfig, redactConfig } from '@munaxa/config';

// Throws at startup, listing every problem at once, rather than failing on the first request
// that happens to read a missing value.
export const config = parseConfig(
  { ...PLATFORM_SCHEMA, DATABASE_URL: string() },
  process.env,
);

logger.info('config.loaded', redactConfig(PLATFORM_SCHEMA, config));
```

The two required variables are `MUNAXA_SIGNING_SECRET` and `MUNAXA_ENCRYPTION_KEY`. Everything else
has a hardened default.

## 3. Implement the ports you are backing with your database

Each is small. `UserDirectoryPort` is the one that matters most:

```ts
import type { CredentialRecord, UserDirectoryPort } from '@munaxa/interfaces';
import type { TenantId, UserId } from '@munaxa/types';

export class PrismaUserDirectory implements UserDirectoryPort {
  constructor(private readonly db: PrismaClient) {}

  async findByIdentifier(tenantId: TenantId, identifier: string) {
    const user = await this.db.user.findFirst({
      where: { tenantId, email: identifier.toLowerCase() },
    });
    return user ? this.toCredential(user) : undefined;
  }

  async findById(tenantId: TenantId, userId: UserId) {
    const user = await this.db.user.findFirst({ where: { tenantId, id: userId } });
    return user ? this.toCredential(user) : undefined;
  }

  async updatePasswordHash(tenantId: TenantId, userId: UserId, passwordHash: string) {
    await this.db.user.updateMany({
      where: { tenantId, id: userId },
      data: { passwordHash, passwordUpdatedAt: new Date(), mustChangePassword: false },
    });
  }

  async incrementTokenVersion(tenantId: TenantId, userId: UserId) {
    const [updated] = await this.db.$transaction([
      this.db.user.update({
        where: { tenantId_id: { tenantId, id: userId } },
        data: { tokenVersion: { increment: 1 } },
      }),
    ]);
    return updated.tokenVersion;
  }

  async setStatus(tenantId: TenantId, userId: UserId, status: AccountStatus) {
    await this.db.user.updateMany({ where: { tenantId, id: userId }, data: { status } });
  }

  /** The platform's projection of your user row. Nothing else about the user crosses over. */
  private toCredential(user: User): CredentialRecord {
    return {
      userId: user.id as UserId,
      tenantId: user.tenantId as TenantId,
      identifier: user.email,
      passwordHash: user.passwordHash,
      status: user.status,
      tokenVersion: user.tokenVersion,
      mfaEnrolled: user.mfaEnrolled,
    };
  }
}
```

**Every query filters by `tenantId`.** The `MemoryUserDirectory` in `@munaxa/auth` is the reference
for the rest; when in doubt, read it.

## 4. Compose

```ts
import { AuditService, LoggingAuditSink } from '@munaxa/audit';
import { MemoryCache, RedisCache } from '@munaxa/cache';
import { KeyRing, HmacSigner, ScryptPasswordHasher, deriveKey } from '@munaxa/crypto';
import { StructuredLogger } from '@munaxa/logging';
import { Authorizer, PermissionResolver, PolicyEngine, BASELINE_POLICIES } from '@munaxa/rbac';
import { SessionManager } from '@munaxa/session';
import {
  LoginService, PasswordPolicyService, PasswordResetService, RefreshTokenService, TokenService,
} from '@munaxa/auth';

const logger = new StructuredLogger({ service: 'docs-api', environment: config.MUNAXA_ENV });

// One environment secret, several purpose-bound subkeys. Reusing one key across purposes means a
// weakness in any of them is a weakness in all.
const signingRing = new KeyRing({
  kid: config.MUNAXA_KEY_ID,
  key: deriveKey(config.MUNAXA_SIGNING_SECRET, 'jwt'),
});
const fieldRing = new KeyRing({
  kid: config.MUNAXA_KEY_ID,
  key: deriveKey(config.MUNAXA_ENCRYPTION_KEY, 'fields'),
});

const cache = config.MUNAXA_REDIS_URL
  ? new RedisCache(redisClient, { keyPrefix: 'docs:' })
  : new MemoryCache();

const audit = new AuditService({
  // The repository owns the chain: it allocates the sequence and holds the head, so every replica
  // writes into one chain without knowing the others exist.
  repository: new PrismaAuditRepository(db),
  // Sinks are mirrors. A sink failing is counted, never fatal; the append failing fails the request.
  sinks: [new LoggingAuditSink(logger)],
  logger,
});

const hasher = new ScryptPasswordHasher();
const policy = new PasswordPolicyService({
  hasher,
  breachRegistry: new HibpBreachRegistry(fetch),
  history: new PrismaPasswordHistory(db),
  policyFor: (tenantId) => tenantConfig.resolve(tenantId, 'password'),
});

const sessions = new SessionManager({
  store: new PrismaSessionStore(db),
  // Only needed when the store cannot enforce the limit inside its own transaction. With neither,
  // `limitEnforcement` reports 'best-effort' and the limit is a hint — see the log line below.
  locks: new CacheLock(cache),
  policy: {
    idleTimeout: config.MUNAXA_SESSION_IDLE_TIMEOUT,
    absoluteTimeout: config.MUNAXA_SESSION_ABSOLUTE_TIMEOUT,
    maxConcurrent: config.MUNAXA_SESSION_MAX_CONCURRENT,
  },
  onEvent: (event) =>
    audit.write({ /* map the session event onto a SecurityEvent */ } as SecurityEvent),
});

const login = new LoginService({
  directory: new PrismaUserDirectory(db),
  hasher,
  policy,
  cache,
  maxAttempts: config.MUNAXA_LOGIN_MAX_ATTEMPTS,
  lockoutDuration: config.MUNAXA_LOGIN_LOCKOUT,
  onEvent: (event) => auditLoginEvent(audit, event),
});

const tokens = new TokenService({
  signer: new HmacSigner(signingRing),
  issuer: config.MUNAXA_TOKEN_ISSUER,
  audience: config.MUNAXA_TOKEN_AUDIENCE,
  accessTokenTtl: config.MUNAXA_ACCESS_TOKEN_TTL,
});

const refresh = new RefreshTokenService({
  store: new PrismaRefreshTokenStore(db),
  ttl: config.MUNAXA_REFRESH_TOKEN_TTL,
  pepper: config.MUNAXA_SIGNING_SECRET,
  onReuseDetected: async (record) => {
    await sessions.revokeAllForUser(record.tenantId, record.userId, 'token-reuse');
  },
});

// Second factors and one-time codes need somewhere shared to record what has been spent. Without
// these, a stolen TOTP code is worth one sign-in per replica.
const mfa = new MfaService({ store: new PrismaMfaEnrollmentStore(db), replayGuard: cache });
const otp = new OtpService({ cache });

const notifications = new NotificationService({
  transports: [new PostmarkTransport(config.MUNAXA_POSTMARK_TOKEN)],
  templates: new TemplateRegistry(SECURITY_TEMPLATES),
  dedupeStore: cache, // otherwise each replica suppresses only its own repeats
});

const authorizer = new Authorizer({
  resolver: new PermissionResolver({
    roles: new PrismaRoleRepository(db),
    assignments: new PrismaRoleAssignments(db),
    cache,
  }),
  policies: new PolicyEngine([...BASELINE_POLICIES, ...productPolicies]),
  onDecision: (decision, context, input) =>
    decision.allowed
      ? undefined
      : audit.record(context, {
          name: 'authz.permission.denied',
          outcome: 'denied',
          payload: { permission: input.permission },
        }),
});

// Log what you are actually running. The difference between 'store-transaction' and 'best-effort'
// is the difference between a limit and a hint, and the only way to find out in production is to
// have said so at startup.
logger.log('info', 'platform.enforcement', {
  sessions: sessions.limitEnforcement,
  mfaReplay: mfa.distributed,
  notifyDedupe: notifications.distributed,
});
```

## 5. The edge

```ts
import { CsrfProtection, RateLimiter, BASELINE_RATE_LIMIT_RULES, securityPipeline } from '@munaxa/security';

const pipeline = securityPipeline({
  rateLimiter: new RateLimiter({
    cache,
    rules: [...BASELINE_RATE_LIMIT_RULES, ...productRules],
    onDegraded: (error, rule) => metrics.increment('ratelimit.degraded', 1, { rule: rule.id }),
  }),
  csrf: new CsrfProtection({ keyRing: signingRing }),
  trustedOrigins: config.MUNAXA_TRUSTED_ORIGINS,
  resolveTenant: (request) => tenantFromHost(request.host),
  resolveSession: (request) => sessionFromCookie(request),
  scanBodies: true,
  onEvent: (event) => audit.write(edgeEvent(event)),
});
```

Then a twenty-line adapter for your framework. For Express:

```ts
app.use(async (req, res, next) => {
  const platformRequest: PlatformRequest = {
    method: req.method,
    path: req.path,
    headers: req.headers as Record<string, string>,
    query: req.query as Record<string, string>,
    cookies: req.cookies,
    body: req.body,
    ipAddress: req.ip, // Express resolves this from `trust proxy` — set that correctly.
  };

  const response = emptyResponse();
  const short = await pipeline(platformRequest, response);

  for (const [name, value] of Object.entries(response.headers)) res.setHeader(name, value);
  if (short) return res.status(short.status).json(short.body);
  res.locals.cspNonce = (response as { cspNonce?: string }).cspNonce;
  next();
});
```

## 6. Login endpoint

```ts
app.post('/auth/login', async (req, res) => {
  const outcome = await login.authenticate(req.body.email, req.body.password, {
    tenantId: res.locals.tenantId,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
    correlationId: res.locals.correlationId,
  });

  if (outcome.status === 'mfa-required') {
    return res.status(401).json({ code: 'AUTH_MFA_REQUIRED', challenge: await startChallenge(outcome.account) });
  }
  if (outcome.status === 'password-change-required') {
    return res.status(401).json({ code: 'AUTH_PASSWORD_POLICY' });
  }

  const session = await sessions.create({
    tenantId: outcome.account.tenantId,
    userId: outcome.account.userId,
    authMethods: outcome.authMethods,
    mfaSatisfied: false,
    tokenVersion: outcome.account.tokenVersion,
  });

  const access = tokens.issueAccessToken({
    subject: outcome.account.userId,
    tenantId: outcome.account.tenantId,
    tokenVersion: outcome.account.tokenVersion,
    sessionId: session.id,
  });
  const refreshToken = await refresh.issue({
    tenantId: outcome.account.tenantId,
    userId: outcome.account.userId,
    tokenVersion: outcome.account.tokenVersion,
    sessionId: session.id,
  });

  setCookies(res, [sessionCookie(access.token), refreshCookie(refreshToken.token)]);
  res.json({ ok: true });
});
```

Errors thrown by the platform are `PlatformError`. One handler turns them into responses:

```ts
app.use((error, _req, res, _next) => {
  if (isPlatformError(error)) {
    logger.warn('request.failed', { code: error.code, details: error.details });
    return res.status(error.status).json(error.toPublicJSON());
  }
  logger.error('request.errored', { error });
  res.status(500).json({ code: 'INTERNAL', message: 'Something went wrong.' });
});
```

`toPublicJSON()` is the only representation that may cross the network: it carries the code and a
deliberately vague message, never `details` and never the engineer-facing message.

## 7. Authorizing a handler

```ts
app.delete('/documents/:id', async (req, res) => {
  const document = await documents.find(res.locals.context.tenantId, req.params.id);

  await authorizer.require(res.locals.context, {
    permission: 'documents:delete',
    resource: { type: 'document', id: document.id, ownerId: document.ownerId },
  });

  await documents.remove(document.id);
  res.status(204).end();
});
```

## Rules that matter

**Pass `SecurityContext` explicitly.** Every platform service takes it as the first argument. An
authorization check that reads from ambient state is one a background job can pass by accident.

**Call `invalidateUser` after changing roles.** Permission sets are cached; revocation is explicit,
not by expiry, and the platform cannot see a mutation made directly against your tables.

**Pass `tokenVersion` when validating a session.** It is what makes "a password change signs
everyone out" true, and it is a no-op if you forget until the day you need it.

**Never log a token, and never put one in a URL.** `@munaxa/logging` redacts by key name, and
`bearerToken` reads the header only.

**Set `trust proxy` correctly.** The platform trusts `request.ipAddress`. If that resolves from an
unvalidated `X-Forwarded-For`, every per-IP control becomes advisory.

## Testing

The memory implementations are exported for exactly this:

```ts
import { MemoryUserDirectory, MemoryRefreshTokenStore, LoginService } from '@munaxa/auth';
import { MemorySessionStore, SessionManager } from '@munaxa/session';
import { MemoryCache } from '@munaxa/cache';
import { FixedClock } from '@munaxa/types';

const clock = new FixedClock(Date.parse('2026-01-01T00:00:00Z'));
// Advance time by hand: no waiting, no flakiness, and expiry is actually tested.
clock.advance(16 * 60 * 1_000);
```

Every platform service takes a `Clock`. Nothing calls `Date.now()` on its own.
