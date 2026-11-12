# WK-01 and WK-02 remediation: Work tenant authorization and token/session revocation

12 Nov 2026. Repository changes only. Nothing was deployed, migrated, published or changed in AWS.

Read with [`01-INITIAL-FINDINGS.md`](01-INITIAL-FINDINGS.md) (written before any code change) and
[`02-TEST-EVIDENCE.md`](02-TEST-EVIDENCE.md).

## 1. Executive summary

- **WK-01 FIXED (repository).** A Work tenant is now bound to exactly one Identity organisation
  (`tenant_platform_binding`, unique both ways, forced RLS, runtime role read-only). Requests resolve
  only memberships of the tenant bound to the token's `tid` (`app_bound_memberships_of`, security
  definer owned by `work_membership_resolver`). A token's grants can therefore only be exercised in
  the organisation they were computed in.
- **WK-02 FIXED (repository).** Identity has a new `GET /api/auth/introspect`; Work asks it after
  verifying a token. A revocation committed in Identity at time R stops that session's tokens on every
  Work instance for requests received after **R + 5 s** (configurable, at most 30 s). Work fails closed
  if Identity cannot answer.
- **PRs:** munaxa/munaxa-identity#15 and munaxa/munaxa-work#31. Merge status in section 11.
- **Independent review:** three rounds by a reviewer that did not implement. Round 1 CHANGES REQUIRED
  (1 High, 1 Medium, 6 Low), round 2 CHANGES REQUIRED (1 Medium on an Identity edge change), round 3:
  see section 10. All Critical/High/Medium resolved.
- **Two out-of-scope defects found and reported, not fixed** (section 12): Identity's login and
  password-reset rate limits never match at the edge, and Platform's adaptive limiter restarts its count
  after each refusal.
- **Deployment ordering:** Work images built from the merged code need an Identity image that includes
  identity#15 (the pinned nonprod Identity `5277d71` does not). Existing Work tenants must be re-bound
  by bootstrap. Work has never been deployed, so nothing live is affected.

## 2. Original findings

From [`2026-11-11-cross-repository-deployment-readiness/supporting/work.md`](../2026-11-11-cross-repository-deployment-readiness/supporting/work.md):

- **WK-01 (High).** Identity computes `perms` in the organisation named by `tid`. Work ignored `tid` and
  chose the tenant from the caller's memberships narrowed by the `x-munaxa-tenant` header, so a person
  with active memberships in two Work tenants carried one organisation's grants into the other.
- **WK-02 (High).** Work checked only JWT signature and expiry. Logout, revoke-one, revoke-others,
  password reset/change, MFA removal and lockdown are state in Identity; Work never asked, so a
  signed-out token kept working for up to about 15.5 minutes.

## 3. Current-state verification (before the change)

Both findings were re-verified on `main` before implementation (work `d3ba53b`, identity `cb11a66`,
platform `9d143ce`); details, file references and the vulnerable call paths are in
`01-INITIAL-FINDINGS.md`. Additionally, the new cross-tenant end-to-end suite, run against the pre-fix
resolution (mutation M1 and the SQL mutation in `02-TEST-EVIDENCE.md`), fails 11 of 17 tests: the
attacks it encodes succeed against the old behaviour.

## 4. Root causes

- **WK-01:** no recorded relationship between a Work tenant and an Identity organisation, so Work had
  nothing to compare `tid` with; ADR-0032 deliberately ignored `tid` to avoid trusting it as a selector,
  and nothing replaced it as a filter.
- **WK-02:** a stateless verifier by design (ADR-0076 accepted the token lifetime as the window), and
  Identity exposed no way for a product to ask about session state.

## 5. Attack scenarios (now refused, each tested)

1. Organisation-A administrator, ordinary member of tenant B, sends an A token with
   `x-munaxa-tenant: B` to read, update, change status (archive), create, read a nested profile,
   search, export, or download a document in B.
2. Same person addresses B's record id from tenant A.
3. A token whose organisation is bound to no tenant, or with no `tid`.
4. A membership suspended in the bound tenant.
5. Wildcard (`work:*`), foreign-product or Platform administrator grants.
6. A signed-out, revoked, revoked-others, password-reset, password-changed, locked-down or disabled
   session; a token-version bump; a refresh after revocation; a replayed refresh token; a refresh
   racing a revocation.
7. Identity down, slow, answering malformed, or answering about another subject/session.
8. A stale cached positive surviving past the window, on one or two instances; a wall clock stepped
   backwards.
9. An operator binding the wrong tenant through `bootstrap-tenant` (review H1).
10. One account, or a product's shared NAT address, exhausting Identity's per-address limit and
    taking Work down for everyone (review M1).

## 6. Remediation architecture

Decision record: munaxa-work `docs/adr/0080-grants-are-bound-to-their-organisation-and-sessions-are-checked.md`.

**Tenant (WK-01).**
- `tenant_platform_binding (tenant_id, platform_issuer, platform_tenant_id)` with unique indexes on
  `tenant_id` and on `(platform_issuer, platform_tenant_id)`; `app_protect_table` (forced RLS); the
  migration and `deploy/aws/runtime-grants.sql` both revoke INSERT/UPDATE/DELETE/TRUNCATE from
  `work_app`.
- `app_bound_memberships_of(sub, issuer, tid)`: security definer, `search_path = public`, owned by the
  NOLOGIN `work_membership_resolver` (as ADR-0077); joins the binding and filters issuer, organisation,
  active statuses and soft deletion. The predicate lives in SQL so no second caller can forget it.
- The adapter requires `tid`, `sid` and `exp`; `tid` filters eligible memberships, never selects one;
  the header still only chooses among eligible memberships.
- `scripts/bootstrap-tenant.mjs` requires `--platform-tenant-id`, binds in the same transaction, and
  binds only a tenant the operator named with `--tenant-id` or one already bound to that organisation.
  It refuses to re-bind, to revive a retired binding, or to bind a person's other tenant.

**Session (WK-02).**
- Identity `GET /api/auth/introspect` (Bearer only): decides with `resolvePrincipal`, the same gate as
  every authenticated Identity route; answers `{active:true, sub, tid, sid, exp}` or `{active:false}`
  with `no-store`; 503 `AUTH_UNAVAILABLE` on a dependency failure; 429 `RATE_LIMITED` past
  `introspect-per-user` (600 answers a minute per account). Carved out of the browser limit
  `api-per-ip` (300/min) and given `introspect-per-ip` (12,000/min), matched on the exact normalised
  route.
- Work `IdentitySessionStatus`: positive answers reused for at most `PLATFORM_AUTH_REVOCATION_CACHE_MS`
  (default 5000, max 30000) measured on a monotonic clock from when the question was sent, never past
  `exp`; negatives kept until expiry and never replaced; concurrent checks share one call only within
  the window; SHA-256 cache keys, bounded LRU; every failure refuses and is not cached; the answer must
  echo the token's own `sub`, `tid`, `sid`; redirects refused; https required in production;
  `PLATFORM_AUTH_REVOCATION_CHECK=disabled` refused at startup in production.
- Authenticated responses: `Cache-Control: no-store`, `Vary: Authorization, X-Munaxa-Tenant`.
- The principal carries `platformTenantId`, `sessionId`, `authenticationMethods` (`amr`) and
  `mfaSatisfied` (`mfa`); no token is logged anywhere.

No new runtime dependency in either repository. Platform needed no change.

## 7. Exact files changed

**munaxa-identity#15:** `apps/api/src/auth/token-introspection.ts` (new), `apps/api/src/app.module.ts`,
`apps/api/src/application.ts` (new, extracted from `main.ts`), `apps/api/src/main.ts`,
`apps/api/src/platform/security.ts` (edge rules, introspection limiter),
`apps/api/src/security/edge.middleware.ts` (introspection path only),
`packages/testing/src/token-introspection.integration.test.ts` (new, 18 tests),
`packages/testing/src/token-introspection.http.integration.test.ts` (new, 6 tests), `README.md`,
`docs/runbooks/revocation.md`.

**munaxa-work#31:** migration `prisma/migrations/20261112090000_tenant_platform_binding/`,
`prisma/schema.prisma`, `deploy/aws/runtime-grants.sql`, `deploy/aws/README.md`, `.env.example`,
`scripts/bootstrap-tenant.mjs`, `packages/config/src/{environment,platform-authentication,index}.ts`,
`packages/kernel/src/ports/authentication.ts`,
`packages/modules/identity/src/{contracts/*,infrastructure/membership-directory.ts}`,
`apps/api/src/identity/{session-revocation.ts (new),platform-token-authentication.ts,authentication-port.ts,identity.module.ts}`,
`apps/api/src/tenancy/{tenant-resolution.ts,tenant.middleware.ts}`, ADR-0080 (new), ADR-0076 note,
ADR index; tests listed in `02-TEST-EVIDENCE.md`.

**munaxa-platform:** this report only.

## 8. Test results

Summary (full tables, adversarial case mapping and mutation results in `02-TEST-EVIDENCE.md`):

| Gate | Work (final head) | Identity (final head) |
|---|---|---|
| Standards / format / lint / typecheck | PASS | PASS |
| Unit + integration (incl. Postgres, RLS) | 5,771 passed, 0 failed | 246 integration + 46 unit passed |
| Migrations from empty | PASS | PASS (+ grants) |
| Build / production output / Prisma validate | PASS | PASS |
| Catalogue drift, key scan, secret scan | n/a | PASS |
| `pnpm audit --audit-level high` | PASS (1 low, 2 moderate) | PASS (1 low, 2 moderate) |
| Mutation tests | 11 mutants, all killed | 4 mutants, all killed |

Every adversarial test checks the HTTP status and that the body carries none of the other tenant's
data, and for writes that the database row is unchanged.

## 9. CI links and final SHAs

| Repository | Approved head | CI on that head | Merged as |
|---|---|---|---|
| munaxa-identity | `a257bda4c1fb1d5d1e87fef5a33f3e20be162463` | verify: success, [run 43190387572](https://github.com/munaxa/munaxa-identity/actions/runs/43190387572/job/131087906846) | `420df431eaff6fcb3f59df37638bf4b648f08c8a` (squash) |
| munaxa-work | `253f7c9a201ad1af54dd197bec66fec2d149a53c` | [run 43190390569](https://github.com/munaxa/munaxa-work/actions/runs/43190390569): Lint · Typecheck · Test · Build [success](https://github.com/munaxa/munaxa-work/actions/runs/43190390569/job/131088052725), Standards · Architecture · Localization [success](https://github.com/munaxa/munaxa-work/actions/runs/43190390569/job/131088052835), Product isolation [success](https://github.com/munaxa/munaxa-work/actions/runs/43190390569/job/131088052935), Mobile [success](https://github.com/munaxa/munaxa-work/actions/runs/43190390569/job/131088052582) | `eabcc478ac849d400ae2c2a3e38b5686f28a19ae` (squash) |

Both merges used `expectedHeadSha` equal to the approved head, so the merged trees are exactly the reviewed ones.
Identity merged first, because Work's session check needs its introspection endpoint.

## 10. Review findings and resolutions

Reviewer: an independent agent that wrote none of the code, given only the PRs and the requirements.

**Round 1** (identity `5315930`, work `7d11e3b`): CHANGES REQUIRED.

| Finding | Resolution |
|---|---|
| H1 bootstrap bound the person's oldest (possibly legacy, unbound) tenant to the new organisation, ignoring `--tenant-id`: WK-01 again through an operator action | Fixed: binds only a named or already-bound tenant; refuses mismatched `--tenant-id`, several memberships without `--tenant-id`, unnamed unbound tenants, retired bindings. Reviewer's reproduction added as a test |
| M1 introspection under the browser `api-per-ip` limit; the shared NAT key let ~25 users, or one user, exhaust it for all Work traffic | Fixed: carved out, `introspect-per-ip` 12,000/min plus `introspect-per-user` 600/min (only that account is refused); HTTP tests |
| L1 runtime role could write bindings until runtime grants ran | Fixed: REVOKE in the migration too |
| L2 race message wrong; soft-deleted bindings inconsistent | Fixed: own message; retired binding refused |
| L3 cache window on the wall clock | Fixed: monotonic clock for age; test with the wall clock stepped back |
| L4 test names claimed more than tested | Fixed: renamed; one test runs the shipped 5 s default |
| L5 no HTTP-level Identity test | Fixed: `createApplication` shared with `main.ts`; HTTP suite over the compiled app |
| L6 ADR recorded an approval in advance | Fixed: ADR points to this record |

**Round 2** (identity `9a0bb48`, work `5cf123b`): Work had no findings and no regressions. Identity
CHANGES REQUIRED: **M-A**, the edge path change made in round 1 also switched on the login and
password-reset limits, which were then bypassable by case or trailing slash and do not hold after a
refusal (Platform defect). Resolved by limiting the edge path change to the exact normalised
introspection route (also N2); the pre-existing defects are reported in section 12. N3 (possible
sliding-window flake) fixed by looping to twice the limit; N1 (MFA edge rule keyed by session never
fires) is pre-existing and reported.

**Round 3** (identity `a257bda`, work `253f7c9`): **APPROVE on both exact heads.** No Critical, High or Medium. One Low left open with justification (the routed-spellings test proves routing, not that those spellings count under the introspection limit; see `02-TEST-EVIDENCE.md`).

## 11. PR links and merge status

- [munaxa/munaxa-identity#15](https://github.com/munaxa/munaxa-identity/pull/15): MERGED (squash) `420df43`, 12 Nov 2026.
- [munaxa/munaxa-work#31](https://github.com/munaxa/munaxa-work/pull/31): MERGED (squash) `eabcc47`, 12 Nov 2026.
- This report: munaxa/munaxa-platform PR on branch `claude/project-thread-dllo7m` (report only).

## 12. Remaining limitations

- **[O] Deployment ordering.** Work built from this code refuses every request unless Identity serves
  `/api/auth/introspect`; the pinned nonprod Identity image `5277d71` does not. A newer Identity image
  carries the separate AW-01 prerequisites (MFA key ring, `IDENTITY_PASSWORD_RESET=disabled`, MFA
  migration).
- **[O] Re-binding.** Every Work tenant needs `bootstrap-tenant --tenant-id <tenant> --platform-tenant-id
  <organisation id>` once; until then nobody can act in it.
- **Availability.** Every authenticated Work request depends on Identity (fail closed by design).
- **Capacity.** About 1,000 continuously active Work users per NAT address at the 5 s window; about
  20 accounts at the per-account cap would fill one address's budget; limiter state is per Identity
  task. A production item, stated in ADR-0080.
- **Role changes are not revocations.** A removed role reaches Work with the next token (at most one
  access-token lifetime, unchanged), because introspection still answers active for a live session.
- **One account per organisation.** A person working for two organisations needs an Identity account
  in each (already true in Identity).
- **[O] Out of scope, found during this work, not fixed:**
  1. Identity's edge passes `request.path`, which Express reports as `/` under Nest's every-route
     mount, so Platform's path-matched rules (`login-per-ip`, `login-per-user`,
     `password-reset-per-ip`) never match; the MFA rule (keyed by session) never fires at the edge.
     Identity's per-account lockout and the password-recovery service's own limiter are unaffected.
  2. Platform `RateLimiter`: the adaptive penalty changes the window length, which changes the counter
     key, so the count restarts after each refusal (observed: 429 only on attempts 11 and 22 of 30).
  3. Switching the login limits on is also a policy decision: 10 sign-ins per 15 minutes per address
     would be shared by an office NAT. Recommended as one follow-up change across Platform and
     Identity, with its own review.

## 13. Exact token revocation guarantee

Once Identity has committed a revocation of a session at time R (logout, revoke one, revoke others,
password reset or change, MFA removal, lockdown, disable, token-version bump, or refresh-token reuse),
no Work API instance accepts a request carrying an access token of that session that it receives after
**R + `PLATFORM_AUTH_REVOCATION_CACHE_MS`** (5 s by default, 30 s at most). Each instance asks Identity
independently, so it holds across any number of instances with no coordination; the window is measured
on each instance's monotonic clock from when it sent the question, so it does not depend on clock
agreement between services. If Identity cannot answer (timeout, network, non-200 including 429 and
503, malformed or mismatched answer), Work refuses. A refusal, once seen, is kept until the token
expires and is never replaced by a later or earlier positive answer.

## 14. Tenant isolation tested

Confirmed. Tenant isolation was tested through the full production composition (the real `AppModule`,
real PostgreSQL connected as `work_app` with exactly `deploy/aws/runtime-grants.sql`, real ES256 tokens)
for cross-tenant read, update, status change, create, nested resource, search, export and download,
changed tenant header, record id from another tenant, missing tenant context, unbound organisation,
suspended membership, revoked session, multiple memberships, wildcard and foreign grants (no operator
bypass exists), and cache headers; plus SQL-level tests of the binding, RLS and ownership, and the
bootstrap refusals. Background jobs: Work's jobs run under a system context with an explicit tenant
(ADR-0033) and never resolve a tenant from a token, so the binding does not apply to them; their
existing tenant-isolation suites still pass.

## 15. No AWS, secrets, deployments or production databases touched

Confirmed. No AWS resource was created, modified, deleted or read; no Terraform ran; no Secrets
Manager secret was created, read, rotated or modified; no image was built for or published to a
registry; nothing was deployed or enabled; no migration ran against a deployed database (only against
a local, throwaway PostgreSQL in the session container); no IAM, KMS, network, security group, RDS,
ECS, DNS, Cloudflare, domain or certificate change; no workflow was dispatched; no production
configuration changed; no GitHub App inspected or changed; no password, token, cookie, private key or
secret value was retrieved, printed or exposed (test keys are generated at run time).
