# Unified sign-in on Munaxa Identity (26 Nov 2026)

**Status: DONE in the repositories. Nothing is deployed, applied, published or written to AWS.**

Owner direction (26 Nov, 18:05 and 18:25 UTC): proceed with all three proposed steps from
`2026-11-26-identity-sso-option/` (platform#199), build Microsoft and Google sign-in in code, and
make sure the changes are ready when Docs and Work Testing starts.

## What changed, in plain language

1. **Munaxa Identity** can now let people sign in with their company Microsoft 365 (Entra ID) or
   Google Workspace account, per organisation, when that organisation turns it on. Work and
   Control already sign in through Identity, so they get this with no change of their own.
2. **Munaxa Docs** can now sign in through Munaxa Identity ("Sign in with your company account").
   Docs' own password sign-in stays as it is.
3. **Munaxa School** (admin site) can now sign in through Munaxa Identity ("Sign in with Munaxa"),
   per school. School's own password sign-in stays as it is.
4. **The AWS stack (Terraform)** has optional, off-by-default settings for all three. With the
   settings empty, the Testing plan is unchanged.

Result: one Munaxa account (and optionally one company Microsoft or Google account) works in Work,
Control, Docs and School.

## Pull requests

| Repository | PR | Merge commit | What |
| --- | --- | --- | --- |
| munaxa-identity | #32 | `67b059d` | Microsoft and Google sign-in (per-organisation, off by default) |
| munaxa-identity | #33 | `5660d6e` | Identity as an OIDC provider for Docs and School (ADR-0008) |
| munaxa-platform | #201 | `0d9a028` | Stack wiring for Identity SSO (`identity_sso_config`) |
| munaxa-platform | #202 | `fec3fc5` | Stack wiring for OIDC clients (`identity_oidc_clients`) |
| munaxa-docs | #192 | `56949e1` | Docs signs in through Identity (federation, company sign-in page) |
| munaxa-school | #32 | `e5e4a79` | School signs in through Identity, safe account linking |
| munaxa-platform | #203 | see index | Stack wiring for School sign-in (`school_identity_sign_in`) |

Security reviews (independent reviewer, `2026-11-26-identity-sso-review/` from platform#200, and on each PR): no Critical or
High finding remained at merge. Medium findings were fixed before merge:

- identity#32 M-1: Entra guest accounts could bypass the tenant check. Fixed.
- school#32 M-1: a School admin could be linked to an Identity account by email alone. Fixed:
  privileged School users (admin, principal, vice principal, finance, accountant, HR, platform
  roles) are only linked after they also sign in once with their School password.
- docs#192 L-1..L-3, I-1: `__Host-` cookie, relative redirects, binding spent on error, deletion
  with Secure. Fixed.

## Checks at merge

- identity#32, #33, platform#201, #202, docs#192: all checks green.
- school#32: lint, typecheck, unit tests (541), build, security scans green; the e2e sign-in tests
  pass locally against PostgreSQL. The **image scan job failed** on High OpenSSL 3.5.9-r1 findings
  in the Alpine base image. This is the known OpenSSL 3.5.10 wait that already fails School image
  publishing on `main`; the PR changes no Dockerfile. Explained on the PR. `main` has no branch
  protection, and the standing merge rule (required checks green, no Critical/High in the change)
  is met.
- platform#203: Terraform format, validate and mocked plan tests (75) green.

## Owner steps before people can use it on Testing (yes/no each, Claude does the work)

None of these are done. Each needs a separate approval because it writes secrets or changes AWS.

1. **Register Munaxa with Microsoft and/or Google** (owner signs in to the Microsoft Entra admin
   center or Google Cloud console; Claude gives the exact clicks). Redirect addresses to register:
   `https://id.test.munaxa.com/api/auth/sso/callback`,
   `https://work.test.munaxa.com/api/auth/sso/callback`,
   `https://operator-test.munaxa.com/api/auth/sso/callback`.
2. **Secrets** (written in AWS by Claude without the values entering any chat):
   Identity SSO client secret(s) (`IDENTITY_SSO_*`), `IDENTITY_OIDC_CLIENT_SECRETS` in the Identity
   bundle, the matching secret in the Docs provider record, `IDENTITY_SIGN_IN_CLIENT_SECRETS` in
   the school-api bundle. A client secret must be rotated in both places together.
3. **Testing settings** (`nonprod.tfvars`): `identity_sso_config`, `identity_oidc_clients`
   (Docs and School callbacks), `school_identity_sign_in`; then plan and apply.
4. **Images**: Identity, Docs and School images built from the merge commits above and pinned in
   Testing. School images wait for OpenSSL 3.5.10 (expected about 1 Dec).
5. **Docs tenant**: the `sso.federation` licence and the `feature.federation` setting turned on
   for the tenant that should use it.

## Follow-ups and accepted residual risks

- identity#33 L-2: Identity always sends `email_verified: true`. Docs links existing users by
  email. Accepted for Testing only. Before production, Identity should verify addresses (or send
  the real flag) and Docs should require it.
- School R-1: the "link only after password" list is by role name, not permission. R-2: a user
  promoted to a privileged role after linking stays linked. Both Low, documented in
  `docs/security/identity-sign-in.md` (munaxa-school).
- Docs federation does not use PKCE yet (confidential client with secret; Low).
- School: a user who must change their password is sent to the change page after Identity sign-in.
- platform#203 I-2 (issuer must equal Identity's token issuer) and I-3 (rotate a client secret in
  both bundles at once) are informational and written in the variable descriptions.
- School images: blocked on OpenSSL 3.5.10, same as Work.
