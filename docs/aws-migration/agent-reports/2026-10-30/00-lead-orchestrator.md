# 00 · Lead orchestrator: AWS Testing execution, 30 Oct 2026

|                |                                                                                                                                                                                                                                   |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Report date    | 30 Oct 2026. Live GitHub state re-checked at 15:18 UTC and again at 18:45 UTC                                                                                                                                                     |
| Agent          | Lead orchestrator (report consolidator)                                                                                                                                                                                           |
| Scope          | All six product and platform repositories, the seven specialist reports, the task ledger and the coordination history of this execution                                                                                           |
| Sources        | `/mnt/project-files/aws-testing/` (project shared folder): `agent1-platform.md` to `agent7-independent-review.md`, `SHARED-CONTRACT.md`, and the eight Agent 7 deliverables, including the task ledger `AWS-EXECUTION-BACKLOG.md` |
| Overall status | **Code ready for AWS Testing in all six repositories, except one open Docs PR (docs#167).** Nothing is applied, published or deployed. The next steps are owner gates.                                                            |

Labels: **[V]** verified by the lead against GitHub or a local checkout at the time stated;
**[A]** assumption or carried over from a specialist report without re-checking; **[R]**
recommendation.

## 1. Scope and repositories inspected

The lead did not implement product code. Its job in this execution was to:

1. confirm that every specialist agent submitted a report with the required sections and live SHAs;
2. copy each report in full, without summarising, into this folder;
3. reconcile the reports against live GitHub and against each other;
4. write the consolidated index, status, dependency, decision and plan documents.

Repositories, each checked as `origin/main` with `git fetch` at 18:45 UTC **[V]**:

| Repository                                                          | `main`    | Last change                                                                 |
| ------------------------------------------------------------------- | --------- | --------------------------------------------------------------------------- |
| [munaxa/munaxa-platform](https://github.com/munaxa/munaxa-platform) | `c4a1ad0` | #26 Docs and file storage in the shared stack; shared contract              |
| [munaxa/munaxa-control](https://github.com/munaxa/munaxa-control)   | `739be21` | #6 portal downloads carry the Access token; migrate image runs pnpm offline |
| [munaxa/munaxa-identity](https://github.com/munaxa/munaxa-identity) | `b97b3ab` | #4 bootstrap password kept out of ECS task overrides (R-16)                 |
| [munaxa/munaxa-docs](https://github.com/munaxa/munaxa-docs)         | `406eaee` | #166 outbound User-Agent and timeout test                                   |
| [munaxa/munaxa-work](https://github.com/munaxa/munaxa-work)         | `da84612` | merge of #27, publish actions pinned by SHA                                 |
| [munaxa/munaxa-school](https://github.com/munaxa/munaxa-school)     | `54cf3eb` | #23 SSE header no longer signed into presigned uploads                      |

## 2. Report collection: confirmation

Every specialist agent submitted a report. Each was refreshed in place between 15:20 and 15:21 UTC, and Agent 4 refreshed Docs once more at
18:43 UTC (file modification times in the shared folder) **[V]**, after the coordinator asked each specialist to
add the required sections and live SHAs. Each file below is a byte-for-byte copy of its source
(checked with `cmp`) **[V]**.

| File                                                                                                     | Agent                           | Source file                    | Required sections present             |
| -------------------------------------------------------------------------------------------------------- | ------------------------------- | ------------------------------ | ------------------------------------- |
| [01-aws-platform-terraform.md](01-aws-platform-terraform.md)                                             | Agent 1, Platform and Terraform | `agent1-platform.md`           | All 14                                |
| [02-control-plane.md](02-control-plane.md)                                                               | Agent 2, Control Plane          | `agent2-control.md`            | All 14                                |
| [03-identity.md](03-identity.md)                                                                         | Agent 3, Identity               | `agent3-identity.md`           | All 14 (PRs are in §4)                |
| [04-munaxa-docs.md](04-munaxa-docs.md)                                                                   | Agent 4, Docs                   | `agent4-docs.md`               | All 14 (PRs and CI are in §5)         |
| [05-munaxa-work.md](05-munaxa-work.md)                                                                   | Agent 5, Work                   | `agent5-work.md`               | All 14                                |
| [06-munaxa-school.md](06-munaxa-school.md)                                                               | Agent 6, School                 | `agent6-school.md`             | All 14 (PRs and CI in §4, cost in §7) |
| [07-independent-security-cost-integration-review.md](07-independent-security-cost-integration-review.md) | Agent 7, independent reviewer   | `agent7-independent-review.md` | All 14, plus a conflicts table (§14)  |

**Missing reports: none.** The Agent 7 deliverables and the shared contract are copied unchanged into
[`supporting/`](supporting/) because the specialist reports cite them.

One stale statement in the copied sources, preserved as written: `supporting/AWS-EXECUTION-BACKLOG.md`
and `supporting/BLOCKERS-AND-OWNER-ACTIONS.md` say "Agent 1 filed no report". That was true at
14:10 UTC. Agent 1's report exists and is file 01 here.

## 3. Current implementation status

| Repository | Code for Testing                                                      | Open PRs (18:45 UTC) [V] | Deployed                                                                        |
| ---------- | --------------------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------- |
| Platform   | Ready; validated offline (`terraform validate`, 14 mocked plan tests) | none                     | No; bootstrap not applied                                                       |
| Control    | Ready                                                                 | none                     | No                                                                              |
| Identity   | Ready                                                                 | none                     | No                                                                              |
| Docs       | Ready in code; release image predates licensing and must be rebuilt   | **docs#167**             | No new Testing deployment. The old Docs Production stack still runs (G9 closed) |
| Work       | Ready                                                                 | none                     | No                                                                              |
| School     | Ready                                                                 | none                     | No                                                                              |

## 4. Files and components reviewed by the lead

- The seven agent reports and nine supporting files listed in §2.
- GitHub PR lists for all six repositories (state, head SHA, merge time) at 15:18 and 18:45 UTC.
- Check runs on the head of platform#26, control#6, identity#4, work#27, school#23 and docs#167
  (15:18 UTC).
- `munaxa-platform` `.github/workflows/ci.yml` (required checks), `infra/aws/stack/services.tf` and
  `docs.tf` (`OPENAPI_ENABLED`), `infra/aws/bootstrap/budget.tf` and `variables.tf`.
- `munaxa-control` `docs/adr/0008-licence-signing-key-in-aws-kms.md` (status line).
- `munaxa-docs` branch `claude/project-thread-rs73yv` (`git log`).

## 5. Work completed in this execution (all agents)

Merged PRs, each verified on GitHub at 15:18 UTC **[V]**:

| PR                                                               | Branch → head                              | Merged as | Merged at (UTC) |
| ---------------------------------------------------------------- | ------------------------------------------ | --------- | --------------- |
| [platform#26](https://github.com/munaxa/munaxa-platform/pull/26) | `claude/project-thread-qotnc6` → `cfb01ee` | `c4a1ad0` | 14:39           |
| [control#6](https://github.com/munaxa/munaxa-control/pull/6)     | `claude/project-thread-tccr1u` → `d68e1a7` | `739be21` | 14:16           |
| [identity#2](https://github.com/munaxa/munaxa-identity/pull/2)   | `claude/project-thread-3ugge1` → `7744a24` | `9aa4dc1` | 10:56           |
| [identity#3](https://github.com/munaxa/munaxa-identity/pull/3)   | `claude/project-thread-3ugge1` → `ab5471a` | `594003f` | 14:22           |
| [identity#4](https://github.com/munaxa/munaxa-identity/pull/4)   | `claude/project-thread-3ugge1` → `47c39a5` | `b97b3ab` | 14:28           |
| [work#26](https://github.com/munaxa/munaxa-work/pull/26)         | `claude/project-thread-zjaxqt` → `40da4e6` | `19c7d0b` | 10:55           |
| [work#27](https://github.com/munaxa/munaxa-work/pull/27)         | `claude/project-thread-zjaxqt` → `f33da25` | `da84612` | 13:59           |
| [school#21](https://github.com/munaxa/munaxa-school/pull/21)     | `claude/project-thread-fhe4kt` → `f67fa31` | `c6ddd5a` | 14:00           |
| [school#22](https://github.com/munaxa/munaxa-school/pull/22)     | `claude/project-thread-fhe4kt` → `0953ee9` | `55b5f0f` | 14:10           |
| [school#23](https://github.com/munaxa/munaxa-school/pull/23)     | `claude/project-thread-fhe4kt` → `e08193b` | `54cf3eb` | 14:20           |

Open: [docs#167](https://github.com/munaxa/munaxa-docs/pull/167), branch
`claude/project-thread-rs73yv`. See §6.

The lead's own output is this folder and its PR on munaxa-platform (see the PR description).

## 6. Work still in progress

- **docs#167 is stuck on GitHub [V].** At 18:45 UTC the PR API still reports head `6f0ea79` and
  state open, while the branch is at `a53852d` (`git log` of the fetched branch: `a53852d` "Publish
  images: pin every action by commit SHA" on top of `6f0ea79`). Agent 4 reports three merge attempts
  on `6f0ea79` returned HTTP 500 and one with `expectedHeadSha a53852d` returned 409. The lead did
  not attempt a merge: the PR belongs to Agent 4, and its head on GitHub is not the commit with the
  R-07b pins. **Merging at `6f0ea79` would leave R-07b open.**
- School first-owner seeding (P7): the coordinator asked Agent 1 for a `school-bootstrap` run-only
  task. Agent 1 opened [platform#27](https://github.com/munaxa/munaxa-platform/pull/27) (head `7de8106`, open at 18:50 UTC).
- Agent 7's final report does not cross-review Agent 1's final report (no P9, P10, P11 in its
  register). Recorded in DECISIONS-AND-CONFLICTS §4.
- T13 (`OPENAPI_ENABLED=false` on work-api) is still absent on platform `main` **[V]**: the only
  `OPENAPI_ENABLED` in `infra/aws/stack/*.tf` is Docs (`docs.tf:68`). The coordinator sent it to
  Agent 1 as a follow-up; it is in [platform#27](https://github.com/munaxa/munaxa-platform/pull/27), open at 18:50 UTC, so it is recorded as in progress.

## 7. CI and test results (evidence checked by the lead at 15:18 UTC) [V]

| PR          | Head                      | Check runs                                                                                                                                                                                                                                                           |
| ----------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| platform#26 | `cfb01ee`                 | "Format, validate, mocked plan tests" success (run 41071456435); "Lint · Typecheck · Test · Build" success, "Accessibility · contrast and keyboard…" success, "Façades match the platform surface" success (run 41071456253); Plan and Apply skipped (dispatch only) |
| control#6   | `d68e1a7`                 | "Format · Lint · Typecheck · Test · Build" success, "Build the images" success (run 41068255914)                                                                                                                                                                     |
| identity#4  | `47c39a5`                 | `verify` success (run 41071629943)                                                                                                                                                                                                                                   |
| work#27     | `f33da25`                 | Product isolation, Mobile, Lint · Typecheck · Test · Build, Standards · Architecture · Localization: all success (run 41065851607)                                                                                                                                   |
| school#23   | `e08193b`                 | Lint · Typecheck · Test · Build (JS/TS) success, Security scans success, Detect changed areas success; Flutter and Supabase Preview skipped (run 41069902465)                                                                                                        |
| docs#167    | `6f0ea79` (GitHub's view) | 22 check runs, all success (runs 41044058200 push and 41044081583 pull_request, 10:53 UTC). **No pull_request run exists for `a53852d`.** Agent 4 reports a green push run 41071431614 on `a53852d` [A: not re-opened by the lead]                                   |

Per-repository CI evidence for the other PRs, and local test runs, are in each specialist report. The
lead ran no product test suite. Not one real `terraform plan` has run against AWS (it needs G2).

## 8. Infrastructure dependencies

See [CROSS-REPOSITORY-DEPENDENCIES.md](CROSS-REPOSITORY-DEPENDENCIES.md). In short: every product
depends on platform bootstrap (G2) and the persistent stack (G3). Identity must run before Control
and Work. Control must run and issue `mxc_` credentials before Work, School and Docs can boot with
licensing.

## 9. Required environment variables

Names only. Consolidated by Agent 7 in [supporting/ENVIRONMENT-VARIABLES.md](supporting/ENVIRONMENT-VARIABLES.md),
and per service in each specialist report §8 or §9. No values appear anywhere in this folder. The lead
searched the folder for common credential patterns (AWS access key ids, GitHub tokens, private key
headers, `mxc_` tokens) and found none **[V]**.

## 10. Security findings (reconciled)

The authoritative register is Agent 7 §10. Status at 18:45 UTC:

| Open item                                                                                                  | Severity                                          | Owner                                                                  |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------- |
| R-02 / B2 / X1: the US$50 target versus the old Docs stack                                                 | Blocker (decision)                                | Tamer                                                                  |
| R-07b / F-1: Docs publish actions tag-pinned (fix is on docs#167 `a53852d`, not merged)                    | Medium                                            | Agent 4, blocked by GitHub                                             |
| F-2: Docs release image predates production licensing                                                      | Medium                                            | Tamer at G5, after docs#167                                            |
| R-06 / I2 / C5 / W5: one Identity token valid for Work and Control                                         | Medium, accepted for Testing                      | Tamer decision before Production; Agent 3 code                         |
| I3 / C6: no MFA claim from Identity                                                                        | Medium, accepted for Testing                      | Tamer decision before Production; Access policy must require MFA at G6 |
| P9: deployer's `ec2:*`/`elasticloadbalancing:*` can reach the Docs Production VPC, security groups and ALB | Medium                                            | Tamer decision, Agent 1 code                                           |
| R-05 / S4: School Firebase off on AWS                                                                      | Medium, optional                                  | Tamer                                                                  |
| R-15 / S9: School mobile upload without Content-Length                                                     | Medium (Agent 7) / Low (Agent 6), outside Testing | Agent 6                                                                |
| P10, P11: KMS `GetKeyRotationStatus`, OIDC subject form                                                    | Verify at first plan or workflow run              | Agent 1                                                                |
| C8: munaxa-control `main` not protected                                                                    | Low                                               | Tamer                                                                  |
| W3: Work GHCR publish shares the `image/**` tag, no protected environment                                  | Low                                               | Work, when Render retires                                              |
| W4 / T13: work-api serves OpenAPI (not routed by the ALB)                                                  | Low                                               | Agent 1                                                                |
| F-3: vendored Docs cluster roles SQL can drift                                                             | Low                                               | Agent 1                                                                |
| R-13: no Terraform check on an empty operator allow-list                                                   | Info                                              | Agent 1                                                                |

No critical finding is open. Every High finding raised in this execution is fixed in code.

## 11. Cost implications

Two estimates exist and differ slightly, both **[A]** (list prices from memory; the AWS connector's
sign-in had expired, so no Pricing API or billing read succeeded):

- Agent 1: Testing idle about US$13 a month, about US$0.30 per session hour, about 120 session hours
  inside US$50; the account idles at about US$61 with the old Docs stack.
- Agent 7: Testing idle about US$11, US$0.21 per hour without Docs and US$0.30 with Docs, about 130
  hours inside US$50; the account is about US$65 at 20 hours and US$71 at 40 hours.

Both agree on the conclusion: **with the old Docs stack (about US$47.8 a month idle, measured 29 Oct)
in the same account, the account is above US$50 before any Testing session.** Recorded as X1 and C1 in
[DECISIONS-AND-CONFLICTS.md](DECISIONS-AND-CONFLICTS.md).

## 12. Blockers and owners

| Blocker                                                                                             | Owner                                                                 |
| --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| B2: does US$50 cover Testing only or the whole account (including the old Docs stack)?              | Tamer                                                                 |
| docs#167 stuck at `6f0ea79` on GitHub                                                               | Tamer (press "Update branch" or check githubstatus.com), then Agent 4 |
| G2: re-apply `infra/aws/bootstrap` as root in CloudShell; set the GitHub variables and environments | Tamer                                                                 |
| G4: secret values in each bundle                                                                    | Tamer                                                                 |
| G5: image publication for all five products                                                         | Tamer                                                                 |
| G6: Cloudflare ACM validation, DNS-only CNAMEs, Access application with MFA                         | Tamer                                                                 |
| Protect munaxa-control `main`                                                                       | Tamer                                                                 |
| Identity operator organisation and Control roles (runbook steps, after first migrate)               | Tamer                                                                 |
| School: no way to seed the first platform-owner login on AWS                                        | Tamer decision; Agent 1 if a stack task is chosen                     |

G9 (retire Render, Supabase and the old Docs stack) stays **closed**.

## 13. Recommended next actions

See [NEXT-EXECUTION-PLAN.md](NEXT-EXECUTION-PLAN.md).

## 14. Not executed by the lead (explicit)

The lead did **not**: run `terraform plan` or `apply`; make any AWS call (read or write); create or
change a KMS key or key policy; create, read or change any secret; build, tag or publish an image;
deploy anything; run any database migration; change Cloudflare, Render or Supabase; retire any
infrastructure; merge or attempt to merge any product PR (including docs#167); change branch
protection; delete a branch. The only GitHub writes are the branch, commit and PR that add this
folder to munaxa-platform.
