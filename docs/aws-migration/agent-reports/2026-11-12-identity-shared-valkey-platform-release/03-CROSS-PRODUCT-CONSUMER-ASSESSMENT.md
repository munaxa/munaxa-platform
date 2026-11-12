# 03. Cross-product consumer assessment

12 Nov 2026. Read-only inspection of the default branches. Labels as in `01`.

Default-branch heads inspected [V]:

| Repository | Head |
|---|---|
| munaxa-platform | `0c6421a74afd0b9347b05e8c663058c8e36e9f03` (contains #107 `bc1f21b` and the #108 report) |
| munaxa-identity | `a1bf695f91e5c84246fd5a49422ff64e2f054dcf` (#16; the latest commit) |
| munaxa-work | `eabcc478ac849d400ae2c2a3e38b5686f28a19ae` (#31) |
| munaxa-control | `1f58c9069f874f37e9df17d62d0066dbb70b53ac` (#8) |
| munaxa-school | `4c2b4a440a506bdb6111df9207801cc605f0eb86` (#25) |
| munaxa-docs | `9d06698186fd1907206997a0586aaff713072b26` (#177) |

Method: every `package.json` range and every `pnpm-lock.yaml` resolution of `@munaxa/*`; every source
import of `@munaxa/auth`, `security`, `cache`, `crypto`, `session`, `rbac` outside `node_modules`; every
rate-limit implementation found by name.

## 1. Dependency matrix

| Product | Lockstep packages resolved (lockfile) | Uses the affected rate limiter (`@munaxa/security`, `@munaxa/cache`)? | Uses other changed code (`@munaxa/auth`)? | Required action |
|---|---|---|---|---|
| Identity | audit, auth, cache, config, conformance, crypto, interfaces, logging, rbac, security, session, types, all 2.4.1 | **Yes:** `RateLimiter` in `AuthEdgeLimiter`, the general edge rules, introspection, reset and change limiters; `RedisCache`; `LoginService` lockout | Yes: `LoginService`, `TokenService`, `MfaService`, `RefreshTokenService` | **Adopt 2.5.0 in Phase C** (`02` §5). Already compatibility-tested locally |
| Work | auth, crypto, interfaces, types 2.4.1 (+ licensing 0.2.0, platform 1.6.1 UI) | **No**: no import of `@munaxa/security` or `@munaxa/cache`; no rate limiter of its own found | Yes: `TokenService.verifyAccessToken` (`apps/api/src/identity/authentication-port.ts`) | Optional upgrade for #100's token hardening (Phase F). Not required by #107 |
| Control | auth, crypto, interfaces, types 2.4.1 (+ licensing, platform 1.7.0) | **No**: has its own in-process limiter (`apps/api/src/core/rate-limit.ts`, fixed one-minute windows, per process) | Yes: `TokenService.verifyAccessToken` (`apps/api/src/auth/authentication.guard.ts`) | Optional upgrade for #100 (Phase F). Not required by #107 |
| School | crypto, types 2.4.1 (through licensing 0.2.0) | **No**: uses `@nestjs/throttler` (`apps/api/src/app.module.ts`) | No (`AsymmetricSigner` in a test only) | **None** |
| Docs | crypto, types 2.4.1 (through licensing 0.2.0) | **No**: own rate limiting in the Docs API | No (`AsymmetricSigner` in a test only) | **None** |
| munaxa (site) | none of the lockstep packages (`@munaxa/platform` 1.3.0 UI only) | No | No | **None** |

`@munaxa/licensing` 0.2.0 depends on `@munaxa/crypto` `^2.4.1` [V]; crypto has no source change in
2.5.0, and lockfiles keep 2.4.1 until a product updates them. No product changes behaviour when 2.5.0 is
published.

## 2. Work and Control (the only optional adopters)

**Call paths [V].**
- Work: `authentication-port.ts` builds Platform's `TokenService` from issuer, audience, algorithm and
  keys and calls `verifyAccessToken` on every request; then the WK-02 introspection check
  (`GET /api/auth/introspect`, positive cache ≤ 5 s, fail closed).
- Control: `authentication.guard.ts` verifies operator tokens with `TokenService` (audience
  `environment.operatorAudience`) and service tokens separately.

**What 2.5.0 changes for them [V source]:** tokens with no numeric `exp`, a non-numeric `iat` (checked only when present), or a
string `aud` that is not exactly a configured audience are refused. Identity always mints `exp`, `iat`
and an array `aud` (`issueAccessToken`; Identity's `IDENTITY_AUTH_AUDIENCE` is parsed as a list), so no
genuine token is refused. The rate-limiter changes do not reach them.

**Required package changes (Phase F) [R]:** `@munaxa/auth` and `@munaxa/crypto` ranges to `^2.5.0` and a
lockfile refresh (which also moves `interfaces`, `types` to 2.5.0). Nothing else.

**Regression tests:**
- Work: `apps/api/src/identity/*.spec.ts` (including `session-revocation.instances.spec.ts`),
  `tenancy/cross-tenant.fixture.ts` users, the WK-01/WK-02 suites, full `ci.yml`.
- Control: `authentication.guard` tests, `testing/harness.ts` users, full `ci.yml`.

**Local run:** not possible in this session. Installing Work or Control needs GitHub Packages for
`@munaxa/platform`, `ui`, `theme`, `licensing` and the config packages, and the session has no packages
token (401) [V `supporting/compatibility-run.txt` §3]. The assessment above is static.

**Deployment dependencies:** none on Identity's store. Work already depends on an Identity image that
contains #15 (introspection); that is unchanged.

**Recommended order:** Identity (Phase C) → Work → Control, each its own PR, CI and review. Work first
because it verifies every end-user request; Control's operator traffic is small.

## 3. Observations outside this task (no action taken)

These are not Platform consumers and are listed only so they are not mistaken for covered:
- Control's limiter is per process. With production `desired_counts.control-api = 2`, its limits are
  per task (each limit doubles). It is Control's own code, not the Platform limiter.
- School's `@nestjs/throttler` storage was not inspected; if it is the default in-memory store, the same
  per-task property applies with `school-api = 2` in production.
- Both are candidates for a later product-level review; neither is changed by the Platform release.

## 4. Preserved protections

No product's rate limiting, token verification, tenant binding or revocation check is changed by this
plan. Optional adoptions only tighten token verification.
