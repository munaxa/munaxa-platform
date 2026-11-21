# 02. Testing deployment sequence, readiness and owner actions

As of 21 Nov 2026, about 10:30 UTC (13:30 Amman). Repository and report evidence only; no AWS
call was made by this task. Tags: **[V]** verified in code on `main` or in a cited report's
direct evidence, **[I]** inference, **[U]** unverified, **[L]** live status taken from the
Stage E thread (not re-checked here, to avoid interfering with it).

## 1. Revalidated order

The 19-20 Nov order still holds; nothing found today changes it.

```
1  Identity Stage E            EXECUTED 21 Nov 09:56-10:42 UTC, probe 28/28, cleanup verified (#150)
2  Control C-1 (+ Cloudflare Access app)   independent of Stage E, but after A-5C (clean images)
3  Control C-2 (+ Docs D-1 pins)           AFTER Stage E (E-1 guard), A-4, A-4C, A-5, A-5C, A-7
4  Control + Docs session, mint the Docs credential, replace-key, licensed Docs session
```

Work and School stay **out** of the first Testing deployment: no product dependency needs them,
their images are unpublished on the new base, and both would be blocked today by D-SSL (section 6).

## 2. Identity Stage E

| Item | Status | Tag |
| --- | --- | --- |
| Stage D | APPLIED 13 Nov 21:45 UTC (run 43513076111); report now on `main` via this PR (folder `2026-11-13-identity-stage-d-execution`) | [V] |
| RDS rotation precondition | SUCCEEDED 20 Nov 21:26:28 UTC (`2026-11-21-rds-secret-rotation-verification`) | [V] |
| Owner authorization | given 21 Nov 08:11 UTC on the card "Yes, if rotation verifies"; covers Stage E only | [L] |
| Result | EXECUTED: `up` 09:56 UTC (run 44891901758), db-admin and migrate exit 0, C-8G operator secret created by CloudFormation and its read window closed, organisation munaxa-group and operator created, Control roles seeded, probe 28/28, `down` 10:38 to 10:42:48 (run 44895287466), cleanup verified 10:45 UTC, H-20 schedules disarmed. Findings F-1 (Low, C-8G status tag check) to F-5 (Info) | [V] PR #150 |
| Image pin | `envs/nonprod.tfvars` still pins Identity api `sha256:9a8c6ebd…` and migrate `sha256:5f3bdcce…` (source 2db6ed9). D-I1 (republish from `7615589` before Stage E) was **not** done; the owner approved Stage E on the existing pin | [V] code, [L] decision |
| Known image risk | 9a8c6ebd/5f3bdcce were built before the OpenSSL 3.5.9-r1 pin, so they very likely carry the 20 Nov OpenSSL HIGHs, and, from today's Grype DB, the D-SSL HIGHs too. Testing-only, short session, no production data | [I] |
| What this task did | nothing to Stage E: no dispatch, no AWS read, no merge that touches `infra/aws/stack` Terraform or `aws-session.yml` | [V] |

**Next after Stage E:** fix F-1; then a fresh Identity
image from `main` once D-SSL clears, a pin PR (`nonprod.tfvars`, `nonprod.stage-e-tasks.json`,
`e1-task-guard.py` fixtures) and withdrawal of `9a8c6ebd`/`5f3bdcce` in
`infra/aws/stack/withdrawn-images.tf`.

## 3. Control C-1 and C-2

| Item | Status | Tag |
| --- | --- | --- |
| Offline plans | C-1 33 creates (KMS key, alias, policy, 3 modules); C-2 3 task-definition changes (db-admin, control-api, control-migrate); Control session 19 creates | [V] (PR #145 file 06, mocked harness in its `supporting/`) |
| Licence-key fail-closed guard | a Control session without the licensing key is refused (mocked test in #145 `control-c1-c2-mocked.tftest.hcl`) | [V] test |
| Ordering guard | C-2 adds `control` to `db_bootstrap_products`, which changes the db-admin task definition that the E-1 guard compares with `envs/nonprod.stage-e-tasks.json`. So C-2 runs **after** Stage E, or its PR updates that manifest | [V] code |
| Secret custody | `scripts/aws/owner/control-testing-secrets.sh` (PR #143, now merged): generates both hex passwords in CloudShell, values only on stdin pipes, prints only version ids; 8 offline tests | [V] |
| Images | `munaxa-control` `main` `7b607e0` (#11): pinned `node:22-alpine@1314fb30`, exact zlib 1.4-r0 and OpenSSL 3.5.9-r1, non-root `node`, scan before push. Old a24c568 digests are withdrawn. **No clean Control image is published (A-5C)**, and a new one is blocked by D-SSL | [V] code |
| Draft control#9 | per-run package token; needs a GitHub Packages Read grant (owner); unchanged since 12 Nov | [V] |

**Owner sequence:** A-5C release (after D-SSL) → A-7 Cloudflare Access app + C-1 apply → A-4C
`control-testing-secrets.sh bundles` in CloudShell → (after Stage E) A-8 C-2 + D-1 pins plan,
declaration, apply → A-9 session and credential mint. None executed.

## 4. Docs

| Item | Status | Tag |
| --- | --- | --- |
| Images | `munaxa-docs` `main` `f1fca8f` (#180): api, web, migrate **and worker** on a pinned Alpine build with a `scratch` runtime (`FROM runtime AS worker`), exact zlib/OpenSSL, `USER node`, scan in CI and before every push. The Docs worker is **fixed in code**; the "worker NOT FIXED" line in PR #147's first version is superseded by its 23:45 UTC update | [V] |
| Published | ECR has only the old `f8a8bea` images; no image after `9d06698`; no `munaxa-docs/migrate` repository until the Docs bootstrap (A-3). Nothing should be published until D-SSL clears | [V] reports, [I] ECR not re-read |
| S3 | the adapter signs with the ECS task role when `STORAGE_CREDENTIALS_SOURCE=ECS_TASK_ROLE` (`ecs-task-credentials.ts`); `infra/aws/stack/docs.tf` sets it; `CONTRACT.md` grants Get/Put/Delete/AbortMultipartUpload and ListBucket on the one bucket. docs#178 corrects the runbook to say so | [V] code |
| Secrets | `scripts/aws/owner/docs-testing-secrets.sh` (PR #143, merged): modes bundles, replace-key, provision-create/delete, status; lock with `O_NOFOLLOW`; Purpose-tag-checked delete; 23 offline tests | [V] |
| Gating | Docs bootstrap and deployment each need their own owner yes (A-3 to A-6, A-8, A-9); production mode requires Control licensing (`LICENSING_MODE=CONTROL_PLANE`, fails closed 402) | [V] reports |

## 5. Work and School

- **Work** `main` `a93c642` (#33): CI green 20 Nov 23:26 UTC; pinned base, scans before push.
  Published `b490b25` images are withdrawn (CRITICAL CVE-2026-4738). Deploy also needs the
  Identity #15 image and Work tenant re-binding (WK-01). Draft work#32 needs the Packages grant.
- **School** `main` `0011680` (#26): PR CI green 20 Nov; **no push CI on main and no ruleset**
  (owner item O-8). Not started on AWS.

## 6. New finding today: D-SSL (OpenSSL HIGH advisories with no fix)

Docs CI on PR #178 (run 44892115358, job "Migration image · disposable databases", 10:02 UTC)
failed its Grype gate on **libssl3/libcrypto3 3.5.9-r1**: CVE-2026-124709, CVE-2026-107494,
CVE-2026-121482, CVE-2026-84786, CVE-2026-107493, each HIGH, **no fixed version listed** [V log].
The Grype database was built 06:20 UTC 21 Nov (coordinator note) [U here].

- **Scope [I, high confidence]:** Identity, Control, Work, School and every Docs image pin the same
  `libssl3=3.5.9-r1` / `libcrypto3=3.5.9-r1`, so their next image scan fails the same way. The
  main branches' last scans (20 Nov) predate the advisories.
- **Effect:** fail-closed as designed. No image can be published by the pipelines, and every PR
  in those repositories whose required checks include an image scan is blocked, including
  docs-only PRs such as docs#178.
- **Not possible in repository scope:** there is no fixed package to pin. Removing OpenSSL from the
  runtime is not safe (Prisma engines link it). Network access to the Alpine security database
  was not available from this session, so whether Alpine has a fix newer than the Grype DB is
  **unverified**.
- **Owner decision D-SSL:** (a) **recommended:** wait for the Alpine fix, then one pin-bump PR per
  repository (Claude can prepare these as soon as a fixed version exists); nothing needs a new
  image today. (b) a time-bound Grype exception (owner + expiry, the mechanism `scan-image.sh`
  supports) only if an image must ship before the fix. No exception was added.

## 7. Cost and idle-state controls (from reports and code; not re-read live)

- Cleanup R `cron(5 21 * * ? *)` with alarms "failed" and "not run"; 11 backstops at 21:00 UTC
  (10 ECS scale-to-zero, 1 RDS stop); scheduled GitHub `down` twice a day; H-20 gate refuses `up`
  without armed P/S and a real R success in the last 26 h [V code/reports].
- Last idle verification: 21 Nov 04:23 UTC: ECS 0, no ALB/NAT/EIP/EC2/ElastiCache, DB stopped,
  12 schedules enabled [V #148]. During Stage E today, ALB/ECS/DB ran by design 09:56 to 10:42 UTC;
  cleanup verified idle again at 10:45 UTC [V #150].
- Budgets: Testing 3.98/50; the legacy US$10 account budget is over (alerts only, owner decision).
- Gap: RDS auto-starts after 21:05 UTC run until the late GitHub `down` (file 01). The next one
  (about 28 Nov 10:45 UTC [I]) falls before the 21:00 backstop.

## 8. Owner-only actions (none is needed for safety today)

| # | Action | When |
| --- | --- | --- |
| D-SSL | wait for the Alpine OpenSSL fix (recommended) or approve a time-bound exception | now, yes/no |
| O-G1 | GitHub: allow Claude's integration to merge PRs that change `.github/workflows/*` if the `workflows` permission is missing (only if a merge of such a PR is refused; see file 00 section 5) | if it occurs |
| D-I1 | republish Identity from `main` after D-SSL; then pin PR | after Stage E |
| A-3 | Docs bootstrap apply | after Stage E |
| A-4 / A-4C | Docs and Control bundle scripts in CloudShell | after A-3 |
| A-5 / A-5C | Docs and Control releases | after D-SSL |
| A-6 | Resend key decision | any time |
| A-7 | Cloudflare Access app + C-1 apply | after A-5C |
| A-8 | C-2 + D-1 plan and apply | after Stage E, A-4, A-4C, A-5, A-7 |
| A-9 / A-10 | session, credential mint, replace-key | last |
| R-RDS | approve building the event-driven delayed stop (file 01 option C), or keep monitoring | any time |
| O-8 | School ruleset and push CI | any time |
| Packages | Read grant for identity#19, control#9, work#32 (drafts) | any time |
| Budget | raise or retire the legacy US$10 budget | any time |
