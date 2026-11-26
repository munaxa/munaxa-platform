# Company sign-in with Microsoft 365 or Google: what exists, and a proposal

**Date** 26 Nov 2026 · **Asked by** Tamer (owner), 17:52 UTC · **Type** repository research and design proposal only. Nothing was implemented, merged, deployed or changed in AWS.

Repositories read at: munaxa-identity `7641300`, munaxa-platform `2cd99e3`, munaxa-docs `75cdcc3`, munaxa-work `ad96f98`, munaxa-control `3213275`, munaxa-school `06c34e2` (all `main`).

## 1. Short answer (for the owner)

**Not today for Work and Control. Partly for Docs.**

- **Munaxa Work and Munaxa Control** sign people in through **Munaxa Identity**, which today accepts only a Munaxa email and password (plus the Munaxa authenticator code where required). A company cannot yet use its Microsoft 365 or Google accounts there. The groundwork is in place (the account table already has room for "this person signs in through their company", and the shared Platform library already contains a Microsoft and Google sign-in client), but nothing connects them.
- **Munaxa Docs** still has its own separate user list. Its server side **already supports company sign-in** (Microsoft Entra ID, Google Workspace or any OpenID Connect provider), switched on per company, off by default, and only on plans that include the SSO feature. But the Docs sign-in screen has no "Sign in with Microsoft/Google" button yet, so it cannot be used from the browser today.
- **Munaxa School** has its own passwords and no company sign-in.

**Proposal:** add "Sign in with Microsoft" and "Sign in with Google" to Munaxa Identity once, as an **optional per-company setting**. Normal Munaxa passwords keep working for companies that do not opt in, and at least one local administrator stays as a fallback for companies that do. Work and Control need **no change**: they trust Munaxa Identity's tokens, not the method used to sign in.

**Effort (estimate, not measured):** about **2 weeks** of implementation and review for the first phase in the repository (Identity only), plus owner steps later (create the Microsoft and Google app registrations, one secret each in AWS, then a deploy). Section 4 has the breakdown.

## 2. Evidence: what exists today

| Area | Finding | Evidence |
| --- | --- | --- |
| Identity sign-in | Password only. Routes are `/api/auth/login`, refresh, logout, MFA, reauthenticate; no external-provider route. | munaxa-identity `README.md` API table; `apps/api/src/auth/auth.controller.ts` |
| Identity known limits | "**Federation is not wired.** The account model carries `identity_source` and `external_id` from the first migration so adopting an external provider later is not a backfill." | munaxa-identity `README.md` "Known limits" |
| Identity data model | `identity_account.identity_source` (`local` / `federated`), `external_id`, `identity_provider_id` (uuid), nullable `password_hash`, unique index `(tenant_id, identity_provider_id, external_id)`. No provider configuration table yet (the uuid column points at nothing). | `prisma/schema.prisma`; migration `20260901120000_identity_baseline` lines 8, 35-36, 160 |
| Platform library | `OidcProvider` (authorization code flow, mandatory PKCE, constant-time `state`, nonce, server-side code exchange), presets `google`, `microsoft(tenant)`, `azureAd(tenant)`, and an `IdentityProviderRegistry`. SAML is a placeholder that throws. Not used by any product. | munaxa-platform `packages/platform/auth/src/providers.ts` |
| Platform gaps for our use | (a) The id token signature is not checked (it relies on the token arriving over TLS from the provider's token endpoint; allowed by OpenID Connect for this flow, but checking the signature against the provider's keys is the safer default). (b) The Google preset does not check the `hd` (Workspace domain) claim, so any Google account, including a personal Gmail, passes unless the product checks it. (c) Microsoft presets are single-company (`tenant` in the URL), which fits per-company setup. | same file, `decodeIdTokenClaims`, `providerPresets` |
| Work | Never authenticates anybody; verifies Identity-issued tokens with public keys (issuer, audience, algorithm, keys) and asks Identity whether the session is still live. | munaxa-work `packages/config/src/platform-authentication.ts` |
| Control | Operator routes accept only an Identity access token (signature, issuer, audience, Munaxa Group organisation, live session, MFA when required, permissions). | munaxa-control `apps/api/src/auth/authentication.guard.ts` |
| Docs | Own accounts and its own token signing. Has `auth/federation` (discover by email domain, callback), per-tenant provider admin, signature-verified id tokens (`domain/oidc.ts` with JWKs), JIT provisioning to mapped roles, licence feature `sso.federation`, tenant setting `feature.federation` default `false`, local passwords unaffected. Docs web app has no code calling `auth/federation`. | munaxa-docs `apps/api/src/modules/identity/application/federation.service.ts`, `presentation/federation.controller.ts`, `packages/domain/src/settings.ts` `FEATURE_FEDERATION`, `packages/domain/src/licensing.ts`; search of `apps/web/src` |
| School | Own password service, no SSO. | munaxa-school `apps/api/src/auth/services/` |

## 3. Proposed design (Munaxa Identity, Phase 1)

### 3.1 What the person sees
The Identity sign-in page shows the usual email and password form. When the email's domain belongs to a company that has switched on company sign-in, the page sends the person to Microsoft or Google instead of asking for a password. After they sign in there, they land back in Munaxa already signed in, exactly as after a password sign-in. (Same "domain decides" pattern Docs already uses.)

### 3.2 Per-company opt-in
- New table `identity_provider` (per organisation): provider type (`microsoft` or `google`), the company's Microsoft tenant id or Google Workspace domain, the email domains it covers, `enabled` flag, `allow_password_fallback` flag, `trust_provider_mfa` flag (default off). Row-level security like the other tenant tables.
- Munaxa itself registers **one** multi-company app with Microsoft and **one** OAuth client with Google. Each customer's IT admin approves ("consents to") the Munaxa app in their own Microsoft or Google admin console. Customers do not send us any secret.
- Configured by an operator command first (same pattern as ADR-0006: no admin API exists yet). A self-service admin screen is Phase 2.

### 3.3 Who can sign in: pre-created users (recommended), JIT later
- **Phase 1: pre-created.** An administrator creates the person in Munaxa as today, with their work email and roles, but no password. The first time they sign in through Microsoft/Google, Identity links the account to the provider's stable id (Microsoft `tid`+`oid`, Google `sub`) and from then on matches only on that id, never on the email again. Someone who is not pre-created is refused. This keeps "who has access and with which role" decided in Munaxa, which matters for HR and payroll data in Work.
- **Phase 2 (optional): just-in-time creation.** Unknown people from the company's domain get an account with a default minimal role (or roles mapped from Microsoft groups). Docs already does this and its reasoning applies: the mapping decides the starting roles only; it is not re-synchronised on every sign-in.

### 3.4 Security rules (non-negotiable in the implementation)
1. Match people by the provider's stable id, not by email (email in Microsoft tokens can be changed by a tenant admin and is not proof of ownership; Google recommends `sub`).
2. Microsoft: accept only tokens whose issuer is the configured company tenant. Google: accept only tokens whose `hd` equals the configured Workspace domain, which also blocks personal Gmail accounts.
3. Verify the id token signature against the provider's published keys (Docs already does this; Platform should gain it).
4. Keep Platform's PKCE, `state` and nonce checks; store the pending sign-in server-side with a short lifetime (Docs uses 10 minutes).
5. One generic error message for every failure; the audit log records the real reason and that the sign-in was by Microsoft/Google (`auth_methods` already supports `microsoft` and `google`).
6. Rate limits on the new routes the same as the login route.
7. The Microsoft and Google client secrets live in AWS Secrets Manager and reach the Identity task as secrets, like the existing ones.

### 3.5 Local accounts as fallback
- Companies that do not opt in: no change at all.
- Companies that opt in: their people sign in through the company by default. At least one company administrator keeps a Munaxa password plus Munaxa MFA as break-glass, so a Microsoft/Google outage or a misconfiguration cannot lock the company out. `allow_password_fallback` decides whether other people may still use a password.
- Munaxa Group staff (Control operators) stay on local accounts with Munaxa MFA unless the owner decides otherwise.

### 3.6 How it interacts with existing hardening
| Feature | Behaviour for company sign-in users |
| --- | --- |
| **MFA** | Microsoft and Google do not reliably tell us whether the person used MFA. So by default Munaxa's own `MFA_POLICY` still applies: a person holding a privileged role is asked for the Munaxa authenticator code after the company sign-in. A company can switch on `trust_provider_mfa` (the company takes responsibility for enforcing MFA on its side); then Munaxa does not ask again. Control operators always need Munaxa MFA. |
| **Password reset / change** | Not applicable: the company manages the password. Identity refuses reset and change for accounts without a local password and the page says "Your password is managed by your company". |
| **Sessions** | Unchanged: same Munaxa session, refresh rotation, reuse detection, "sign out other sessions", and the up to about 16.5 minutes before Work notices a revocation. |
| **Leaver** | When a company disables someone in Microsoft/Google, they cannot sign in to Munaxa again, but a Munaxa session already open lives until it expires. Disabling the person in Munaxa ends it immediately (existing revocation). Phase 2 can shorten this with a shorter session for company sign-in users. |

### 3.7 Not in scope
SAML (Platform has only a placeholder; OpenID Connect covers Microsoft 365 and Google Workspace), automatic user sync (SCIM), and moving Docs or School onto Munaxa Identity. For Docs, the cheaper path is to add the sign-in button to the Docs web app on top of its existing server support (about 2 to 3 days), when the owner wants it.

### 3.8 Follow-up question from the owner (18:00 UTC): unify sign-in across all apps?

Recommendation: **yes, unify on Munaxa Identity** (not the reverse). Today there are three sign-in systems: Identity (Work, Control), Docs' own accounts, and School's own accounts (`munaxa-school/apps/api/src/auth/services/token.service.ts`, `password.service.ts`). Identity is the hardened shared authority (MFA, session revocation, rate limits, refresh reuse detection) and Work and Control already depend on it, so adding Microsoft/Google there once serves every app that uses it. Suggested order: (1) company sign-in in Identity (this proposal), (2) move Docs onto Identity (larger: Docs users, roles and document ACLs reference Docs' own user ids; not yet measured), (3) move School onto Identity before it has real users. Docs' federation code is the reference implementation for step 1. Step 1 does not block steps 2 or 3.

## 4. Phases and effort (estimates)

| Phase | Content | Estimate |
| --- | --- | --- |
| 1 (repository) | Platform: id-token signature check and Google `hd` check (minor release). Identity: `identity_provider` table and migration, start/callback routes, account linking, refusal of reset for SSO accounts, MFA rule, sign-in page change, operator command, audit, rate limits, tests, runbook. | about 8 to 10 working days incl. review |
| 1 (owner, later) | Create the Microsoft app registration and Google OAuth client (Claude prepares click-by-click steps), store the two secrets in AWS, approve a Testing deploy. Customer admin consents once per company. | short owner steps, separate approval |
| 2 (optional) | JIT creation, Microsoft group to role mapping, admin screen, shorter sessions for SSO users. | about 5 to 8 working days |
| Docs | Add the sign-in button to the Docs web app on top of the existing server side. | about 2 to 3 working days |

Costs: Microsoft Entra ID and Google sign-in for this use are free on their side; no new AWS service.

## 5. Owner decision

**One yes/no:** Build Phase 1 (Microsoft 365 and Google sign-in in Munaxa Identity, opt-in per company, pre-created users, local fallback) **in the repositories only**? Nothing is deployed or changed in AWS; deploying would come back as a separate approval.

## 6. Sources

- Repository files listed in section 2.
- Microsoft: [ID token claims and optional claims reference](https://learn.microsoft.com/en-us/entra/identity-platform/optional-claims-reference), [access token claims reference](https://learn.microsoft.com/en-us/entra/identity-platform/access-token-claims-reference) (use `tid`/`oid`, not email, as the identifier).
- Google: [OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect) and [OpenID Connect reference](https://developers.google.com/identity/openid-connect/reference) (`sub` as the identifier, `hd` for the Workspace domain).
- Uncertainty stated: whether Microsoft and Google id tokens carry a usable MFA claim (`amr`) was not confirmed; the design does not depend on it.
