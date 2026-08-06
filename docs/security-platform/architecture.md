# Architecture

## The shape of the thing

The platform is four layers. Each depends only on layers below it, which is what keeps the graph
acyclic and lets a product adopt one package without adopting all twelve.

```mermaid
graph TD
  subgraph L3["Layer 3 — Capabilities"]
    auth["@munaxa/auth"]
    notifications["@munaxa/notifications"]
  end

  subgraph L2["Layer 2 — Security domains"]
    rbac["@munaxa/rbac"]
    session["@munaxa/session"]
    audit["@munaxa/audit"]
    security["@munaxa/security"]
  end

  subgraph L1["Layer 1 — Infrastructure"]
    crypto["@munaxa/crypto"]
    cache["@munaxa/cache"]
    logging["@munaxa/logging"]
    config["@munaxa/config"]
  end

  subgraph L0["Layer 0 — Vocabulary"]
    types["@munaxa/types"]
    interfaces["@munaxa/interfaces"]
  end

  auth --> crypto
  auth --> interfaces
  notifications --> crypto
  security --> cache
  security --> crypto
  session --> crypto
  audit --> logging
  rbac --> interfaces
  crypto --> types
  cache --> interfaces
  logging --> interfaces
  config --> interfaces
  interfaces --> types
```

**Layer 0** is vocabulary. `types` has no behaviour worth naming; `interfaces` has none at all
beyond a token table and a twenty-line registry. Depending on either can never pull infrastructure
into a build.

**Layer 1** is infrastructure with a single responsibility each, and no knowledge of authentication
or authorization.

**Layer 2** is the security domains. Each is independently useful: a product can adopt `@munaxa/rbac`
alone, or `@munaxa/audit` alone.

**Layer 3** composes — but through ports rather than imports. `auth` returns a *decision*; the
product's composition root feeds that to `SessionManager`, `TokenService` and `AuditService`. The
result is that `@munaxa/auth` imports only `types`, `interfaces` and `crypto`, and a product can
adopt authentication without adopting the platform's session or audit implementations. The
[P2 audit](./production-readiness-audit.md) corrected this diagram, which previously drew
dependencies the code does not have.

## Ports, and why everything is one

Every capability the platform needs from the outside world is an interface in `@munaxa/interfaces`
with no implementation:

```mermaid
graph LR
  subgraph Platform
    A["@munaxa/auth"]
    S["@munaxa/session"]
    R["@munaxa/rbac"]
  end

  subgraph Ports["@munaxa/interfaces"]
    UD[UserDirectoryPort]
    SS[SessionStorePort]
    RT[RefreshTokenStorePort]
    CP[CachePort]
    AS[AuditSinkPort]
  end

  subgraph Product["A product supplies"]
    PG[(Postgres via Prisma)]
    RD[(Redis)]
    SIEM[(SIEM webhook)]
  end

  A --> UD
  A --> RT
  S --> SS
  R --> CP
  A --> AS

  UD -.-> PG
  SS -.-> PG
  RT -.-> PG
  CP -.-> RD
  AS -.-> SIEM
```

Three consequences follow, and all three are the reason for the design:

1. **No vendor reaches a product transitively.** A product deploying on Cloudflare Workers with D1
   and KV implements the same ports as one on Kubernetes with Postgres and Redis. `@munaxa/auth` is
   identical in both.
2. **The platform's own tests run against the memory implementations**, which are shipped. They are
   the executable specification of what a product's adapter must do — including the tenant assertion
   on every read, which is the part a hand-written repository usually forgets.
3. **A missing dependency fails at composition, not at request time.** `ServiceRegistry.assertRegistered`
   names every unwired port at boot.

## The one thing the platform does not own

Products own their data. `CredentialRecord` is a *projection* of a product's user table — a user id,
a tenant, an identifier, a password hash, a status, a token version — and nothing else. No profile,
no name, no product fields. The platform never migrates a schema, never owns a table and never
requires one to be shaped a particular way.

## Where state lives

```mermaid
graph TB
  subgraph Durable["Durable, product-owned"]
    U[(Accounts + password hashes)]
    RTS[(Refresh tokens, hashed)]
    RST[(Reset tokens, hashed)]
    SES[(Sessions)]
    DEV[(Devices, fingerprints hashed)]
    ROL[(Roles + assignments)]
    AUD[(Audit records, hash-chained)]
    KEY[(API keys, hashed)]
  end

  subgraph Ephemeral["Ephemeral, CachePort"]
    LOCK[Lockout counters]
    RL[Rate limit windows]
    PERM[Resolved permission sets]
    LK[Distributed locks]
  end

  subgraph None["Held nowhere"]
    AT[Access tokens]
    NONCE[CSP nonces]
    CODE[TOTP codes]
  end
```

The middle column is the one worth understanding. Everything in it is *recoverable*: losing the
cache costs a burst of extra database reads and resets some counters. Nothing in it is the only copy
of anything, which is why rate limiting can fail open and permission caching can be dropped wholesale.

There is a fourth column that used to exist and no longer does: **held in a service field**. Platform
1.0 kept the audit chain head, the set of used TOTP steps and the deduplication window in private
maps on service objects. Each was correct with one process and silently wrong with two, and none of
them raised an error on the path that was wrong. 2.0 has no such state: anything that must happen at
most once is decided by the store, in one conditional operation, and exactly one caller is told yes.
See [distributed guarantees](./distributed-guarantees.md).

## Running more than one replica

```mermaid
graph TB
  LB[Load balancer]

  subgraph Fleet["Replicas — no shared memory, no affinity required"]
    R1["Instance 1<br/>AuthService · AuditService<br/>SessionManager · RateLimiter"]
    R2["Instance 2<br/>same services, own objects"]
    R3["Instance N<br/>…"]
  end

  subgraph Shared["Shared state — the only thing replicas have in common"]
    DB[("Database<br/>appendChained · markRotated<br/>markConsumed · createWithinLimit")]
    KV[("Cache<br/>setIfAbsent · increment<br/>compareAndSet")]
  end

  LB --> R1 & R2 & R3
  R1 & R2 & R3 --> DB
  R1 & R2 & R3 --> KV
```

Nothing in the fleet box talks to anything else in the fleet box. There is no gossip, no leader,
no sticky sessions and no coordination protocol — a replica is stateless, and every decision that
needs agreement is pushed down to one conditional operation in the shared box. That is what makes
the platform deployable unchanged on Kubernetes, Docker Swarm, Azure App Service, AWS ECS, Cloud
Run, Cloudflare Workers, Render and Fly.io: none of them are asked for anything beyond "several
processes, one database, one cache".

The corollary is that the shared box has to be able to do those operations. Where a backing cannot —
Cloudflare KV has no compare-and-set — the platform degrades explicitly and reports the mode it is
in, rather than behaving as though it had the guarantee. See the degradation table in
[distributed guarantees](./distributed-guarantees.md#degradation-declared).

## Trust boundaries

```mermaid
graph LR
  B[Browser / mobile client] -->|TLS| E[Edge: securityPipeline]
  E --> H[Product handlers]
  H --> P[Platform services]
  P --> D[(Product stores)]
  P --> X[External IdP]

  classDef untrusted fill:#fff,stroke:#c00,stroke-width:2px
  class B untrusted
```

- **Client → edge.** Everything is hostile. Normalization, rate limiting, origin and CSRF checks
  happen here, in that order, before any handler runs.
- **Edge → handlers.** A `SecurityContext` exists from here on: tenant, principal, correlation id.
  Handlers never re-derive it from headers.
- **Handlers → platform.** Context is passed explicitly as the first argument. The platform never
  reads it from ambient state, because a background job that inherits the last request's principal
  is a hard bug to find and a serious one to have.
- **Platform → external IdP.** The identity provider is trusted for the identity it asserts and
  nothing else. Its groups are input to a product's role mapping, never permissions directly.

## Decisions worth knowing about

**Sessions are server-side state, not a claim in a token.** A JWT cannot be un-issued. "Sign out
everywhere", "revoke this device" and "we locked the account" are only real if something server-side
is consulted, so access tokens are short-lived and carry `sid`, and the session decides.

**Refresh tokens are opaque, not JWTs.** A long-lived self-contained credential nobody can withdraw
is the failure mode this avoids. Opaque plus hashed-at-rest plus single-use plus family revocation
turns a stolen refresh token into a detectable, self-limiting event.

**Deny-overrides in authorization.** Any matching deny wins regardless of order or specificity.
Anything else eventually produces a rule that grants what another rule forbids.

**Heuristics report; they do not block.** The risk engine and the threat detectors emit events and
raise a score. Nothing in the platform silently blocks a login on a pattern match, because every
signal has a false-positive mode that looks exactly like a person travelling or changing phone.

**Rate limiting fails open.** A rate limiter that fails closed converts a cache outage into a total
outage. The decision carries `degraded: true` and the callback fires, so failing open is visible
rather than silent.

**One event vocabulary.** `SECURITY_EVENTS` is closed. Seven products emitting `login_ok` and
`user.signed_in` and `auth.login.success` cannot share a dashboard, an alert rule or a SIEM pipeline.
