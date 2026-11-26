# Independent security review: School as OIDC relying party of Identity (munaxa-school#32)

Date: 26 Nov 2026. Review only. PR https://github.com/munaxa/munaxa-school/pull/32, head `7187107c776938c0d42ed43cf4882f57c20d93e7`. Posted as a GitHub review (COMMENT).

## Verdict

**No Critical or High findings.** 1 Medium, 2 Low, 2 informational. Fix M-1 before `IDENTITY_SIGN_IN` is enabled for any school (off by default).

| Id | Severity | Finding | Recommendation |
|---|---|---|---|
| M-1 | Medium | First-use linking binds any unlinked School user (including administrators) whose email matches the id token, relying on Identity's `email_verified: true`, which Identity asserts for every operator/org-admin-entered identifier (identity#33 L-2). Whoever can create an Identity account in the paired organisation can take over an unlinked School account, or pre-empt the real user. Limited to the paired organisation. | Link only School-admin-marked or pre-provisioned users, or exclude privileged roles from email auto-link, or make Identity assert `email_verified` only for verified addresses; add an e2e test. |
| L-1 | Low | No upper age bound on `iat`, `auth_time` unchecked. | Refuse `iat` older than ~10 minutes. |
| L-2 | Low | `start` reveals which school codes exist. | Uniform response. |
| I-1 | Info | School has no MFA of its own; privileged roles rely on Identity. | Require `acr: mfa` for admin roles. |
| I-2 | Info | `mustChangePassword` users are sent to `/change-password` after an Identity sign-in. | Check the flow. |

## Checked and correct

- Id token: ES256 only; key by `kid` from configured public keys; P1363 signature; exact issuer; audience and `azp`; `exp`/`nbf`/`iat` skew; constant-time nonce; `org` binding; `sub`; email shape.
- State/nonce/PKCE: random, S256, in an HttpOnly Lax 10-minute cookie, `__Host-` in production, cleared with matching (Secure) options; state compared in constant time first (login CSRF blocked); token call with `redirect: 'error'` and timeout.
- Subject pinning: unique `(tenantId, identitySubject)`; a linked user only signs in with that subject.
- Meta-refresh continuation: fixed targets only, `no-store`, `no-referrer`; all failure redirects relative and fixed.
- Account rules: nobody created; deleted, blocked and subscription-refused users refused; audited.

## Re-review at `bc09f72263a80c24faef732f0a58c6aa7560b2e2`

Verdict unchanged: no Critical or High.

- **M-1 resolved for privileged accounts.** Platform roles and SchoolAdmin, Principal, VicePrincipal, FinanceOfficer, Accountant and HR are never linked by email alone. The callback sets an HMAC-sealed link offer (HKDF key with its own label, `__Host-`, HttpOnly, Lax, 10 min) that completes only on the same browser's next successful password sign-in, for the same school and email, for an unlinked user, with a subject not held by anyone else. Forgery and expiry are refused (tested).
- **L-1 fixed.** `iat` is required and at most 10 minutes old. **L-2 accepted** (documented).
- New residual **Lows**: R-1, the check uses role names, so a custom role with admin permissions would still auto-link (base it on permissions). R-2, a user linked by email while non-privileged keeps the link after promotion (clear or re-link on promotion), relevant while Identity's `email_verified` stays unconditional (identity#33 L-2).
