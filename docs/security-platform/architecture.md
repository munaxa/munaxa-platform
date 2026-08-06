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

  auth --> rbac
  auth --> session
  auth --> audit
  auth --> crypto
  notifications --> logging
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

**Layer 3** composes. `auth` is the only package that depends on three domains, because authenticating
someone genuinely does involve sessions, roles and an audit record.

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
