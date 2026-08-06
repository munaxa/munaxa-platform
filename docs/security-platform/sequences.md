# Sequences

The flows the platform implements, drawn as they actually run.

## Password login with a second factor

```mermaid
sequenceDiagram
  actor U as User
  participant E as securityPipeline
  participant L as LoginService
  participant D as UserDirectoryPort
  participant M as MfaService
  participant S as SessionManager
  participant T as TokenService
  participant A as AuditService

  U->>E: POST /auth/login
  E->>E: headers, path check, rate limit (per IP + per account)
  alt limit exceeded
    E-->>U: 429 + Retry-After
    E->>A: security.ratelimit.exceeded
  end
  E->>L: authenticate(identifier, password, context)
  L->>L: lockout check (before any hashing)
  L->>D: findByIdentifier
  Note over L: unknown account still verifies against a dummy hash,<br/>so timing does not answer "does this account exist?"
  L->>L: verify password (scrypt)
  alt wrong password or unknown account
    L->>A: auth.login.failed
    L-->>U: 401 AUTH_INVALID_CREDENTIALS (identical either way)
  end
  L-->>E: mfa-required (enrolled)
  L->>A: auth.mfa.challenged
  E-->>U: 401 AUTH_MFA_REQUIRED
  U->>E: POST /auth/mfa { code }
  E->>M: verifyTotpCode
  M->>M: constant-time compare, reject an already-used step
  M-->>E: true
  E->>S: create session (idle + absolute deadlines, device bound)
  S->>A: session.created
  E->>T: issueAccessToken(sid, ver) + issue refresh token
  E-->>U: 200 + __Host- cookies
  E->>A: auth.login.succeeded
```

The ordering that matters: the lockout check precedes the KDF, so a locked account costs an attacker
a cache read rather than 16 MiB and 80 ms; and the account-existence branch happens *after*
verification, so both paths cost the same.

## Refresh rotation, and what a replay does

```mermaid
sequenceDiagram
  participant C as Client
  participant R as RefreshTokenService
  participant St as RefreshTokenStorePort
  participant A as AuditService
  participant Sess as SessionManager

  C->>R: rotate(tokenA)
  R->>St: findByHash(fingerprint(tokenA))
  St-->>R: record { rotatedAt: null }
  R->>St: markRotated(id, replacedBy: B) — conditional on rotatedAt IS NULL
  St-->>R: true (claimed)
  R->>St: save(tokenB)
  R-->>C: tokenB
  A-->>A: auth.token.refreshed

  Note over C,R: Later — an attacker replays the copy they took of tokenA

  C->>R: rotate(tokenA)
  R->>St: markRotated(id, …)
  St-->>R: false (already claimed)
  R->>St: revokeFamily(familyId)
  R->>A: auth.token.reuse.detected (critical)
  R->>Sess: revoke linked sessions
  R-->>C: 401 AUTH_TOKEN_REUSED
```

Both parties lose access, deliberately. There is no way to tell which of the two holders is the
legitimate one, and the legitimate user experiences an unexpected sign-out — which is the signal
they need, and far better than an attacker keeping quiet access indefinitely.

The claim is what makes that true across replicas. The `findByHash` above is a fast path that saves
a write when the replay is not a race; the *decision* is `markRotated`, and the store tells exactly
one caller `true`. A thief presenting the token at the same moment as the legitimate client is
precisely the case where reading `rotatedAt` and then writing it back would have let both through —
which is how Platform 1.0 disabled its own reuse detection under exactly the conditions that
mattered.

## Two replicas, one refresh token

```mermaid
sequenceDiagram
  participant A as Replica A
  participant B as Replica B
  participant St as RefreshTokenStorePort

  par the same token, at the same moment
    A->>St: findByHash → rotatedAt: null
  and
    B->>St: findByHash → rotatedAt: null
  end

  Note over A,B: Both replicas believe the token is live. 1.0 stopped here and both proceeded.

  par the claim decides
    A->>St: markRotated(id, replacedBy: A1)
    St-->>A: true
  and
    B->>St: markRotated(id, replacedBy: B1)
    St-->>B: false
  end

  A->>St: save(A1)
  A-->>A: 200, new token
  B->>St: revokeFamily(familyId)
  B-->>B: 401 AUTH_TOKEN_REUSED
```

Every other at-most-once operation has this same shape: `markConsumed` for a reset link,
`setIfAbsent` for a TOTP step or a one-time code, `appendChained` for an audit record. Read freely;
decide once, in the store.

## Password reset

```mermaid
sequenceDiagram
  actor U as User
  participant P as PasswordResetService
  participant D as UserDirectoryPort
  participant St as ResetTokenStorePort
  participant N as NotificationService
  participant S as SessionManager

  U->>P: request(identifier)
  P->>D: findByIdentifier
  alt account exists
    P->>St: revoke outstanding tokens
    P->>St: save { tokenHash, expiresAt, passwordHashFingerprint }
    P->>N: security.password-reset-requested (a link, never a password)
  end
  P-->>U: 200 accepted
  Note over P,U: Identical response either way — no account enumeration

  U->>P: complete(token, newPassword)
  P->>St: findByHash
  P->>P: not consumed, not revoked, not expired
  P->>P: passwordHashFingerprint still matches the account
  P->>P: password policy (length, breach corpus, history)
  P->>St: markConsumed(id) — conditional on consumedAt IS NULL
  Note over P,St: Every check above is read-only and may run twice.<br/>This is the gate, and it opens once.
  P->>D: updatePasswordHash + incrementTokenVersion
  P->>S: revoke every session
  P->>N: security.password-changed (critical, never suppressed)
```

`passwordHashFingerprint` is what closes the "request two links, use the older one" replay: any
password change by any route invalidates every outstanding token.

## MFA enrolment

```mermaid
sequenceDiagram
  actor U as User
  participant M as MfaService
  participant St as MfaEnrollmentStorePort

  U->>M: beginTotpEnrollment
  M->>St: save { method: totp, secret (encrypted), confirmedAt: null }
  M-->>U: secret + otpauth:// URI (QR)
  Note over U,M: Unconfirmed enrolment does not count as a second factor —<br/>a mis-scanned QR must not lock the user out at the next login
  U->>M: confirmTotpEnrollment(code)
  M->>M: verifyTotp within ±1 step
  M->>St: mark confirmed
  M->>St: save 10 hashed recovery codes
  M-->>U: recovery codes (shown once)
```

## The request pipeline

```mermaid
sequenceDiagram
  participant Req as Request
  participant H as headers
  participant Pa as path
  participant RL as rate limit
  participant O as origin
  participant C as CSRF
  participant Th as threat scan
  participant App as Handler

  Req->>H: apply CSP + nonce, HSTS, COOP/CORP, Permissions-Policy
  H->>Pa: inspectPath
  alt traversal
    Pa-->>Req: 400 (with the headers already applied)
  end
  Pa->>RL: check rules (IP, account, session, endpoint)
  alt exceeded
    RL-->>Req: 429 + RateLimit-* + Retry-After
  end
  RL->>O: Origin/Referer against the trusted list
  O->>C: signed, session-bound double-submit
  C->>Th: scan query + body (records, never blocks)
  Th->>App: handler runs with a SecurityContext
```

Headers first is not cosmetic: a 429 produced by step three still needs `X-Content-Type-Options`,
because a browser renders it.

## Authorization

```mermaid
sequenceDiagram
  participant H as Handler
  participant Az as Authorizer
  participant Rv as PermissionResolver
  participant Ca as CachePort
  participant Pe as PolicyEngine

  H->>Az: require(context, { permission, resource })
  Az->>Rv: resolve(tenantId, userId)
  Rv->>Ca: get(rbac:tenant:user)
  alt miss
    Rv->>Rv: role assignments → hierarchy → normalized grants
    Rv->>Ca: set (short TTL; revocation is explicit, not by expiry)
  end
  Rv-->>Az: permissions
  Az->>Pe: evaluate (deny policies → role grant → allow policies)
  alt denied
    Az->>Az: onDecision → authz.permission.denied
    Az-->>H: throw AUTHZ_PERMISSION_DENIED<br/>(same code and message for every denial reason)
  end
  Az-->>H: allowed
```

## Key rotation

```mermaid
sequenceDiagram
  participant Op as Operator
  participant KR as KeyRing
  participant Job as Re-encryption job

  Op->>KR: rotate(k2)
  Note over KR: k2 signs and encrypts new values; k1 still reads old ones
  Job->>KR: for each record — needsReencryption?
  Job->>KR: reencrypt (decrypt under k1, encrypt under k2)
  Note over Op,Job: Wait out the longest lifetime of anything signed under k1
  Op->>KR: retire(k1)
```

Every ciphertext and signature carries its `kid`, so step three is safe the moment nothing references
the old key — and `KeyRing.retire` refuses to remove the primary, which is the mistake that turns a
rotation into an outage.

## Appending to the audit chain

```mermaid
sequenceDiagram
  participant S as AuditService
  participant R as AuditRepositoryPort
  participant DB as Store

  S->>R: appendChained(tenantId, seal)
  activate R
  R->>DB: read head FOR UPDATE (or read + unique index)
  DB-->>R: { sequence: n, hash: h }
  R->>R: seal({ sequence: n, hash: h }) → record n+1
  R->>DB: insert record n+1
  DB-->>R: committed
  deactivate R
  R-->>S: record

  Note over S,R: An optimistic adapter may instead raise ChainConflictError<br/>on the unique-index violation; AuditService retries up to maxChainAttempts.

  S->>S: fan out to sinks (SIEM, NDJSON, collector)
  Note over S: A sink failure is counted, never fatal.<br/>An append failure fails the request — a request<br/>that proceeds unaudited is worse than one that fails.
```

The sealing function is supplied by the caller and executed *by the store*, inside whatever
critical section the adapter uses. That inversion is the whole fix: a replica never proposes a
sequence number, so two replicas cannot propose the same one.
