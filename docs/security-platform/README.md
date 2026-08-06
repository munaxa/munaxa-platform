# The Munaxa Shared Security Platform

Thirteen packages under `packages/platform/*` that own every cross-cutting security concern in the
Munaxa ecosystem: authentication, authorization, sessions, auditing, cryptography, rate limiting,
security headers, logging, notifications and configuration.

The point is narrow and worth stating plainly: **no Munaxa product should implement any of this
again.** Munaxa Docs, School, Work, CRM, ERP and AI consume these packages and write business
logic. When a product needs a security capability that is not here, the answer is to add it here.

## The packages

| Package | Owns | Depends on |
| --- | --- | --- |
| [`@munaxa/types`](../../packages/platform/types) | Branded identifiers, error taxonomy, security-event vocabulary, injectable clock | — |
| [`@munaxa/interfaces`](../../packages/platform/interfaces) | Every port the platform can be given from outside | types |
| [`@munaxa/crypto`](../../packages/platform/crypto) | Password hashing, AEAD, signing, randomness, key rotation | types |
| [`@munaxa/config`](../../packages/platform/config) | Typed environment schemas, secrets, feature flags, tenant config | types, interfaces |
| [`@munaxa/cache`](../../packages/platform/cache) | CachePort implementations, counters, distributed locks | types, interfaces |
| [`@munaxa/logging`](../../packages/platform/logging) | Structured logs, correlation ids, redaction | types, interfaces |
| [`@munaxa/audit`](../../packages/platform/audit) | Hash-chained audit trail, exporters, decorators | types, interfaces, logging |
| [`@munaxa/rbac`](../../packages/platform/rbac) | Roles, permissions, policies, guards | types, interfaces |
| [`@munaxa/session`](../../packages/platform/session) | Session lifecycle, devices, revocation | types, interfaces, crypto |
| [`@munaxa/security`](../../packages/platform/security) | Headers, CSP, CSRF, rate limiting, risk, threat detection | types, interfaces, crypto, cache |
| [`@munaxa/notifications`](../../packages/platform/notifications) | Email, SMS, push, in-app delivery with templates | types, interfaces, crypto |
| [`@munaxa/auth`](../../packages/platform/auth) | Passwords, login, tokens, MFA, reset, providers, API keys | types, interfaces, crypto |
| [`@munaxa/conformance`](../../packages/platform/conformance) | The executable specification every adapter must pass | types, interfaces |

## Documents

- [**Architecture**](./architecture.md) — the layering, the port model, and why the boundaries fall
  where they do.
- [**Package dependencies**](./package-dependencies.md) — the graph, and the rules that keep it acyclic.
- [**Sequences**](./sequences.md) — login, refresh rotation, password reset, MFA enrolment and the
  request pipeline, drawn end to end.
- [**Threat model**](./threat-model.md) — what the platform defends against, what it does not, and
  what a product still has to do.
- [**Developer guide**](./developer-guide.md) — wiring a product from nothing to a working login.
- [**API reference**](./api.md) — the public surface of each package.
- [**Extension guide**](./extension-guide.md) — adding a provider, a transport, a store, a signal,
  and what counts as a breaking change.
- [**Distributed guarantees**](./distributed-guarantees.md) — the consistency model, what each
  port promises, how it degrades, and what the atomicity costs. **Read this before writing an
  adapter or scaling past one replica.**
- [**Adapter guide**](./adapter-guide.md) — the exact statement each atomic operation needs, and
  how to prove your adapter provides it.
- [**Production readiness audit**](./production-readiness-audit.md) — the P2 review: scores,
  confirmed defects with reproductions, remediation plan and the Go/No-Go call.
- [**Platform 2.0 migration**](./migration/platform-2.0.md) — breaking changes, adapter changes,
  upgrade steps and the rollback story.
- **Product migration guides** — [Munaxa Docs](./migration/munaxa-docs.md),
  [Munaxa School](./migration/munaxa-school.md), [Munaxa Work](./migration/munaxa-work.md).

## Principles

**Deployment and cloud agnostic.** Node built-ins only. No database driver, no Redis client, no
email vendor, no cloud SDK appears in any package. Everything external arrives through a port.

**Multi-tenant.** Every entry point takes or derives a `TenantId`, every store read asserts it, and
single-tenant deployments pass `ROOT_TENANT_ID` so there is no un-scoped code path to get wrong.

**Secure by default.** The zero-argument configuration is the hardened one: 12-character passwords
with breach checking, 15-minute idle sessions with a 12-hour ceiling, refresh rotation with reuse
detection, a CSP with no `unsafe-inline`, and every browser capability denied.

**Fail in the safe direction, loudly.** Authorization denies. Rate limiting allows and reports
`degraded`, because a cache outage must not become a total outage. Audit sinks never fail a login,
but every failure is counted and surfaced.

**Backward compatible.** Each package's `test/compat.test.ts` pins the formats that outlive a
release: password hashes, ciphertext envelopes, JWT claims, cookie names, cache keys, environment
variables, event names, audit canonical form. Changing one is a deliberate edit to that file.

**Testable and observable.** No package reads the clock, the environment or a global directly.
Every security-relevant action emits an event from one closed vocabulary.

## Status

All thirteen packages are implemented, tested (unit, integration, security, performance,
backward-compatibility, conformance, distributed-simulation, stress and failure-injection suites)
and building at **2.0.0**. **No application has been migrated** — that is deliberate, and the
migration guides describe how each product moves when its phase arrives.

The P2 [production readiness audit](./production-readiness-audit.md) returned No-Go on four defects
that shared one shape: a check-then-act sequence correct on one process and silently wrong on two —
the audit chain head, refresh-token rotation, MFA replay protection and the session concurrency
limit. **All four are fixed in 2.0**, along with two more of the same shape found during 2.0's own
concurrency sweep: password-reset consumption and notification deduplication.

Each fix is a store-owned atomic operation rather than a service-held field, each is covered by the
conformance suite an adapter must pass, and each is exercised by a simulation that runs several
independent service instances over one shared store with latency injected between them. Start with
[distributed guarantees](./distributed-guarantees.md) and the
[2.0 migration guide](./migration/platform-2.0.md).
