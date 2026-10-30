# Cross-repository dependencies: AWS Testing, 30 Oct 2026

The binding interface is munaxa-platform [`infra/aws/CONTRACT.md`](../../../../infra/aws/CONTRACT.md)
(owner: Agent 1). A change on either side is a PR to the platform first. The shared-folder copy as of 18:46 UTC is in
[supporting/SHARED-CONTRACT.md](supporting/SHARED-CONTRACT.md) (it already lists `school-bootstrap` from the open platform#27). Every edge below is cited from a
specialist report; the lead checked the referenced files on platform `main` `c4a1ad0` where noted
**[V]**.

## 1. Dependency graph

```text
                          munaxa-platform (bootstrap G2, stack G3)
     ECR repos · OIDC publisher roles · VPC · ALB · RDS PG16 · KMS · bundles · buckets · ECS
          │              │               │               │               │
          ▼              ▼               ▼               ▼               ▼
      Identity ───► Control ───────► Work            School           Docs
      (ES256 tokens) (mxc_ credentials, licensing) ◄──────┴───────────────┘
          │              ▲
          └──────────────┘  operator roles (control:*), org id, subjects
```

- Identity tokens are verified by **Work and Control only**. School and Docs keep their own sign-in
  for Testing (contract §7).
- Control licenses **Work, School and Docs** through `CONTROL_PLANE_URL` and a per-deployment
  `CONTROL_PLANE_TOKEN`.

## 2. Edges in detail

| From → To                                     | Contract                                                                                                                                                                                                                                                                                  | Where defined                                           | Status                                                                                                              |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Platform → every product                      | ECR `munaxa-<product>/<image>`, digest-only references, `linux/amd64`; publish from `image/<40-hex>` tag on `main` in `image-release` via OIDC                                                                                                                                            | contract §2; `bootstrap/iam.tf`                         | Code merged; not applied (G2)                                                                                       |
| Platform → Docs                               | Reuses the existing `munaxa-docs/{api,web,antivirus}` ECR repos; shared roles may **pull only**; `munaxa-docs*` secrets and S3 still denied                                                                                                                                               | `bootstrap/iam.tf`; 01 §4; 04 §4.3                      | Merged (resolves R-01 / X2)                                                                                         |
| Platform → every product                      | One database plus `<p>_owner` (migrate) and `<p>_app` (runtime, `NOBYPASSRLS`) roles, created by `db-admin`; nothing migrates on service start                                                                                                                                            | contract §6; `stack/scripts/db-bootstrap.sh`            | Merged. Work reproduced it locally (05 §6)                                                                          |
| Platform → Docs                               | Database per tenant; cluster roles `edms_owner`, `edms_app`, `edms_backup` (BYPASSRLS, CONNECT only on `edms_*`, fail-closed) via `docs-db-admin`                                                                                                                                         | `stack/docs.tf`, `stack/scripts/docs-cluster-roles.sql` | Merged; **F-3**: vendored copy of Docs `infra/sql/cluster/01-roles.sql` can drift                                   |
| Platform → School                             | Bucket `munaxa-<env>-school-files-<acct>`, SSE-S3 default, CORS from the School origin with `content-type`/`content-length` only; task role on `tenants/*`; `AWS_S3_BUCKET`, `AWS_REGION`                                                                                                 | `stack/storage.tf`, `services.tf`                       | Merged. **School#23 relies on the bucket default SSE-S3**: it must stay                                             |
| Platform → Docs                               | Bucket `munaxa-<env>-docs-files-<acct>`, task role, `STORAGE_*` env                                                                                                                                                                                                                       | `stack/storage.tf`, `docs.tf`                           | Merged                                                                                                              |
| Platform → Identity                           | `TRUST_PROXY_HOPS=1` (pairs with identity#2)                                                                                                                                                                                                                                              | `services.tf` line 124 [V via 03 §2]                    | Merged                                                                                                              |
| Platform → Identity                           | `identity-bootstrap` run-only task reading one-run secret `munaxa-<env>/identity-bootstrap`                                                                                                                                                                                               | `stack/ops.tf`                                          | Merged; partial-ARN resolution to confirm at first run                                                              |
| Platform → Control                            | KMS `ECC_NIST_P256` sign-only licence key, only control-api's task role may `kms:Sign`; `prevent_destroy`                                                                                                                                                                                 | `services.tf`                                           | Merged; P10 verify at first plan                                                                                    |
| Platform → Control                            | `control_api` host forwards only `/api/v1/products/*`, `/api/v1/licensing/*`, `/health/*`; rule 21 refuses the rest; clients must use lowercase paths                                                                                                                                     | `services.tf`, `edge.tf`                                | Merged (C4)                                                                                                         |
| Platform → Control                            | `operator` host closed (403) until `operator_access` (Cloudflare Access team domain and AUD) is set                                                                                                                                                                                       | `edge.tf`                                               | Merged; needs G6                                                                                                    |
| Platform → Work                               | `OPENAPI_ENABLED=false` on work-api                                                                                                                                                                                                                                                       | —                                                       | **Missing [V]** (T13 / W4)                                                                                          |
| Identity → Work, Control                      | Issuer `https://id.test.munaxa.com` (no trailing slash), ES256, `kid`, public keys out of band in `identity_public_keys` (no JWKS, no OIDC); claims `sub`, `tid`, `sid`, `aud`, `perms`                                                                                                   | 03 §9                                                   | Merged. `aud` holds both `munaxa-work` and `munaxa-control` (R-06)                                                  |
| Identity → every browser origin that signs in | `/api/auth/*` routed to Identity on that host; origin in `CSRF_TRUSTED_ORIGINS` (identity, Work, operator hosts)                                                                                                                                                                          | 03 §9; `edge.tf` rules 30, 40, 50                       | Merged                                                                                                              |
| Identity → Control                            | `control-operator-admin` / `-viewer` roles seeded from `artifacts/control-permissions.json` (byte-identical to Control `739be21`, per Agent 2 C7); outputs `OPERATOR_ORGANISATION_ID` and operator `sub` → platform `control_operator_organisation_id`, `control_operator_subjects` by PR | identity#3; 03 §9                                       | Code merged; **owner runs the steps**                                                                               |
| Identity → Work                               | `work:*` roles granted to Work users                                                                                                                                                                                                                                                      | 05 §11                                                  | Owner step                                                                                                          |
| Control → Work, School, Docs                  | `LICENSING_MODE=CONTROL_PLANE`, `CONTROL_PLANE_URL=https://control-api.test.munaxa.com`, `CONTROL_PLANE_TOKEN` (`mxc_`, one per deployment, issued in the portal); `@munaxa/licensing` paths `entitlementsPath`, `usagePath`                                                              | 02 §8; 04 §4.2; 05 §8; 06 §8                            | Code merged everywhere. Production refuses `NONE`/`DATABASE` modes. Docs needs Control on `OUTBOUND_HTTP_ALLOWLIST` |
| Control → Work                                | Work tenant id linked as the `work` `tenantRef` with a subscription                                                                                                                                                                                                                       | 05 §11                                                  | Owner step                                                                                                          |
| munaxa-platform packages → every product      | `@munaxa/*` from GitHub Packages; builds need `PLATFORM_PACKAGES_TOKEN \|\| GITHUB_TOKEN`                                                                                                                                                                                                 | 02 C3; 04 §5                                            | Fixed in Control (#6); Docs fix on docs#167 (not merged)                                                            |
| Cloudflare → all                              | DNS-only CNAMEs for `*.test`; `operator-test.munaxa.com` proxied behind Access with MFA; ACM validation records                                                                                                                                                                           | contract §1; 01 §8                                      | Owner (G6)                                                                                                          |

## 3. Bring-up order (from the reports; every step owner-gated)

1. G2 bootstrap → GitHub variables and environments.
2. G3 persistent layer → ACM validation (G6 part 1).
3. G4 bundle values (Identity, migrate and DB URLs).
4. G5 images (Identity, Control, Work, School, Docs after docs#167).
5. Session up → `db-admin` → `docs-db-admin` → `identity-migrate` → Identity ready →
   `identity-bootstrap` steps → restart Identity → org id and subjects by PR.
6. Export the KMS public key → `control_licence_public_key` by PR → `control-migrate` → control-api
   and portal → sign in through Access.
7. Issue `mxc_` credentials for Work, School and Docs → bundles (G4 part 2).
8. Work (`work-migrate`, first-tenant override, link in Control), School (`school-migrate`), Docs
   (`docs-provision`).
9. `supporting/TESTING-ACCEPTANCE.md`, then session down.

The ordered table with rollbacks is [supporting/DEPLOYMENT-SEQUENCE.md](supporting/DEPLOYMENT-SEQUENCE.md).
Its step 0 and step 1 are partly stale: control#6, school#21, work#27 and the platform PRs have
merged, and T10 (Docs image and boundary model) was decided in platform#26.

## 4. Known gaps across repositories

- **No OIDC in Identity** (ADR-0004): no SSO for Docs or School. Later phase.
- **School has no way to seed the first platform-owner login on AWS** (06 §11.4). Not in the ledger
  or in the platform contract.
- **Work CI does not run on push to `main`** (05 §6); other repositories do.
