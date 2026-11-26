# 06 - Munaxa-only staff sign-in: independent security review (round 2)

Date: 26 Nov 2026 (requested 20:43 UTC). Reviewer: independent review thread (review only; nothing pushed to, merged or deployed from the reviewed PRs).
Context: owner decision 26 Nov 2026. Docs and School staff sign in with their Munaxa account; parents and students keep School passwords.

## Verdict

**No Critical, High or Medium findings in any of the four PRs.** From a security standpoint all four may merge once CI is green. The school#33 Images check is red only for the known OpenSSL 3.5.9 Highs, which are also on main.

| PR | Head reviewed | Critical/High/Medium | Low | Info |
|---|---|---|---|---|
| munaxa-identity#34 truthful `email_verified` | `48686d9` | 0 | 0 | 2 |
| munaxa-school#33 staff passwords off, admin MFA | `f69c185` | 0 | 1 | 3 |
| munaxa-docs#193 PASSWORD_SIGN_IN, verified email, MFA roles | `0d69636` | 0 | 2 | 2 |
| munaxa-platform#204 Terraform wiring, emergency switch | `6fbee83` | 0 | 0 | 2 |

Closes round-1 items:
- identity#33 L-2: `email_verified` was always true (file 01).
- The underlying cause of school#32 M-1: email linking (file 04). The link-after-password-sign-in path is removed.

## munaxa-identity#34 (`48686d9`)

What I checked:
- A nullable `email_verified_at` with no backfill. Existing local accounts start unverified, which fails closed.
- The OIDC code record carries `emailVerified`, and the token emits `email_verified: record.emailVerified === true`.
- Verified means one of:
  - `email_verified_at` is set: by the operator command `account-email-verified`, which is a dry run unless `--apply`, needs `--reference`, refuses disabled accounts, is idempotent and is audited; or by a completed password recovery, which is proof of mailbox control.
  - The account is federated with a bound subject, which was checked at first bind (identity#32 M-1 fix).
- No identifier-change path exists.

Info:
- **I-1:** Any future change-email path must clear `email_verified_at`.
- **I-2 (rollout):** Operator-created accounts need `account-email-verified --apply` (or one recovery) before their first Docs or School sign-in, or they are refused with EMAIL_NOT_VERIFIED.

## munaxa-school#33 (`f69c185`)

What I checked:
- The link-offer cookie and the post-password linking are removed.
- `signInWithoutMunaxa` runs after the credential is proved, on the password login and on the Firebase exchange. All three `issueTokens` callers are covered, and the reset flow goes through the gated login. The policy:
  - Users whose roles are all Parent/Student are allowed.
  - Users with no roles are refused.
  - `emergency` also allows platform roles and SchoolAdmin, audited `auth.login.emergency`.
  - Everyone else gets 403, audited `auth.login.password_disabled`.
- Production defaults to `disabled`, and the env validation refuses to boot without `IDENTITY_SIGN_IN=enabled`.
- Privileged roles (SchoolAdmin, Principal, VicePrincipal, FinanceOfficer, Accountant, HR, platform roles) need `acr=mfa` at the first link and on every sign-in.

Findings:
- **L-1 (Low):** Emergency mode is password-only for the most privileged accounts, because School passwords have no second factor. Mitigations: an owner-controlled switch, auditing and lockout. Document "switch on, sign in, switch off" and alert on `auth.login.emergency`.
- **I-1:** R-1 from file 04 persists: privilege is decided by role names.
- **I-2:** Staff refresh tokens issued before the switch survive it. Revoke them at rollout.
- **I-3:** `acr=mfa` may be an attestation under `trust_provider_mfa` (file 00 L-1).

## munaxa-docs#193 (`0d69636`)

What I checked:
- PASSWORD_SIGN_IN is checked after the password and any enrolled MFA, and only for tenants where federation is in force: feature on, entitlement included, provider enabled. The refusal is 401 `FEDERATED_SIGN_IN_REQUIRED`, audited.
- `emergency` admits `TENANT_ADMIN` only, audited `method: PASSWORD_EMERGENCY`.
- The web redirect to Sign in with Munaxa is UX only; the API is the gate.
- Refresh tokens and API clients involve no password.
- Federation:
  - `email_verified === true` is required for email matching and for JIT; otherwise only a subject match succeeds (EMAIL_NOT_VERIFIED).
  - `MFA_REQUIRED_ROLES` need `acr=mfa` or a second-factor `amr`. This applies to existing users and to JIT role sets, before anything is linked.

Findings:
- **L-1 (Low):** The provisioning-race path skips the second-factor check. After a unique conflict, the `winner` is linked and signed in without `needsSecondFactor`. Fix: run the check once on the final `userId` before `createFamily`, and add a test.
- **L-2 (Low, confirmed in a follow-up PR comment):** `MfaService.isRequired` is true only for a confirmed enrolment, and the password path does not enforce `MFA_REQUIRED_ROLES`. Under `emergency`, a TENANT_ADMIN who never enrolled Docs MFA therefore signs in with the password alone. This already exists in `enabled` mode, but it matters more now because Munaxa-only admins will rarely enrol Docs MFA. Fix: require a confirmed enrolment in the emergency branch.
- **I-1:** A tenant admin can turn `feature.federation` off and so restore passwords. This is by design (no lockout); make sure the change is audited.
- **I-2:** Revoke pre-switch password sessions at rollout.

## munaxa-platform#204 (`6fbee83`)

What I checked:
- **Docs:** `PASSWORD_SIGN_IN` is `disabled`/`emergency` only when an Identity client has a redirect under the Docs origin, and explicitly `enabled` otherwise. The API and the web get the same value.
- **School:**
  - Without `school_identity_sign_in`, `STAFF_PASSWORD_SIGN_IN=enabled` is set explicitly. This is needed because school#33 would otherwise refuse to boot in production.
  - With it, the value is `disabled`/`emergency`.
  - The env goes only to `school-api`. The bootstrap seed task does not load the env validation.
- `password_sign_in_emergency` defaults to false, and the tests cover off, on and emergency.
- No secret, IAM or network change.

Info:
- **I-1:** The School bootstrap's seeded platform owner holds a platform role. Link it through Identity (verified address, MFA) before applying, or it can sign in only under emergency.
- **I-2:** Add a runbook check or alarm so the emergency flag goes back to false after use.

## Open follow-ups (none block merging)

- docs#193 L-1 (race path MFA check) and L-2 (emergency requires a confirmed Docs MFA enrolment).
- school#33 L-1: emergency runbook and an alert on `auth.login.emergency`.
- Rollout: mark operator accounts verified (identity#34), link the School platform owner, revoke pre-switch staff sessions. Applying platform#204 is a separate owner decision.
