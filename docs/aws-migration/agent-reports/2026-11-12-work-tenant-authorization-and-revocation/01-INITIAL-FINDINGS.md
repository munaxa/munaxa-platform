# WK-01 and WK-02: initial findings (before implementation)

Written 12 Nov 2026 before any code change, against these default-branch heads:

| Repository | `main` head |
|---|---|
| munaxa-work | `d3ba53b` (work#30) |
| munaxa-identity | `cb11a66` (identity#14) |
| munaxa-platform | `9d143ce` (platform#105) |

The source of the findings is the cross-repository readiness audit,
[`2026-11-11-cross-repository-deployment-readiness/supporting/work.md`](../2026-11-11-cross-repository-deployment-readiness/supporting/work.md)
rows WK-01 and WK-02. Both rows were re-checked against the code above, not copied.

## The security boundary as it actually is

- **Identity** (munaxa-identity) is the only issuer. An Identity *organisation* (`identity_tenant`) owns
  its accounts: `identity_account.tenant_id` is mandatory, so one account id (the token `sub`) belongs
  to exactly one organisation (the token `tid`). Roles and role assignments are per organisation, and
  `AuthService.issue` resolves `perms` with `resolver.resolve(tenantId, userId)`, so **a token's `perms`
  are what the account holds in the organisation named by `tid`, and nothing else.**
- Identity sessions are rows in Postgres (`identity_session`). Logout, revoke one, revoke others,
  password reset and change, MFA removal and account lockdown all end in a revoked session row, a
  bumped `identity_account.token_version`, a disabled account, or several of these. Identity's own
  routes enforce this on every request through `resolvePrincipal` (apps/api/src/auth/principal.ts),
  which checks the signature, `sid`, account status, current token version and live session row.
- **Work** (munaxa-work) verifies the JWT with Platform's `TokenService` (`@munaxa/auth`) against static
  public keys. A Work tenant is a UUID v7 that memberships carry (ADR-0033). There is **no** recorded
  link between a Work tenant and an Identity organisation in any table or in code (the only mention is
  an operator step in deploy/aws/README.md, and Identity's schema comment says the mapping is "never
  an equality any code may assume").
- **Platform** (munaxa-platform) supplies the verifier (`packages/platform/auth/src/tokens.ts`). It checks
  `ver` only when the caller passes `tokenVersion`, and it cannot know about session revocation: it has
  no store.

## WK-01: tenant authorization (still present)

**Vulnerable path.**

1. `apps/api/src/identity/platform-token-authentication.ts` `VerifiedAccessToken` declares only `sub`,
   `iss`, `iat`, `perms`. `principalFrom` deliberately discards `tid`.
2. `apps/api/src/tenancy/tenant.middleware.ts` resolves the tenant with
   `resolveForPrincipal(directory, principal, header('x-munaxa-tenant'))`, which lists every active
   membership of the `sub` (`app_memberships_of`) and lets the header choose among them.
3. The same middleware then runs the request with `runWithGrants(principal.permissions)`, the token's
   `perms`, in whichever Work tenant was chosen.

**Impact.** The `perms` of Identity organisation X are applied in every Work tenant where the same `sub`
has an active membership. A payroll administrator of the tenant bound (operationally) to X who also
holds an ordinary membership in Work tenant B gets payroll administration in B by sending
`x-munaxa-tenant: B`. The audit proved this live (one token, 200 in tenant A and B).

**Existing protections and their limits.**

- RLS is forced on all 187 tables and the tenant comes from a membership, never from the header or the
  token, so a person with **no** membership in B gets nothing in B (401). This holds and is kept.
- The header can only select among the caller's own active memberships, so it cannot grant reach.
- Grants are reduced to Work's 285-name catalogue (no wildcards).
- The limit: **nothing ties the grant set to the tenant it was issued for.** Membership answers "may this
  person be in B", and the token's `perms` answer "what may they do in X". The code used the second in B.

**Other WK-01 surfaces re-checked (no new defect found).** Every runtime path to a tenant context goes
through the middleware above, except `on-membership-ended` (an in-process domain event that carries the
tenant of the change that raised it, not caller input). There is no scheduler, queue or job runner in
the repository. The only in-process caches are licensing caches keyed by tenant id. Exports, search,
reporting and the documents download authorization all go through the dispatcher, its permission check
and the tenant-scoped unit of work (RLS). API responses carry **no** `Cache-Control`, so an
intermediary cache in front of the ALB could store an authenticated response; the admin itself uses
`cache: 'no-store'`. There are no Work operator or cross-tenant administrative endpoints.

**Remediation design.**

- A new table `tenant_platform_binding` records, for each Work tenant, the one Identity organisation
  (`platform_issuer`, `platform_tenant_id`) it belongs to. Unique on both directions: one Work tenant has
  one organisation, and one organisation has at most one Work tenant, so one organisation's grants can
  only ever apply in one Work tenant. Forced RLS like every other table, writable only by the migration
  owner (runtime grants revoke writes from `work_app`), readable before a tenant is in context only
  through a new security-definer function owned by the existing NOLOGIN `work_membership_resolver`.
- `app_bound_memberships_of(sub, issuer, tid)` returns only memberships in the Work tenant bound to the
  token's organisation. The predicate lives in SQL so application code cannot forget it.
- The adapter now reads `tid` (and `sid`, `amr`, `mfa`), but **only as a filter**: the tenant is still
  chosen from a stored membership, the header still only selects, and a token whose `tid` is not bound
  resolves to nothing (401). A token without `tid` is not a principal.
- `scripts/bootstrap-tenant.mjs` writes the binding (`--platform-tenant-id`, required), and refuses to
  re-bind a tenant to another organisation.
- Authenticated API responses get `Cache-Control: no-store` and `Vary: Authorization, X-Munaxa-Tenant`.
- Compatibility: an existing Work tenant with no binding resolves nobody until one is written. That is
  fail-closed on purpose. Work has never been deployed to AWS (nothing to migrate in a live database).

## WK-02: token and session revocation (still present)

**Vulnerable path.** `platform-token-authentication.ts` calls `verifier.verifyAccessToken(token)` with no
`tokenVersion` and never consults any session state. `TokenService` checks signature, `exp` (+30 s
skew), `iat`, `iss`, `aud`. Identity's access TTL defaults to 15 min. So after logout, revoke-session,
revoke-others, password reset or change, MFA removal, account disable or lockdown, a Work API still
accepts the access token until `exp + 30 s`, up to about 15.5 min. `sid`, `ver`, `amr` and `mfa` are not
read.

**Existing protections and their limits.** Identity revokes correctly for its own routes and for refresh
(re-checked: `attemptRefresh` validates account status, token version and session on every rotation and
revokes the family on reuse). The gap is only that Work never asks.

**Options considered.**

| Option | Verdict |
|---|---|
| Shared Redis denylist | Rejected. Work has no Redis client (WK-06), and Identity's Valkey is a per-task sidecar in the AWS stack (AW-03), so it is not shared and would add a new service. |
| Work reads Identity's database | Rejected. Duplicates Identity's responsibility and crosses repository ownership. |
| Shorter access TTL | Rejected alone. It changes every product, and still leaves a window of the TTL. |
| **Identity introspection with a short positive cache** | **Chosen.** Identity already has the single gate (`resolvePrincipal`) that every revocation path ends in. Work asks it. |

**Remediation design.**

- **Identity**: a new read-only route `GET /api/auth/introspect` taking `Authorization: Bearer`. It runs
  `resolvePrincipal` and answers `{active:true, sub, tid, sid, exp}` or `{active:false}`, with
  `Cache-Control: no-store`, and `503` when its own dependencies fail. No token, no permission set.
- **Work**: after local verification, the adapter asks Identity (URL derived from
  `PLATFORM_AUTH_ISSUER`, override `PLATFORM_AUTH_INTROSPECTION_URL`). It requires `active:true` and the
  same `sub`, `tid` and `sid` as the verified token. A positive answer is cached for at most
  `PLATFORM_AUTH_REVOCATION_CACHE_MS` (default 5 s, maximum 30 s, never beyond `exp`); a negative answer
  is cached until the token expires and is never overwritten. Concurrent checks of one token share one
  call. Any failure (timeout, 5xx, 429, network, malformed body) denies the request, in every
  environment. The only way to turn the check off is `PLATFORM_AUTH_REVOCATION_CHECK=disabled`, which
  is refused when `NODE_ENV=production`.
- Multi-instance: each instance asks Identity, whose database is the single source of truth, so every
  instance stops accepting a revoked token within the cache window.
- The principal keeps `sessionId`, `authenticationMethods` and `mfaSatisfied` from the token.
- No new Platform release is needed: Work and Identity both use `@munaxa/auth` as published.

## Cross-repository changes

| Repository | Change |
|---|---|
| munaxa-identity | `GET /api/auth/introspect` + integration tests over the real session and refresh machinery |
| munaxa-work | binding table + function + runtime grant revoke, adapter, resolution, middleware headers, config, bootstrap script, ADR, tests |
| munaxa-platform | Report only. The Work task definition needs no new variable because the introspection URL derives from the issuer, and the Work security group already allows 443 to Identity by its public name. |

Merge order: Identity first (Work in production fails closed without the endpoint), then Work.
