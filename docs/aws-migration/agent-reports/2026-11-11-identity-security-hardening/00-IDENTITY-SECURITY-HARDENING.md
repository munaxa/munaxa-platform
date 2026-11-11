# Identity security hardening: MFA, password recovery, session management

**Date** 11 Nov 2026 · **Repository** `munaxa/munaxa-identity` · **Authorised by** the owner at
12:41 UTC (repository code, migrations, tests, CI and docs only; autonomous squash merge after
checks and an independent review), and "when you finish merge all PRs" at 12:57 UTC.

**Result: DONE in the repository. Seven PRs merged to `main`. Nothing was deployed.** Every PR was
squash-merged with CI `verify` green on its head. The independent reviewer (Agent 4) signed off on
every head SHA that was merged, with one exception (#8, see section 4). No critical or high
finding is open.

Labels: **[V]** verified from GitHub or a local run, **[O]** owner action required.

## 1. What merged [V]

| PR                                                         | Agent | Head reviewed and merged | Squash commit | Merged (UTC) | Scope                                                                                                                                       |
| ---------------------------------------------------------- | ----- | ------------------------ | ------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| [#8](https://github.com/munaxa/munaxa-identity/pull/8)     | 3     | `75439e2`                | `9cf4d59`     | 12:56:25     | Session list and revoke (own sessions), one-way revocation, refresh re-checks                                                               |
| [#7](https://github.com/munaxa/munaxa-identity/pull/7)     | 1     | `2b6c72a`                | `fe60959`     | 12:59:30     | MFA persistence and encryption on Platform `MfaService` (migration, key ring, recovery-code HMAC)                                          |
| [#10](https://github.com/munaxa/munaxa-identity/pull/10)   | 3     | `c238fc4`                | `27d1fcc`     | 13:02:27     | Sessions follow-up: revocation audit events, corrected unit-of-work and runbook claims (closes #8 M-1, M-2)                                 |
| [#9](https://github.com/munaxa/munaxa-identity/pull/9)     | 2     | `d42d63e`                | `9639ccb`     | 13:04:45     | Password reset with atomic completion and fail-closed delivery                                                                              |
| [#11](https://github.com/munaxa/munaxa-identity/pull/11)   | 2     | `819e019`                | `51fbcd0`     | 13:07:48     | Authenticated password change, one transaction, every session ends                                                                          |
| [#12](https://github.com/munaxa/munaxa-identity/pull/12)   | 1     | `4f166ce`                | `c64e168`     | 13:20:13     | MFA login challenge, enrollment, recovery codes, reauthentication, policy; password-change step-up                                          |
| [#13](https://github.com/munaxa/munaxa-identity/pull/13)   | 1     | `62d490a`                | `c3928e8` | 13:32:53   | Operator commands (lost-device reset, account disable, pre-enforcement session revocation, MFA re-encryption), production readiness, ADRs |

`main` moved from `5277d71` (the image pinned for the first nonprod session) to `c3928e8`.

## 2. Architecture changes

- **TOTP MFA (ADR-0005, supersedes ADR-0003).**
  - TOTP comes from Platform's `MfaService`; Identity implements no TOTP of its own.
  - Secrets are AES-256-GCM envelopes under a dedicated key ring (`MFA_ENCRYPTION_KEYS`, HKDF subkeys), bound to tenant, account and method by AAD. The key ring refuses the JWT signing key and the refresh-token pepper.
  - Recovery codes are stored as `HMAC(subkey, sha256(code))` with the key id, and are consumed atomically.
  - TOTP replay protection is fleet-wide in Redis. Production refuses to start without the key ring or Redis.
- **Sign-in challenge.**
  - A right password for an account that needs a factor yields an opaque 256-bit single-use challenge, held in a `__Host-mx_mfa` cookie (Secure, HttpOnly, SameSite=Strict). It is stored in Redis under its hash and spent by an atomic `DEL`.
  - No session or token exists before the factor is proven. Tokens carry `amr` and `mfa` claims, and refresh preserves them.
  - Each challenge is bound to the user agent and to the account's token version.
  - The per-challenge and per-account attempt limits are reserved (`INCR`) before the factor is checked.
- **Policy and step-up.**
  - `MFA_POLICY` is `off`, `privileged` (with `MFA_PRIVILEGED_ROLES`) or `all`. The default is `off`; the production target is `privileged`.
  - Enrolling from a session, replacing or removing a factor, regenerating recovery codes and changing the password all require a recent reauthentication with the factor.
  - Signing sessions out is deliberately not gated.
- **Password recovery (Agent 2).**
  - One-time reset links. Completion runs in one transaction that also revokes every session and outstanding link.
  - Delivery fails closed, and production refuses `IDENTITY_PASSWORD_RESET=enabled` because no production email transport exists yet.
  - Reset never changes MFA, and completing a reset never signs the person in.
- **Sessions (Agent 3).**
  - People can list their own sessions and revoke one or all others.
  - Revocation is one-way and audited, and refresh re-checks it.
  - `CredentialRevocation` and `AccountLockdown` are shared by every flow.
- **Operator commands (ADR-0006).**
  - The commands are `mfa-reset`, `account-disable`, `sessions-revoke-unsatisfied` and `mfa-reencrypt`. They run as one-off tasks of the Identity service through its own code, row-level security and audit chain.
  - They dry-run unless `--apply` is given, require a ticket reference that becomes the audit actor, and take no secrets as arguments.
  - There is no administration API.

## 3. Migrations (added, not executed anywhere live) [V]

One new migration: `prisma/migrations/20261111130000_identity_mfa`.

- It creates `identity_mfa_enrollment` and `identity_mfa_recovery_code`, both with FORCE ROW LEVEL SECURITY and the `tenant_isolation` policy, and with `identity_app` grants limited to select, insert, update and delete.
- A check constraint refuses any secret that is not an encrypted envelope.
- It is additive, so the previous image runs against the migrated schema.
- Password reset and sessions needed no migration, because their tables are in the baseline.
- CI now applies every migration in order instead of a hard-coded path, and its grant list includes the new tables.

## 4. Review findings and resolutions [V]

Agent 4 posted every review on its PR. The findings that blocked a merge or that the reviewer asked to have fixed:

| PR  | Finding                                                                                                                            | Resolution                                                                                                               |
| --- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| #7  | M-1 the active-view `save` accepted any record, which could overwrite the live factor                                                | `save` on the active view always throws; tested (`verifier().begin/confirm` refused, ciphertext unchanged)               |
| #7  | M-2 a new production prerequisite (MFA key ring) was not documented as blocking                                                      | Documented in the MFA runbook, secrets inventory and the production readiness checklist                                  |
| #8  | M-1 the docs claimed revocation joined an enclosing transaction; M-2 revocations were not audited                                      | Fixed in #10                                                                                                             |
| #9  | M-1 reset links carry the token in the query string, so ALB and CDN access logs would hold live reset credentials | Resolved as a blocking prerequisite in #9: those logs off or treated as secret before reset is enabled anywhere |
| #9  | M-2 production refuses to start with the default `IDENTITY_PASSWORD_RESET=enabled`, a new deployment prerequisite | Resolved in #9 by documentation as a blocking prerequisite (`IDENTITY_PASSWORD_RESET=disabled`) |
| #11 | M-1 password change needed a step-up for accounts with a factor                                                                     | Fixed in #12 (403 `AUTH_REAUTHENTICATION_REQUIRED`, fails closed)                                                        |
| #12 | **H-1** the MFA attempt limits were check-then-act, so concurrent guesses bypassed both limits                                      | Counters reserved before the check. Tests count real factor checks under concurrency (20 → ≤3, 12 → ≤6, 20 reauth → ≤6); all fail on the old head |
| #12 | M-1 enrolling through the sign-in challenge did not end pre-enforcement sessions                                                     | Revokes every session first; runbook and `sessions-revoke-unsatisfied` cover accounts that do not sign in again          |
| #12 | L-1 production `MFA_POLICY` target; L-2 trust on first enrollment | Carried to #13 and closed there (readiness checklist target `privileged`; ADR-0005 risk and mitigations) |
| #13 | M-1 `mfa-reset` removed the factor before revoking sessions, in separate transactions                                                | Sessions revoked first, so a partial run fails safe; injected-failure test                                               |
| #13 | L-1 to L-3: authorisation surface, email address in task overrides, re-encryption not audited                                        | Full surface documented; `--account-id` preferred; `crypto.key.rotated` audited with a required reference                |

**Process exception (#8).** #8 was merged at 12:56:25. Agent 4's review of that head (`75439e2`) was
posted at 12:56:35, ten seconds later. The review approved that exact head with no critical or high
findings, and its two medium findings were fixed and reviewed in #10. GitHub records the merge as
made by `tam2om` (the account every agent acts through). The PR's author, Agent 3, reports that it
did not merge it, and which session or person did is not identified. The coordinator was told. Every later merge waited for the review of its exact
head.

Informational items accepted, not changed:
- A successful verification resets the account's failure counter. The per-challenge cap still holds, and every challenge needs the password.
- Between the two steps of `mfa-reset`, a fresh sign-in by whoever holds the lost device could survive for a few milliseconds. Closing it would take a second revocation after the removal; that is a possible follow-up.

## 5. Tests and CI [V]

- **GitHub CI `verify`** passed on every merged head. That job runs format, lint, Prisma, typecheck and build; migrations from zero as a non-superuser owner; the `identity_app` grants; unit tests; the integration, security and conformance suites against Postgres 16 and Redis 7; catalogue drift; the key-material and secret-value greps; and `pnpm audit`.
- **Final local replica of `ci.yml`** on the #13 head: 46 unit tests (config) and 217 integration tests in 14 files, all passing. The baseline at `5277d71` was 23 unit and 62 integration tests.
  - The audit step cannot run in this session, because GitHub Packages answers 401. CI runs it.
- **New suites in this series:**
  - `mfa-store` (persistence and encryption);
  - `mfa-flow` (two replicas: challenge, single spend, concurrency bounds, replay, binding, policy, step-ups);
  - `mfa-http` (cookie attributes, no secrets in logs);
  - `operator` (11 tests);
  - Agent 2's recovery and password-change suites;
  - Agent 3's session suites.

## 6. Remaining risks

- **MFA enforcement is off until configured.** `MFA_POLICY` defaults to `off`.
- **Trust on first enrollment** (ADR-0005). Until an account has a factor, whoever holds its password can enroll theirs. Mitigations: enroll privileged accounts at provisioning, and review `auth.mfa.enrolled` audit events.
- **No production password reset** until an SES task-role transport exists. Reset links carry the token in the URL, so ALB and CDN logs on that path must be off or treated as secret before reset is ever enabled.
- **Revocation reaches Munaxa Work only at access-token expiry**, up to about 16½ minutes.
- **The operator commands' power** is held by anyone who can run, exec into, or redefine the Identity task, or read its secrets. In this project those operations are currently done as root.
- **Platform follow-ups** (reported, not forked):
  - claim the TOTP step in `confirmTotpEnrollment`;
  - a `regenerateRecoveryCodes` method;
  - a context-bound `protectSecret`.

## 7. Production deployment prerequisites [O]

The full checklist is `docs/production-readiness.md` in munaxa-identity. It applies to **any image built after `5277d71`**; the pinned nonprod image `5277d71` is unaffected. Blocking items:

1. A new secret, `MFA_ENCRYPTION_KEYS_FILE`, generated where it is stored (32 random bytes per entry, `kid=key`). Production refuses to start without it.
2. `MFA_ENCRYPTION_PRIMARY_KID` set.
3. `REDIS_URL` pointing at the shared Redis.
4. `IDENTITY_PASSWORD_RESET=disabled`.
5. `MFA_POLICY=privileged` with `MFA_PRIVILEGED_ROLES`, after privileged accounts have enrolled. Then run `sessions-revoke-unsatisfied` per organisation.
6. Migration `20261111130000_identity_mfa` applied by the migration job before the new image starts.
7. Permissions that can act as the Identity service restricted to the operators who may reset or disable accounts.

## 8. Confirmation of scope [V]

No AWS API call, Terraform, CloudFormation, ECS, RDS, Secrets Manager, KMS, IAM, DNS, Cloudflare or network change was made. No secret was created, generated, retrieved or printed. No workflow was dispatched. No migration ran against a live environment. Nothing was deployed. Tests ran only against throwaway local databases and generated test keys. No real credentials or customer data were used, and the Testing operator's email appears nowhere.
