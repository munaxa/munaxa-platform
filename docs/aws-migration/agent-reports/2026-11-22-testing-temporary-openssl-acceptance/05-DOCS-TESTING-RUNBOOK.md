# 05. Docs Testing deployment runbook (updated for D-SSL and the completed bootstrap)

**Nothing in this file has been executed.** Each step marked **[yes]** needs the owner's explicit
approval at that step; a merged PR never authorizes a publish, apply, session, DNS, secret or
GitHub-setting change. Supersedes report 2026-11-21-testing-owner-preparation file 06 §4 (Stages
1-7), which stays valid except where this file differs (D-SSL exception; bootstrap and bundles done).

Who: **[C]** Claude (repository; read-only AWS through the connector) · **[C+yes]** Claude after the
owner's yes · **[O]** owner only. Account `229251310592`, `eu-central-1`. Operator organisation
`munaxa-group` `071d3060-70ac-4017-9ff9-094ff715051e`, operator subject
`ae62eef5-cf65-43c8-83e2-7786d2d5ae87` (identifiers, not secrets); operator e-mail is always the
placeholder `IDENTITY_OPERATOR_EMAIL`.

Hard rules for every session: `hard_stop_utc` the same day before 21:00 UTC (the H-20 gate refuses
`up` otherwise); the 21:00 UTC backstop and 21:05 UTC cleanup stay armed; `OPERATOR_CIDRS` never
`0.0.0.0/0` (Terraform refuses it); Cloudflare Access is optional and not used; after
2026-12-01T00:00:00Z no `up` with a D-SSL image (E-1) and no publication of an affected image.

| # | Step | Who | Expected / evidence |
| --- | --- | --- | --- |
| 1 | IAM checks O-IAM-5 and connector switch O-IAM-6 (file 06, A1-A3) | [O] then [C] | Connector `get-caller-identity` = `AWSReservedSSO_MunaxaReadOnly_*`; ReadOnly denied on secret value and log contents |
| 2 | Secret bundle metadata | [C] | 5 bundles, one AWSCURRENT version each, ids as file 02 §3 (or newer ones the owner reports) |
| 3 | Docs ECR repository | [C] | `munaxa-docs/migrate` IMMUTABLE, scan on push, AES256, lifecycle; no `latest` |
| 4 | Build and scan immutable images | [C] | The merged `main` CI image jobs of Identity, Control (with control#14), Docs: permanent gate result + D-SSL evidence per image; record run ids and `main` SHAs (file 03) |
| 5 | Temporary exception applies | automatic | Each affected image: `::warning` "D-SSL temporary exception", `<name>.dssl-exception.json` = accepted, the 10 findings only, expiry 2026-12-01T00:00:00Z. Any other HIGH/CRITICAL: the job fails and the step stops |
| 6 | **Publication approval** | **[O yes]** | One yes covers Identity, Control and Docs images at the three SHAs Claude names |
| 7 | Publish | [O] | Per repository: Releases → new pre-release, tag `image/<full 40-char sha>`, target `main` → Actions run waits for `image-release` → Approve. The workflow re-scans before every push (permanent gate, then the exception), pushes `<short>` and `sha-<full>` only (no `latest`), via GitHub OIDC |
| 8 | Verify digests and scans | [C] | Run summaries' digests; ECR `DescribeImages` (scan-on-push findings: only the 10 accepted ones); add every digest to `dssl_testing_only_image_digests` |
| 9 | Apply 1 PR and plan | [C] then **[O yes]** for the plan run | PR from the Apply 1 template with the real Identity/Control digests (+ Testing-only list), CI green, merged; owner runs Actions → AWS Terraform → `nonprod`, `plan`; Claude checks: 33 create + 4 task-definition replacements, nothing else |
| 10 | Apply 1 | **[O yes]** | Same workflow, `apply` of that saved plan (environment approval) |
| 11 | Apply 2 PR and plan | [C] then **[O yes]** | Licence public key read as ReadOnly; bundle ids (file 02 §3); Docs digests; plan = 42 create + 3 replacements |
| 12 | Apply 2 | **[O yes]** | Apply of that saved plan |
| 13 | `OPERATOR_CIDRS` | [O] | github.com → munaxa-platform → Settings → Environments → `aws-nonprod-session` → Variables → `OPERATOR_CIDRS` = your public IPv4 + `/32`, typed only there |
| 14 | Control session up; Identity check | **[C+yes]** | `up` (identity 1, control-api 1, control-portal 1); db-admin exit 0; control-migrate exit 0; Identity and Control API health 200 |
| 15 | Operator DNS | [O] | Cloudflare: CNAME `operator-test`, `id.test`, `control-api.test` → the ALB name Claude sends, **DNS only (grey cloud)** |
| 16 | Identity MFA | [O] | `https://operator-test.munaxa.com` from your address; sign in; enrol TOTP; keep recovery codes offline. Claude confirms 403 from any other address |
| 17 | Issue the Docs Control Plane credential | [O] | Control portal → Docs deployment → issue (shown once, never sent to anyone) |
| 18 | Store it | [O] | CloudShell (`MunaxaEngineering`): `docs-testing-secrets.sh replace-key CONTROL_PLANE_TOKEN` (hidden prompt); send Claude only the new docs-api `version_id` |
| 19 | Pin the credential | [C] then **[O yes]** | PR pinning that version id → plan = 2 replacements → apply |
| 20 | Docs session up | **[C+yes]** | `up` with identity, control-api, docs-api, docs-web, docs-scanner |
| 21 | Migration and provisioning | [C+yes] / [O] | docs-db-admin exit 0; docs-migrate exit 0; [O] `provision-create`; docs-provision exit 0 (4 = already provisioned); [O] `provision-delete` |
| 22 | Verify Docs | [C] / [O] | [O] CNAME `docs.test` → ALB, DNS only; `GET /api/health/live` 200; `/login` 200; sign in through Identity; a licensed route 200 (not 402); a small upload stored in the Docs bucket by the ECS task role |
| 23 | Shut down | [C] (same yes as 20) | `down` |
| 24 | Verify shutdown | [C] | ECS desired 0 / no tasks; no ALB; RDS `stopping`/`stopped`; provision secret absent; H-20 schedules disarmed; cleanup state machine idle |
| 25 | Evidence and cost | [C] | New dated report: run ids, digests, plan summaries, checks, Cost Explorer for the day [E] |

Any failure from step 14 on: go straight to steps 23-24. Rollback per report
2026-11-21-testing-owner-preparation file 06 §5 (unchanged), plus: a bad D-SSL digest goes to
`withdrawn-images.tf`.

Cost estimates [E] (not billing): Control session about US$0.10-0.20 an hour, Docs session about
US$0.15-0.30 an hour; between sessions about US$6 a month, plus about US$1 a month for the licence key.
