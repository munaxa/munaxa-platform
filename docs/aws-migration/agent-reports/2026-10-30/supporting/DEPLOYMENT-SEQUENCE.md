# Deployment sequence: Munaxa AWS Testing

30 Oct 2026, Agent 7. Every step from 2 onwards changes AWS, GitHub settings, secrets or
Cloudflare, and waits for Tamer's approval. Rollback for each step is in the right-hand column.

| Step | Action | Gate | Rollback |
| ---- | ------ | ---- | -------- |
| 0 | Merge code fixes: control#6, school#21, docs#167, work#27; platform PRs for T02, T07, T12, T13, and T11 once T10 is decided | standing merge rule | revert PR |
| 1 | Decide B2 (scope of the US$50) and T10 (Docs image/boundary model) | Tamer | – |
| 2 | Bootstrap as root in CloudShell (state, ECR, OIDC roles, boundary). Set repo variables and GitHub environments | **G2** | destroy (ECR must be empty) |
| 3 | `aws-terraform.yml` plan, then apply nonprod persistent layer: VPC, RDS, KMS, bundles, cluster, ACM cert | G3 | RDS final snapshot; destroy |
| 4 | Add ACM validation records in Cloudflare (DNS only) | **G6** part 1 | delete records |
| 5 | Generate the Identity signing key. Write Identity and all migrate and DB URL values into bundles. Pin versions by PR | **G4** part 1 | rotate |
| 6 | Tag `image/<sha>` and approve `image-release` for Identity, Control, Work, School, Docs. Set digests by PR | **G5** | previous digest |
| 7 | Create the Cloudflare Access app for `operator-test.munaxa.com` with an MFA policy. Put team domain and AUD in `operator_access` by PR | **G6** part 2 | delete app |
| 8 | Session up (`aws-session.yml`). Add CNAMEs to the ALB (DNS only for `*.test`, proxied for operator-test) | G7, G6 part 3 | session down |
| 9 | Run `db-admin`, then `identity-migrate`. Identity service becomes ready | G7 | session down; restore snapshot |
| 10 | Bootstrap the operator org and users in Identity, with roles granting `control:*` and `work:*`. Put org id and subjects in tfvars by PR | G7 | – |
| 11 | Read the KMS licence public key. Set `control_licence_public_key` and `control_licence_kid` by PR. Run `control-migrate`, then start control-api (its startup probe proves KMS) and the portal | G7 | previous digest |
| 12 | In the portal, issue `mxc_` credentials for Work, School and Docs. Write them into the bundles | **G4** part 2 | revoke in Control |
| 13 | `work-migrate`, then the first-tenant override, then link the tenant in Control. Start work-api and work-admin | G7 | session down |
| 14 | `school-migrate`. Start school-api and school-admin | G7 | session down |
| 15 | Docs DB-admin, then `docs-provision`. Start docs-web, docs-api, docs-scanner | G7 | session down |
| 16 | Run `TESTING-ACCEPTANCE.md`, then session down | G7 | – |

Order constraint: Identity → Control → product credentials → products. Docs can start only after
step 12. **G9 stays closed throughout:** Render, Supabase and the old Docs stack remain the rollback path.
