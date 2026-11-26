# 01. The School Testing pin (26 Nov 2026)

## Security audit of School before Testing

| Check | Result |
| --- | --- |
| Row-level security | 178 of 178 tables have RLS enabled and forced (local PostgreSQL 16 built from every migration) |
| Dependencies | `pnpm audit`: 0 high or critical, 15 moderate, 1 low |
| HTTP headers | API: helmet. Admin: CSP, `frame-ancestors 'none'`, X-Frame-Options DENY, HSTS |
| Abuse limits | NestJS throttler on; `trust proxy` 1 (the ALB) |
| Mail | `RESEND_API_KEY` empty on Testing, so mail is skipped, not sent |
| Review ownership | CODEOWNERS was missing; added in munaxa-school#35 |
| Sign-in | Staff Munaxa-only through Identity (munaxa-school#33/#34, reviewed rounds 2 and 3: no Critical/High/Medium); parents and students keep School passwords |
| Low | `provision-school` logs the administrator's address to the ops log group (Testing only; the address is the owner's own) |

## Testing-only OpenSSL exception for School

munaxa-school#35 (merged `c51dd62`): the same exception files as Work, byte for byte, with the
School image names (`school-api`, `school-migrate`, `school-admin`), used only when the permanent
scan gate fails; the exception refuses any image whose name contains `prod`. The Testing admin build
(`-nonprod` suffix) is scanned as `school-admin`.

## Images

| Image | Tag | Digest |
| --- | --- | --- |
| munaxa-school/api | testing-c51dd62 | sha256:a6541698a5f58777c8f91464a1bca47be22669e0d2591845d6b3175693c94d03 |
| munaxa-school/admin (-nonprod build) | testing-c51dd62 | sha256:b0ed1eff0fd914c04f1d2d5532599d0d9641305d39cab85f4fb49e0f9ef3dbe3 |
| munaxa-school/migrate | testing-c51dd62 | sha256:7aa8a73e581dccefacef01875bf4b85aafd3acb21738c3a59e7ba601d1c2e14a |
| munaxa-identity/api | testing-101ef90 | sha256:53cadf045e8522fae6a9e70f683b9c5b6cebd352466ccdcaac8bca3ac83b5073 |
| munaxa-identity/migrate | testing-101ef90 | sha256:9d11e0ceddc8d210a497a5c390a81fd93997c083906bec8ef8eba7a8ccfbe196 |

Identity moves to 101ef90 (identity#34: OIDC provider for School, truthful `email_verified`). All
five are listed in `dssl-exception.tf`.

## Secrets (written 26 Nov 21:45 UTC by the root connector, values never returned)

| Secret | Version | Contents |
| --- | --- | --- |
| munaxa-nonprod/school-migrate | 00600322-99b1-49a4-a860-c8f716c6a453 | DATABASE_MIGRATION_URL (school_owner) |
| munaxa-nonprod/school-api | 2dccc556-8aa7-4254-9113-1e6e3bb3ebf8 | DATABASE_URL (munaxa_app), two JWT secrets, CONTROL_PLANE_TOKEN (marked placeholder until the owner issues the School credential in Control), RESEND_API_KEY empty, IDENTITY_SIGN_IN_CLIENT_SECRETS |
| munaxa-nonprod/identity-oidc-clients | 3e83e65c-8d47-461f-830f-b70110e5e711 | IDENTITY_OIDC_CLIENT_SECRETS (the same School client secret), KMS alias/munaxa-nonprod-data |

Every value generated in AWS by `GetRandomPassword`. The OIDC client secret lives in its own
operator-created secret so the Identity bundle is never rewritten (platform#207). Adding a Docs
client later means a new version of that secret holding both clients.

## Repository changes

- platform#207: run-only `school-provision` task (School API image, `node dist/ops/provision-school.js`,
  reads only the pinned school-api DATABASE_URL and ADMIN_EMAIL from a one-run secret
  `munaxa-nonprod/school-provision/<slug>`); the never-registered `school-bootstrap` removed; the
  service module's `extra_secrets` for Identity's OIDC client secret. Security review: nothing above
  informational.
- The pin PR: `nonprod.tfvars` (images above, desired counts school-api and school-admin 1 for a
  session, `identity_oidc_clients` and `school_identity_sign_in` for client `school-munaxa-demo`,
  organisation `munaxa-group`, `school_provision` slug `munaxa-demo`, `db_bootstrap_products` adds
  school, three version pins); the OIDC secret read by a data source for its full ARN; E-1 task
  guard manifest (Identity at 101ef90 with the OIDC settings and the `account-email-verified`
  commands, db-admin for all four products, new families `school-migrate` and `school-provision`).

## Declared plan

`nonprod.expected-changes.json` (`check-plan-intent.sh --validate`): 41 changes = 31 creates,
9 task definitions replaced, 1 in-place update. Derived by planning the last applied commit
(`2cd99e3`, Work pin) and this branch from empty with a mock provider and comparing every resource
(no AWS call); db-admin and the Identity execution policy are added by reading the code, because
the mock hides those values. The three Docs task definitions change only through main's #204
(`PASSWORD_SIGN_IN=enabled`, which keeps Docs passwords on) and the Identity host joining the Docs
outbound allow-list. No destroy, no ECS service, ALB, network, database, KMS, secret, DNS or
production change. The apply workflow refuses a plan that differs.

Checks: `terraform fmt`, stack tests 127/127, connector tests 155/155, D-SSL exception tests 4/4.

## The Testing session (after the apply, shared with Work so they never run in parallel)

1. db-admin (creates the School roles and database), school-migrate, identity-migrate.
2. `account-email-verified` for the owner's Identity account (MFA already on).
3. One-run secret `munaxa-nonprod/school-provision/munaxa-demo` with the owner's address (private
   input, never published), `school-provision`, then the secret is deleted.
4. The owner issues the School credential in the Control portal; a new school-api version and a
   re-pin of school-api only.
5. Link the School tenant in Control, smoke-test Sign in with Munaxa at school.test.munaxa.com, down.
