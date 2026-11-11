# Identity non-production: consolidated readiness after the five preparation workstreams (11 Nov 2026)

**Scope.** This report covers the cross-workstream integration that the owner asked for at 10:07 UTC, 11 Nov 2026 ("Execute Five Parallel Preparation Workstreams").
The review was read-only. Nothing in this report was done in AWS: no Terraform plan or apply, no dispatch, no ECS task, no secret, no IAM, DNS, Cloudflare or production change.
No PR was merged.

**This report does not authorize anything.** Each merge, the Terraform apply of the probe task definition and the session itself each need the owner's separate authorization after ChatGPT's review.

## A. Decision

**PREPARATION COMPLETE. NOT READY TO REQUEST DEPLOYMENT APPROVAL: OWNER INPUTS AND MERGES REMAIN.**

The five workstreams cleared the engineering blockers BL-1, BL-2 and BL-4 from the pre-authorization review (PR #89), and the owner's Option A decision cleared most of BL-3.

What still stands between now and a deployment authorization request:

- the Testing operator email (owner input);
- the merges;
- one Terraform apply that registers the probe task definition (owner authorization);
- an owner decision on cleanup resilience.

All of these are in section H.

## B. The five PRs

All five PRs target `main` at `49c51f36fb53d1e450c9cf8af58a969897d00623`. All are open and unmerged.

| WS | PR | Branch head (full SHA) | Files changed |
| --- | --- | --- | --- |
| 1 probe | [#93](https://github.com/munaxa/munaxa-platform/pull/93) | `1277d9bc57ee4b22eb073e45f4c00a152eb00ee8` (3 commits: `bc1d202`, `7d65fb1`, `1277d9b`) | `infra/aws/stack/supporting/identity-session-probe.mjs`, `…/identity-session-probe.test.mjs`, `.github/workflows/aws-terraform.yml`, report `2026-11-11-identity-session-probe/` |
| 2 task definition | [#92](https://github.com/munaxa/munaxa-platform/pull/92) | `4c632ab9c8bbbd56389c76433d322419e0610b5f` | `infra/aws/stack/identity-probe.tf`, `variables.tf` (+`identity_probe_source`), `outputs.tf` (+2 outputs), `scripts/identity-probe-loader.mjs` and its test, `tests/stack.tftest.hcl`, `.github/workflows/aws-terraform.yml`, report `2026-11-11-identity-probe-task-definition/` |
| 3 cleanup design | [#90](https://github.com/munaxa/munaxa-platform/pull/90) | `79ec7be30e0081b1a5bc11035414aa792eedb04a` | report `2026-11-11-identity-independent-cleanup-design/` only |
| 4 runbook and index | [#94](https://github.com/munaxa/munaxa-platform/pull/94) | `3d84609f0782fe696f83a0195d98ab6658ac5e1d` | runbook `2026-11-11-identity-final-operator-runbook/`, the #87, #88 and #89 report folders (cherry-picked byte-identical), a banner on the operator checklist, and the **only** README index change |
| 5 Option A review | [#91](https://github.com/munaxa/munaxa-platform/pull/91) | `d74f3172c2958189a60bf20726e10fc640551905` | report `2026-11-11-identity-option-a-custody-cost-review/` with an offline harness and DRAFT connector scripts |

**Note.** The coordinator gave #93 as `bc1d202` and `7d65fb1`. The real head is `1277d9b`, a third commit that turns off setup-node's pnpm cache for the probe step. The pin procedure uses #93's squash commit on `main`, so this does not affect it.

## C. Integration checks (the owner's list, items 1 to 9)

| # | Check | Result | Evidence |
| --- | --- | --- | --- |
| 1 | Overlap and conflicts | **No textual conflict.** All five merged cleanly onto `49c51f3` in the proposed order #91, #90, #93, #92, #94 (local `git merge` simulation). **One functional overlap, finding X-1:** #92 and #93 each add a setup-node step and a probe test step to `aws-terraform.yml`. Because the steps sit at different lines, git merges both without a conflict, so CI would run the probe tests twice. #94 section 4 says the second PR "is updated to drop #93's single-file test step". Nothing forces that edit, so it has to be done deliberately | `aws-terraform.yml` after the simulated merge: steps at lines 89/93 (#92, glob `infra/aws/stack/**/*.test.mjs`, setup-node pinned to `249970…` v6.5.0) and 127/133 (#93, `actions/setup-node@v5`, `package-manager-cache: false`) |
| 2 | Probe code and task definition agree on every environment variable | **Yes.** Of the 12 environment names the task definition sets, 11 are read by the probe or loader (`NODE_ENV` is not read), both secret names are read, and every non-secret value equals the probe's reviewed constant. The probe refuses a mismatch with a fixed code (`PINNED_ENV`). `PROBE_ALB_DNS` is the only run-time override, as the runbook (4.2) says | Table C.1 |
| 3 | No database-owner credentials reach the probe | **Yes.** `identity-probe.tf` names exactly two secrets, `IDENTITY_OWNER_EMAIL` and `IDENTITY_OWNER_PASSWORD`, from `munaxa-nonprod/identity-bootstrap`. It does not set `DIRECT_DATABASE_URL`, the migrate or service bundle, or the RDS master secret. There is no `task_role_arn`, so the container has no AWS credentials. As defence in depth, the probe also deletes `DIRECT_DATABASE_URL`, `DATABASE_URL` and `DATABASE_MIGRATION_URL` from its environment without reading them. The execution role is the bootstrap role, unchanged. It *could* read the identity-migrate secret, but ECS resolves only the secrets a container definition names | `identity-probe.tf` secrets block; `ops.tf` lines 217-244 (execution role policy) |
| 4 | Loader commit SHA and checksum instructions are exact | **Yes**, findings X-3 and X-4 below. The commit and SHA-256 come from Terraform `identity_probe_source`, which a validation check holds to a 40-character and a 64-character lowercase hex value. The loader re-checks the format, downloads only from `raw.githubusercontent.com/munaxa/munaxa-platform/<C>/…` with `redirect: 'error'`, caps the size at 256 KiB, compares the SHA-256, and imports the module from a `data:` URL. Runbook 3.2 computes `H` twice, from `git show` and from the raw URL, and requires the blob at `C` to equal the PR head's blob | The repository is public: the raw URL returned HTTP 200 for a file at `49c51f3`. Probe at #93 head: 32,603 bytes (cap 262,144), blob `4cdb018`, SHA-256 `f7a15787…6b79`. **This is not the pin.** `C` is #93's squash commit, which exists only after the merge |
| 5 | Execution sequence includes the probe task definition | **Yes.** Runbook I-3 is the enable PR, with `identity_probe_source` and expected changes of exactly 1 create, `aws_ecs_task_definition.identity_probe[0]`. I-4 is its owner-authorized plan and apply in phase 0, with the session down. Step 0-6 then reads the registered definition back. The session workflow refuses task definition changes, so the probe definition must exist before `up`. `skip_destroy = true` and a count that does not depend on `services_enabled` keep it through `down` | Runbook sections 2, 3.2, 6; `identity-probe.tf` locals |
| 6 | Resource counts and cost estimates reconciled | **Consistent across #89, #90, #91 and #94**, with one correction in section G. Mocked plan: 86 creates become 87, the only new address being the probe definition. The live enable plan is expected to show 1 create. That is a prediction until the authorized plan shows it | #92 report section D, `supporting/mocked-plan-addresses.txt`; section G |
| 7 | No apply, dispatch, IAM, DNS or production change in any PR | **Confirmed.** Across all five PRs, outside `docs/`, only the 9 files in section B change. No new `resource "aws_iam_*"`, security group, Route 53, KMS, Secrets Manager, Lambda, Scheduler or EventBridge resource. No `workflow_dispatch` change and no Cloudflare change. The only new resource is the disabled-by-default `aws_ecs_task_definition.identity_probe`, with count 0 until it is pinned | `git diff origin/main..<simulated merge>` scan |
| 8 | CI | **Terraform jobs green on all five heads.** That includes "Format, validate, mocked plan tests" (#92: `terraform test` 28/28), "Lint · Typecheck · Test · Build" and "Façades". The Plan and Apply jobs were skipped, as intended: they run only on dispatch. **The Accessibility (Storybook) job was still running on every head at 10:25 UTC.** None of the five diffs touch UI code. Locally, on the simulated merge of all five, with Node 22.23.4: `node --test 'infra/aws/stack/**/*.test.mjs'` gave **72/72 pass** (54 probe and 18 loader). Terraform is not installed in this session, so the combined tree was not run through `terraform test`. Only #92 touches Terraform, and its own CI run passed | GitHub check runs, 10:12–10:20 UTC |
| 9 | One consolidated report | This file | — |

### C.1 Environment variable agreement

| Name | Set by (`identity-probe.tf`) | Read by | Value check |
| --- | --- | --- | --- |
| `IDENTITY_OWNER_EMAIL`, `IDENTITY_OWNER_PASSWORD` | `secrets`, bootstrap secret fields | probe `readConfig`; copied, then deleted from `env` | both required; added to the output redaction set |
| `PROBE_ALB_DNS` | RunTask override (runbook 4.2) | probe | must match `^(internal-)?…\.eu-central-1\.elb\.amazonaws\.com$`; runbook narrows it to `munaxa-nonprod-[0-9]+…` (ALB `name = local.prefix`) |
| `PROBE_COMMIT`, `PROBE_SHA256` | `identity_probe_source` | loader (constants written in by Terraform) and probe (format) | 40 and 64 hex characters |
| `PROBE_HOST` | `var.hosts.identity` = `id.test.munaxa.com` | probe | equals `EXPECTED.identityHost` |
| `PROBE_ISSUER` | `local.https.identity` = `https://id.test.munaxa.com` | probe | equals `EXPECTED.iss` |
| `PROBE_AUDIENCES` | literal `munaxa-work,munaxa-control` | probe | equals `EXPECTED.aud` |
| `PROBE_ORGANISATION` | `identity_operator_organisation.slug` = `munaxa-group` | probe | equals `EXPECTED.organisation` |
| `PROBE_SIGNING_KID` | `identity_signing_kid` = `identity-nonprod-2026-11` | probe | equals `EXPECTED.kid` |
| `PROBE_PUBLIC_KEYS` | `identity_public_keys` (nonprod.tfvars line 78) | probe | DER-compared with `COMMITTED_PUBLIC_KEYS`. The PEM in the probe is byte-identical to the tfvars key |
| `PROBE_OPERATOR_HOST` | `var.hosts.operator` = `operator-test.munaxa.com` | probe | equals constant |
| `PROBE_CONTROL_API_HOST` | `var.hosts.control_api` = `control-api.test.munaxa.com` | probe | equals constant |
| `PROBE_UNKNOWN_HOST` | computed `unknown.test.munaxa.com` | probe | equals constant |
| `NODE_ENV` | `production` | not read | — |
| `NODE_TLS_REJECT_UNAUTHORIZED`, `NODE_OPTIONS` | not set | loader refuses if either is present; probe refuses `NODE_TLS_REJECT_UNAUTHORIZED=0` | — |

**The image.** Identity `apps/api/Dockerfile` at `5277d71` has a `node:22-alpine` runtime, no `ENTRYPOINT` of its own, `USER identity` and `WORKDIR /app/apps/api`. So the task definition's `command = ["node", "--input-type=module", "-e", <loader>]` runs as the non-root user. The loader's `node-version` check (22.x) matches. The image also sets `NODE_EXTRA_CA_CERTS` to the RDS eu-central-1 CA bundle (finding X-5).

## D. Probe test coverage (workstream 1)

There are 54 offline tests against a local HTTPS mock that uses a throwaway CA. There are no AWS calls. The owner's required unit areas are all covered:

- cookie extraction (6 tests);
- JWT verification, including invalid signatures, invalid key IDs, other algorithms, expired tokens, future `iat`, invalid audiences and wrong issuer (11 tests);
- safe output formatting (5 tests);
- error sanitisation (3 tests);
- configuration (8 tests);
- all 15 checks end to end, plus failure cases for each dependent check (10 tests);
- certificate verification never disabled (3 tests);
- source constraints: built-ins only, no AWS call, size cap, import runs nothing (5 tests).

The loader has 18 tests covering checksum, format, redirect, size, unsafe environment and `data:` import.

**Not covered by any test:** the real ALB, the real certificate chain, real Identity behaviour, Redis and the operator account. Only the session itself can show those.

## E. Terraform plan implications (offline only)

- **Merging #92** changes no plan, because `identity_probe_source` defaults to empty and the count is 0.
- **The enable PR (I-3)** is predicted to be 1 create, `aws_ecs_task_definition.identity_probe[0]` (family `munaxa-nonprod-identity-probe`), with no update, replacement or destroy. The mocked plan backs this (86 to 87). The live plan has not been run.
- **No IAM change.** The probe reuses `identity_bootstrap_execution[0]`, unchanged. Its policy already covers the image (`munaxa-identity/api`), the `identity-bootstrap-??????` secret and the ops log group.
- **The session `up` and `down` plans** are unchanged by the probe definition once it is applied (`skip_destroy`).

## F. Security review

- **Option A (owner decision).** #91 designs one connector call that generates the password inside AWS and creates both `munaxa-nonprod/identity-operator` (persistent) and `munaxa-nonprod/identity-bootstrap` (temporary). The call returns metadata only (OA-1). The bootstrap secret is force-deleted after the probe, by exact name and ARN, with two verification reads (C-16).
  - **L-A0 stays open:** the connector's server-side audit log cannot be inspected, so it is not claimed safe.
  - **L-A2:** CloudTrail cannot tell Claude's root calls from the owner's.
  - **OA-3:** there is no password-reset route, and bootstrap never rewrites a password, so the persistent secret is the only recovery copy. Its deletion must use a 30-day window.
- **Probe output.** Allow-listed lines only: `PASS <check>`, `FAIL <check> <code>` and a summary. A last-chance guard drops any line that contains the email or the password. No response body, header, cookie or token is ever printed. Uncaught errors print a fixed line.
- **TLS.** Node's default verification against the system store, with the name checked against `servername`. Certificate checks are never disabled, and the loader refuses `NODE_OPTIONS` and `NODE_TLS_REJECT_UNAUTHORIZED`.
- **X-5 (Info).** The image's `NODE_EXTRA_CA_CERTS` adds the Amazon RDS CA to the trust store. In theory, a certificate for `id.test.munaxa.com` signed by the RDS CA would be accepted. That CA issues only RDS endpoint certificates, so no action is needed. It is recorded for completeness.
- **Network.** The probe runs with the `munaxa-nonprod-identity` group (egress 443 anywhere, 5432 to the database group) in the public subnets with a public IP. It can reach the database port but holds no database credential.
- **Listener check (BL-2).** HTTP to HTTPS is a `DescribeListeners` configuration check (runbook section 9: HTTP listener, default action redirect to 443 with status `HTTP_301`). It is not a runtime test.
- **Limitations unchanged from #89 section F.** MFA is not implemented, there is no password reset, it is root only, and there is no production use.

## G. Cost and shutdown model (reconciled)

| Item | Figure | Source |
| --- | --- | --- |
| Running cost | about US$0.09 to 0.10 an hour (list prices, not re-priced today) | #89 G, runbook 15 |
| Expected session (about 2 h) | about US$0.20 to 0.22 | #89, #91 |
| Ceiling at the 3 h hard stop | **US$0.35, conditional.** It holds only while Claude's session and the connector stay available and `down` runs by T0 + 3 h | #90, #91, runbook 15 |
| Claude lost, scheduled `down` runs late but works | about **US$1.00** (full cost to the 21:00 UTC backstop, about US$0.55, then the ALB until the next working `down`) | #89 G, #91 G.4, #90 |
| Claude lost and **both** scheduled `down` runs dropped (**correction, finding X-6**) | **No fixed bound.** The backstop stops the database and services but cannot delete the ALB, which costs about US$0.89 a day (about US$27 a month) until someone runs `down`. #89, #94 section 15 and K-11 say "about US$1.00" without this case. #90 records that GitHub delays or drops scheduled runs (6 h 40 min late on 11 Nov, run 42987103535) | #91 OA-5 and G.4 |
| Bootstrap secret left behind (R-1) | US$0.40 a month until deleted. No scheduled path deletes it | #91 rows 3 and 10 |
| Persistent operator secret (Option A) | about US$0.40 a month, outside the session ceiling | #91, runbook 15 |
| Probe and one-off tasks | under US$0.02 | runbook 15 |

**Independent cleanup (#90)** is designed but not built. It recommends option 3: a per-session one-shot EventBridge Scheduler schedule that starts a Step Functions cleanup, armed before `up`. The cleanup deletes the ALB and the bootstrap secret, stops the database, and verifies all of it.

Building it needs new IAM roles, a state machine and a schedule, which is a separate owner authorization (runbook I-7). Without it, R-1 and the X-6 case remain.

## H. Remaining blockers and findings

| ID | Severity | What | Why it matters | Action | Owner? |
| --- | --- | --- | --- | --- | --- |
| RB-1 | High | Testing operator email not supplied | C-8 cannot create the secrets, and bootstrap cannot run | Owner supplies it. It is not invented here | **Yes** |
| RB-2 | High | Five PRs unmerged; #87, #88, #89 to close | The pin `C` exists only after #93 is on `main`; the runbook and index arrive with #94 | Owner's merge words in the order in section I | **Yes** |
| RB-3 | High | Enable PR (I-3) not opened; its plan and apply (I-4) not authorized | The probe task definition does not exist in AWS, and the session workflow cannot register it | Claude opens I-3 after #93 merges; the owner then authorizes the plan and apply of 1 create | **Yes** (I-4) |
| RB-4 | Medium | Cleanup resilience: accept or build | Without #90 option 3, losing Claude leaves the secret, and the ALB cost may have no bound (X-6) | Owner chooses: accept R-1 and X-6 in writing for the first session, or authorize building #90 option 3 first | **Yes** |
| RB-5 | Medium | L-A0 acceptance in writing | Option A relies on the connector not exposing the generated value server-side, which cannot be verified | Owner states acceptance in the session authorization | **Yes** |
| RB-6 | — | The session authorization itself (I-8) | Required by every prior instruction | After ChatGPT's review of this report | **Yes** |
| X-1 | Low | Duplicate probe CI steps (#92 and #93) merge without a conflict | Tests run twice; #93's step uses an unpinned `@v5` tag while #92 pins v6.5.0 by SHA | When the second of #92 or #93 is merged, drop #93's step (#92's glob covers both test files). This is a documented edit, as #94 section 4 already plans | No |
| X-2 | Low | Runbook 4.2 hard-codes `munaxa-nonprod-identity-probe:1` | A second apply of the definition would move the revision, and `:1` would run a stale definition | Use the revision read back at step 0-6 (`family:revision`); fold into #94 or the enable PR | No |
| X-3 | Info | The pin cannot be computed until #93 is squash-merged | — | Runbook 3.2 steps 1 to 4 | No |
| X-4 | Info | The probe is downloaded at run time from GitHub | If GitHub is unreachable, the probe fails closed (`FAIL probe-source download`), so nothing insecure runs | None | No |
| X-5 | Info | RDS CA in `NODE_EXTRA_CA_CERTS` | Section F | None | No |
| X-6 | Medium | Worst-case cost understated in #89 and #94 | Section G | Correct the wording in #94 section 15 before merge, or accept this report as the correction | No |

The pre-authorization blockers from #89 are now:

- **BL-1:** probe written (#93). Not yet run in AWS.
- **BL-2:** resolved by the listener configuration check.
- **BL-3:** custody decided (Option A); the email is still open (RB-1).
- **BL-4:** resolved (#92).
- **BL-5:** replaced by the merge order below.

## I. Recommended merge sequence (for the owner to approve later)

This agrees with #94 section 4, with X-1 made explicit:

1. #91 (Option A review, docs).
2. #90 (cleanup design, docs).
3. #93 (probe). This gives commit `C`.
4. #92 (task definition, disabled by default). Before this merge, remove #93's duplicate test step from `aws-terraform.yml` on #92's branch, as a documented edit (X-1).
5. #94 (runbook, #87, #88 and #89 content, and the single README index change). Fold in X-2 and the X-6 wording, and add this report's index row in the same single index change.
6. Close #87, #88 and #89 as superseded by #94. This report's PR can also be closed once #94 carries its row and content, or merged after #94.
7. The enable PR (I-3, `C` and `H`, 1 create).
8. Separately, not merges: the owner's plan and apply authorization for I-3 (I-4); the cleanup decision (RB-4); the email (RB-1); the session authorization with L-A0 accepted (RB-5, I-8).

## J. Outstanding owner inputs (minimal)

1. The Testing operator email.
2. Merge words for the sequence in section I, after ChatGPT's review.
3. The cleanup decision: accept the residual risks R-1 and X-6 for the first session, or authorize building #90 option 3.
4. Later: authorization for the 1-create probe definition apply, then the session authorization, with written acceptance of L-A0.

## K. What was done for this report

The review itself:

- Fetched all five PR heads and `main` `49c51f3`.
- Ran a local merge simulation in the proposed order.
- Diffed every file outside `docs/`.
- Read `identity-probe.tf`, the loader, the probe's configuration, its checks and its entry point, `ops.tf` (the execution role), `services.tf` and `edge.tf` (names), `envs/nonprod.tfvars`, and the Identity Dockerfile at `5277d71`.
- Read the runbook (sections 2 to 6, 15), #94's consistency and merge-order note, #91 (sections on custody, failure scenarios and cost) and #90 (option 3, cost).
- Ran the probe and loader tests locally.
- Read the GitHub check runs of all five PRs.
- Made one unauthenticated HTTPS GET of a public raw file to confirm the repository is public.

Nothing else was touched:

- no AWS API call;
- no secret created or read;
- no PR branch edited;
- nothing merged.
