# Independent security review: Identity company sign-in (munaxa-identity#32)

Date: 26 Nov 2026. Reviewer: independent Claude thread (review only; nothing pushed to the PR branch, nothing merged, nothing deployed).
PR: https://github.com/munaxa/munaxa-identity/pull/32, head `ef7bb526ea29209d3cc97a5322f3711734145d9b`.
Review posted on the PR as a GitHub review (event COMMENT) with three inline findings.

## Verdict

**No Critical and no High findings.** 1 Medium, 2 Low, 3 informational.
The PR may merge under the standing merge rule once its required checks are green. M-1 is small and should be fixed before any environment turns on `IDENTITY_SSO=enabled` (it is off by default, so merging alone exposes nothing).

## Scope

OIDC authorization-code flow; ID token verification (signature, alg, iss, aud/azp, exp/nbf/iat, nonce); state, PKCE, login-CSRF binding; Microsoft tenant pinning and Google `hd`; account binding to pre-created users; blocking personal Gmail / consumer Microsoft accounts; migration, constraints and row-level security; interaction with MFA, sessions, password recovery and rate limiting; operator commands.
Files read in full: `apps/api/src/sso/*.ts`, the migration, the auth/mfa/password/rate-limit diffs, `ops/sso-operator.ts` (create, convert, disable), test titles in `packages/testing/src/sso.integration.test.ts`.

## Findings

| Id | Severity | Where | Finding | Recommendation |
|---|---|---|---|---|
| M-1 | Medium | `apps/api/src/sso/providers.ts` 96-106 | Entra B2B guests, including personal Microsoft accounts invited as guests, are not rejected: their tokens from the tenant endpoint carry the company's `iss` and `tid`. The first bind then trusts the `email` claim (directory `mail`), which Entra does not restrict to verified domains. A guest whose `mail` is in a company domain could claim a still-unbound pre-created account. Needs an unbound account plus a guest object in the company's tenant, so not High, but it contradicts "consumer Microsoft accounts are blocked". | Refuse tokens with an `idp` claim that is not the tenant's own issuer; for the bind prefer `preferred_username` (UPN, verified-domain suffix) or require `xms_edov`; add a guest-shaped token test. |
| L-1 | Low | `apps/api/src/sso/sso.service.ts` 378 | `trust_provider_mfa` marks MFA satisfied without evidence from the token. Off by default, operator-only, documented. | For Microsoft require `amr` to contain `mfa` when present; audit whether provider MFA was evidenced. |
| L-2 | Low | migration line 86 | `identity_account.identity_provider_id` FK is not composite with `tenant_id`; schema allows an account to name another organisation's connection. Not exploitable via this PR. | Composite FK `(identity_provider_id, tenant_id)`, as the domain table already does. |
| I-1 | Info | design | A session survives deprovisioning at the company until expiry or operator action (no back-channel in Phase 1). | Runbook line. |
| I-2 | Info | `/api/auth/sso/start` | Reveals whether a domain has company sign-in. Inherent to domain routing. | None. |
| I-3 | Info | `bind` | A disabled pre-created account is bound before the status check, then refused. Harmless. | None. |

## Checked and found correct

- ID token: asymmetric alg allow-list tied to key type (no `none`, no HS/RS confusion); exact issuer; audience and `azp`; `exp`/`nbf` with 60 s skew; `iat` required and at most 24 h; nonce in constant time; `sub` required; ES signatures in P1363 form.
- JWKS: TLS, 10 s timeout, 256 KB cap, encryption keys dropped, 1 h cache, unknown-kid refetch limited to once a minute, failure refuses.
- Flow: random state/nonce/PKCE S256; state stored as a digest, single use, consumed before binding check; `__Host-` HttpOnly Secure Lax binding cookie plus user-agent digest against login CSRF; 10 min TTL; callback only for trusted origins; `returnTo` sanitised; connection re-read at callback; token response size-capped.
- Provider pinning: Microsoft tenant endpoints, issuer and `tid`, `oid` as GUID; Google `hd` checked inside the token, `email_verified` required, personal Gmail refused (tested); email domain must belong to the connection.
- Binding: no just-in-time creation; only operator-created unbound federated accounts of the same connection; race-safe conditional update; afterwards match by `oid`/`sub` only; password accounts never bound by sign-in; DB constraint forbids a federated account with a password.
- RLS: connections tenant-isolated and forced; domains globally unique, readable for lookup, writable only by the owning tenant; no DELETE on connections.
- MFA, sessions, recovery: enrolled accounts still challenged, privileged without a factor sent to enrollment only; `amr` records the provider; no password reset for passwordless accounts, old links cannot set a password; convert removes the password, ends sessions, keeps a break-glass local account; disable with `--end-sessions` revokes sessions.
- Rate limiting: start and callback counted per IP; outbound token exchange only after a valid single-use state.

## CI

At review time (18:40 UTC) checks `verify` and `Images (runtime and migrate)` were in progress on `ef7bb52`. The implementing thread merges only when they are green.
