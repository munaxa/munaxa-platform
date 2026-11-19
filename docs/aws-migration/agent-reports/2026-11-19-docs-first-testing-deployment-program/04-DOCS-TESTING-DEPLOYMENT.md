# 04. Docs Testing deployment: dependency chain, design, secrets, sequence, acceptance

**Status: CODE COMPLETE — NOT DEPLOYED. BLOCKED** on owner-controlled steps listed in §3.

## 1. How Docs runs in Testing

Testing uses production mode. These settings come from `infra/aws/stack/docs.tf` [V]:

| Setting | Value | Consequence |
| --- | --- | --- |
| `NODE_ENV` | `production` | placeholder secrets, `LICENSING_MODE=NONE` and `MAIL_DRIVER=NONE` are refused at start |
| `LICENSING_MODE` | `CONTROL_PLANE` | needs `CONTROL_PLANE_URL` (control-api host) and `CONTROL_PLANE_TOKEN`; fails closed (402) without a valid snapshot |
| `MAIL_DRIVER` | `RESEND` | needs `MAIL_RESEND_API_KEY` |
| `DEPLOYMENT_PROFILE` | `CLOUD` | needs `TENANT_CATALOGUE` |
| `STORAGE_CREDENTIALS_SOURCE` | `ECS_TASK_ROLE` | S3 bucket `munaxa-nonprod-docs-files-229251310592` signed with the task role (docs#178 corrects the runbook) |
| Tenant | slug `munaxa-internal`, database `edms_munaxa_internal` | one tenant in Testing |
| Sign-in | Docs' own HS256 sign-in | Docs does **not** depend on Identity directly |

## 2. Dependency chain

```
Identity Stage E ──> operator subject ──┐
Cloudflare Access (owner) ─────────────┼─> Control C-1, C-2, session ─> Docs credential (mxc_…)
Docs bootstrap apply (migrate repo) ─> Docs image release ─> D-1 pins ─┐                         │
Docs secret fill (script, bundles) ─────────────────────────────────────┼─> Docs session ─> replace-key CONTROL_PLANE_TOKEN ─> licensed Docs
Resend decision (key or placeholder) ───────────────────────────────────┘
```

Docs preparation (left column) does not wait for Identity. Only the licence does.

## 3. What is missing today

| # | Gap | Who | Evidence |
| --- | --- | --- | --- |
| G-D1 | No `munaxa-docs/migrate` ECR repository. It is in `munaxa-docs/infra/terraform/bootstrap/ecr.tf` but that bootstrap was not re-applied | owner approval of a bootstrap plan and apply | [V] ECR list |
| G-D2 | No Docs image at or after `9d06698` (ECR has only `f8a8bea`, 25 Oct) | owner approval of an image release tag `image/<sha>` | [V] |
| G-D3 | The three Docs bundles have zero versions | owner runs the script (`bundles` mode) in CloudShell | [V] metadata |
| G-D4 | No Resend key; domain `notify.munaxa.com` not verified | owner decision: create the Resend account and DNS records now, or start with the marked placeholder (mail sends fail, the app starts) | [V] |
| G-D5 | No Control credential | Control bring-up (file 03) | [V] |
| G-D6 | Docs pins (D-1): image digests and secret version ids in `nonprod.tfvars`, applied with services off | config PR + owner apply approval | mocked plan: 42 creates, 0 changes, 0 destroys [V offline] |

## 4. Secrets design (closed by this task)

The owner script `scripts/aws/owner/docs-testing-secrets.sh` (platform PR from branch `claude/project-thread-r335u7-docs-secrets`) follows the L-A0 custody pattern used for Identity stage C:

- Values are generated inside CloudShell (bash plus `python3 -I`) and go to the AWS CLI only through stdin. They never appear in argv, environment, files or output; only version ids, the tenant id and a mail/token state are printed.
- `bundles`: fills docs-operator, then docs-migrate, then docs-api. It is resumable and never splits the app password. `DATABASE_URL` and the catalogue URL carry the same `edms_app` password; `DATABASE_MIGRATION_URL` carries the `edms_owner` password. `CONTROL_PLANE_TOKEN` starts as a marked placeholder; the Resend key is typed hidden or left as a marked placeholder.
- `replace-key CONTROL_PLANE_TOKEN|MAIL_RESEND_API_KEY`: one new docs-api version, one key changed.
- `provision-create` / `provision-delete`: the one-run secret `munaxa-nonprod/docs-provision/munaxa-internal` for the first administrator, applying Docs' password policy before anything is created.
- `status`: states only, never values.

Each new version id must then go into `secret_version_ids` through a config PR and apply (the session workflow refuses task definition changes).

## 5. First-session order

1. `docs-db-admin` (creates roles and the tenant database; exit 0).
2. `docs-migrate` (must exit 0).
3. `docs-provision` (exit 0, or 4 = already provisioned), then `provision-delete`.
4. `docs-api` and `docs-web` rollout (desired 0 in the first session, flipped to 1 by a PR before the second).
5. Before the Control credential: health passes, sign-in works, licensed routes answer 402 (expected).
6. After `replace-key CONTROL_PLANE_TOKEN` and its pin apply: licensed routes work.

## 6. Mocked plan

`supporting/docs-enablement-mocked.tftest.hcl` runs the stack with mocked providers:

- D-1 (Docs images pinned, services off): **42 to add, 0 to change, 0 to destroy**.
- D-2 (a session with Docs desired 1): **62 to add** (ALB, listeners, rules, services).

The resource addresses are in `supporting/docs-enablement-mocked-plan-addresses.txt`. A real plan against the live backend was not run (it takes a state lock; not authorized).

## 7. Acceptance checklist (first working Docs in Testing)

| # | Check | How |
| --- | --- | --- |
| A1 | Docs images exist at the release sha, ECR scan has no Critical | ECR describe-images, scan findings |
| A2 | Bundles: one version each (api may have more after replace-key), pinned version ids equal AWSCURRENT | `status` + Secrets Manager metadata |
| A3 | Config apply shows only the declared changes | plan text against the declaration |
| A4 | db-admin, migrate exit 0; provision exit 0 or 4 | ECS task exit codes, logs |
| A5 | Provision secret deleted after the run | `status` shows `absent` |
| A6 | `/health` 200 through the ALB on the Docs host | curl from the session |
| A7 | First administrator signs in; MFA enrolment offered | browser, owner |
| A8 | Before the credential: licensed route returns 402; after: 200 | curl |
| A9 | Upload and download a file (S3 with the task role) | browser |
| A10 | Mail: with a real key a password-reset mail arrives; with the placeholder the send fails cleanly and is logged | logs |
| A11 | No secret value in any log group | log search for the known prefixes `pending-`, `mxc_`, `postgresql://` |
| A12 | `down` leaves 0 services, 0 tasks, no ALB; R at 21:05 succeeds | ECS, ELB, Step Functions |
