# Identity session management and account security (Agent 3)

**Date:** 11 Nov 2026, 12:41 to 13:05 UTC
**Scope:** Agent 3 of the owner's "Munaxa Identity complete security hardening" assignment.
Code, tests and docs in `munaxa/munaxa-identity` only. **No AWS call, no Terraform, no secret, no
deployment, no live database.**
**Verdict:** IMPLEMENTED, TESTED AND MERGED. Independent review (Agent 4): approve, no critical or high
finding; the medium findings were fixed in a follow-up PR that the reviewer also signed off.

## 1. What was merged

| PR | Merge commit on `main` | Content |
| --- | --- | --- |
| [identity#8](https://github.com/munaxa/munaxa-identity/pull/8) | `9cf4d59` | Session list and revocation endpoints, principal gate, credential revocation, account lockdown, four fixes to existing behaviour, 37 tests |
| [identity#10](https://github.com/munaxa/munaxa-identity/pull/10) | `27d1fcc` | Review follow-up: audit events for revocations, two accuracy corrections, 4 tests |

Baseline before the work: Identity `main` at `5277d71`.

Note on #8: it was squash-merged by the `tam2om` account at 12:56 UTC, about two minutes after it
opened, with CI green but **before** the reviewer's sign-off. This thread did not merge it. The
reviewer then reviewed the merged content (identical to head `75439e2`) and approved it.

## 2. Endpoints

All three are authenticated by the `__Host-mx_session` cookie only, sit behind the existing
`EdgeMiddleware` (strict origin allow-list for every non-GET method, which is the CSRF defence for
the `DELETE` too) and answer `cache-control: no-store`.

| Route | Behaviour |
| --- | --- |
| `GET /api/auth/sessions` | The caller's live sessions. Allow-listed fields only: `id`, `current`, `createdAt`, `lastActiveAt`, `expiresAt`, `ipPrefix` (policy), `device`. |
| `DELETE /api/auth/sessions/:id` | Revokes one of the caller's own sessions and its refresh lineage. Revoking the current one clears the cookies. |
| `POST /api/auth/sessions/revoke-others` | Revokes every session except the current one, with lineages. |

- `device` is a label from a fixed vocabulary ("Firefox on Linux"). No byte of the raw user-agent is
  returned.
- `ipPrefix` is the /24 (IPv4) or /48 (IPv6) network when `IDENTITY_SESSION_LIST_IP=prefix`
  (default), absent when `hidden`. The full address is never returned.
- Unauthenticated: `401 AUTH_UNAUTHENTICATED`. Another person's id, an unknown id, a malformed id
  and an already-revoked id all get the same `404 SESSION_NOT_FOUND`. A dependency failure gets
  `503 AUTH_UNAVAILABLE`.

## 3. Security mechanisms

- **`resolvePrincipal`** (`apps/api/src/auth/principal.ts`) is the gate for every authenticated
  route, shared with the MFA and password threads. It verifies the token (never `decodeUnsafe`),
  requires a `sid`, requires the account to be active with `tokenVersion` equal to the token's
  `ver`, validates the session against the account's current version, and requires the session to
  belong to the token's subject and tenant.
- **`CredentialRevocation`** (`apps/api/src/account/credential-revocation.ts`) revokes session rows
  and the refresh tokens bound to them in one tenant transaction, as the restricted role under
  FORCE RLS, with the account id in the `WHERE` clause. Ownership is part of the write, not checked
  in an earlier read.
- **`AccountLockdown`**: `disable` (status disabled, then token version bump, then full revocation)
  and `suspectedCompromise` (bump, then full revocation). Each step fails safe on its own. Neither
  has an HTTP route, because Identity has no administration API yet.
- **Audit (identity#10):** `session.revoked` for revoke-one, revoke-others and suspected compromise;
  `auth.account.locked` for disablement. They are written after the revocation commits, outside its
  transaction, and a failure is never fatal. They carry no token, IP or user-agent.

## 4. Defects in existing code found and fixed (identity#8)

| # | Defect | Fix |
| --- | --- | --- |
| D-1 | `PrismaSessionStore.update` wrote the whole record, including `revoked_at = null`. `SessionManager.touch`, which runs on every refresh, could undo a revocation that committed between its read and its write. | `update` only writes an unrevoked row, so revocation is one-way. |
| D-2 | Refresh compared the refresh record's token version with the session's. Both are copies of the value at sign-in, so a version bump (password change or reset) did not end old lineages. | Refresh re-reads the account first, refuses a stale version, and revokes the lineage and its session. |
| D-3 | Logout used `decodeUnsafe`, so a forged token naming another person's `sid` signed that person out. | Logout verifies signature, issuer and audience with only the expiry relaxed. It is still idempotent and still works with an expired genuine token. |
| D-4 | Refresh-token reuse revoked the lineage but left its session row valid. | `onReuseDetected` also revokes the bound session. |

Also: a `touch` that finds the session revoked is now a refusal, a sessionless lineage is refused,
`GET /api/auth/session` uses the principal gate, and the integration suites run one file at a time
(several truncate the shared database in their hooks).

## 5. Residual window (documented in Identity `docs/runbooks/revocation.md`)

After any revocation, every Identity route refuses the access token at once. **Munaxa Work verifies
JWTs without calling Identity**, so an access token already issued keeps working there until it
expires: at most `ACCESS_TOKEN_TTL` plus clock skew, about 15.5 minutes. No refresh can extend it.
This is unchanged by this work, and closing it is a separate decision (introspection or a version
check in Work).

## 6. Tests (actual results)

The CI install needs `PLATFORM_PACKAGES_TOKEN`, which sessions do not have. The local run built
`@munaxa/*` 2.4.1 from munaxa-platform `main` and packed them, installed them through temporary
overrides that were never committed, and reproduced `ci.yml` on PostgreSQL 16 with the non-superuser
`identity_mig` and `identity_app` roles and Redis.

| Point | Integration tests | Other checks |
| --- | --- | --- |
| Baseline `5277d71` | 62 passed | all green |
| identity#8 head `75439e2` | **99 passed** | format, lint, typecheck, build, prisma validate, unit: green; GitHub CI `verify` green (run 43024377537) |
| identity#10 head `7a6706b` | **103 passed** | same, locally |
| identity#10 rebased head `c238fc4` (on `fe60959`, after MFA #7) | **141 passed** (includes #7's tests) | GitHub CI `verify` green (run 43025340364) |

What the tests cover: cross-user and cross-tenant list and revoke, forged and sessionless tokens,
a subject that does not own the session, idle and absolute expiry, keeping the current session,
revoking the current session, eight concurrent revocations of one session (exactly one wins), a
stale whole-record write after a revocation, five rounds of rotation racing revocation, reuse
detection, a token-version bump, revocation with `except`, compromise, disablement, logout
idempotency, logout with an expired token, logout with a forged token, HTTP codes, cookie clearing,
a 503 on dependency failure, the audit payload contents, nothing audited for a refused revocation,
and a failing audit sink that does not undo the revocation.

**Mutation checks** show the tests catch the defects:
- Restoring the old `update` makes the stale-write test fail.
- Removing the refresh version check and restoring `decodeUnsafe` in logout makes the version-bump
  test and the forged-logout test fail.

## 7. Review and merge record

- Agent 4 review of #8 (at `75439e2`, the same content as `9cf4d59`): **approve**, no critical or
  high finding. Two medium findings:
  - M-1: the runbook overstated which flows call `revokeAllForUser`, and a code comment wrongly
    said `withTenant` joins an enclosing unit of work.
  - M-2: revocations had no audit events.
- Both are fixed in identity#10. Agent 4 approved it at `7a6706b`, and after the rebase onto `fe60959` re-approved it at exactly `c238fc4`; the range-diff showed only import context had changed. CI went green and this thread squash-merged it as `27d1fcc` at about 13:03 UTC.
- Open for #9 (password recovery): rebase onto `27d1fcc`, and restore the wording that `withTenant` joins `unitOfWork` once that exists.

## 8. Hand-offs to the other threads

- Password reset and change (Agent 2): call `security.revocation.revokeAllForUser(tenantId, userId,
  'password-reset' | 'password-changed')`. Each call is its own transaction until a shared unit of
  work exists. Bump the token version first, which already refuses every older token and lineage.
- MFA (Agent 1): call `revokeAllForUser(..., 'mfa-changed', { except: currentSessionId })` on MFA
  removal or replacement. Build MFA challenge-token refusal into `resolvePrincipal`.
- Until those PRs merge, the password and MFA rows in the revocation runbook describe a contract
  those flows must follow, not behaviour the service has today.
