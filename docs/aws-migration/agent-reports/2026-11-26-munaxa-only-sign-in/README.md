# Munaxa-only staff sign-in, School console in Control, teacher app (26 Nov 2026)

**Result: done in the repositories, nothing deployed or applied.** Staff of Docs and School sign in only
with Munaxa Identity; School parents and students keep their own passwords. School's Munaxa operator
console is gone (Munaxa Control owns customers, plans, subscriptions and licences) and with it
`admin.munaxa.com`. The School teacher app gets "Sign in with Munaxa". Three independent security
review rounds: no Critical, High or Medium findings open.

## Owner decisions (26 Nov, UTC)

| Time | Decision |
| --- | --- |
| 20:07 | No real users yet: unify everyone except School parents and students on Munaxa Identity |
| 20:12 | Fold School's operator "platform console" into Control, like Docs; School keeps its own Administration |
| 20:17 | No need for `admin.munaxa.com` |
| 20:19 | "Go": proceed with everything; the teacher app also signs in with Munaxa |

## Pull requests

| PR | What | State |
| --- | --- | --- |
| munaxa-identity#34 | `email_verified` is true only for a checked address (company directory, used recovery link, or `operator-cli account-email-verified`); closes identity#33 L-2 | merged `101ef90` |
| munaxa-school#33 | `STAFF_PASSWORD_SIGN_IN` (`disabled` in production, `emergency`, `enabled`): staff passwords refused after the password is proved; parents/students keep them; administrators need Identity `acr: mfa` at linking and every sign-in; password-confirmed link offer removed | merged `c86c8b9` |
| munaxa-docs#193 | `PASSWORD_SIGN_IN`: per tenant, passwords refused once its Munaxa sign-in (federation) is on; `emergency` admits a TENANT_ADMIN with a confirmed Docs authenticator; federation links/creates only on `email_verified: true`; MFA roles need a second factor, also on the provisioning-race path | merged `0fdb7af` |
| munaxa-platform#204 | Terraform: Docs and School switch staff passwords off once Identity has their client; `password_sign_in_emergency` (default false) for an Identity outage; 78 stack tests | merged `afd28b0` |
| munaxa-school#34 | (1) Platform Console, platform billing/webhooks/tenant-database API, console host split and `db:seed:platform-owner` removed; `school:provision` adds a school and a password-less SchoolAdmin (dry run by default, idempotent). (2) Teacher app: system browser + app PKCE; School returns a sealed refresh-token hand-off in the URL fragment, redeemed once at `POST /auth/identity/app-session` | merged `c0bd075` |

Merges follow the standing rule (required checks green, no Critical/High). School's Images check is
red on main too (OpenSSL 3.5.9 Highs, waits for 3.5.10). Platform's Accessibility check failed on #204 and
on main `cd85933` (a Terraform-only commit) alike and passed on re-run: flaky, not from this change.

School Testing (separate thread, platform#207): `munaxa-nonprod/identity-oidc-clients` is created by the
operator inside AWS, not by Terraform. When Docs federation goes live, its client secret goes into a
new version of that same secret together with the School value, in one AWS-side step.

## Security reviews

Reports in [2026-11-26-identity-sso-review/](../2026-11-26-identity-sso-review/) files 06 and 07.

| Finding | Fix |
| --- | --- |
| Round 2 docs L-1: race winner skipped the MFA check | `dc0ba84`, integration test fails without the fix |
| Round 2 docs L-2: emergency admitted an admin without Docs MFA | `dc0ba84`: emergency needs a confirmed Docs authenticator |
| Round 2 school L-1: School emergency is password only | Documented: keep off, alert on `auth.login.emergency`, revoke its sessions after |
| Round 3 school L-1: hand-off in the query could reach server logs | `f0eb991`: fragment instead |

## Tests (local, as CI)

- Identity integration: oidc-provider 23/23, operator + sso 72/72, password-recovery.
- School API unit 64 suites / 536; e2e 54 suites incl. provision-school and three app hand-off tests;
  admin `next build`; Flutter 3.50.1 analyze (infos only) and 8 tests.
- Docs API unit 1082 + 24 auth spec; identity integration 18 federation incl. the race test; web 137.

## What is left for Testing (owner yes/no, not done)

1. Identity operator account: `account-email-verified --apply` and two-step verification, before Docs
   or School sign-in (otherwise EMAIL_NOT_VERIFIED / mfa-required).
2. Revoke staff sessions issued before the switch (reviews I-2).
3. School: Identity client + secret, tfvars `school_identity_sign_in`, then `school:provision` for each
   school; School images wait for OpenSSL 3.5.10.
4. Teacher app release: App Links / universal links on the School host and `MUNAXA_SIGN_IN_RETURN`
   set to that https link; `IDENTITY_APP_REDIRECT_URI` in the School task (not yet in Terraform).
5. Follow-ups: drop School's unused subscription tables and platform roles in a later migration;
   `school:provision` writes no audit row (review info).
