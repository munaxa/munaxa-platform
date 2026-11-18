# Tests and review (18 Nov 2026)

Every result below is an actual run output from this session. Nothing here ran against AWS.

## 1. Offline suites on `main` (`3453f13`)

| Suite | Command (summary) | Result |
| --- | --- | --- |
| Terraform format | `terraform fmt -check -recursive infra/aws` | pass |
| Terraform validate | bootstrap and stack, offline provider mirror (Terraform 1.16.5, hashicorp/aws 6.67.0, SHA-256 checked) | pass |
| Stack tests | `terraform test` in `infra/aws/stack` | 75/75 pass |
| Service module tests | `terraform test` in the ECS service module | 17/17 pass |
| Node tests | repository test suite | 116/116 pass |
| Session-cleanup simulator | definition simulator tests | 49 pass |
| Connector scripts | `scripts/aws/connector` unit tests | 121 pass |
| Plan intent | `nonprod.expected-changes.json` (12) and prod (0) validate | pass |
| Stop-database script | unit tests | 10/10 pass |
| Prettier | `pnpm format:check` | pass |
| Dependency audit | `pnpm audit --audit-level high` (pnpm 10.33.0) | exit 0, only GHSA-fc5q-39xc-vjpf ignored (file 08) |

`shellcheck` is not installed in this environment, so it was **not run**. The shell scripts were
instead exercised with stubs (section 3).

## 2. PR #137 (code fix, D-B2R)

| Check | Result |
| --- | --- |
| Bootstrap `terraform test` | 14/14 pass, including the new `be2_session_cleanup_widens_only_nonprod` assertion |
| Mutation check | Removing `states:ListStateMachineVersions`, or adding `states:ValidateStateMachineDefinition`, each makes the suite fail (13/14 pass, the new assertion fails), so both regressions are caught |
| Offline render | session-read policy 1,470 → 1,504 characters, well under the 6,144 limit |
| GitHub CI on head `cc9a7bb` | all checks success (Lint/Typecheck/Test/Build, Façades, Accessibility, "Format, validate, mocked plan tests"). The plan and apply jobs were skipped, as designed for a PR |
| Merge status | At 10:35 UTC **UNMERGED**. Squash-merged 13:24 UTC as `a976b1a` on the owner's explicit yes; same blob ids |

## 3. Supporting scripts of this report

| Script | Test | Result |
| --- | --- | --- |
| `d-b5-alert-subscription.py` (`1938dfd0…c170`) | `sandbox_harness.check_source` | no violation |
| `d-b4-dry-run-idle.py` (`5cd70078…b9ea`) | `sandbox_harness.check_source` | no violation |
| both | `python3 -I -m unittest discover -s <folder>/supporting -p 'test_*.py'` | **20/20 pass** (11 D-B5, 9 D-B4) |
| `d-b2r-plan-owner-cloudshell.sh` (`d7049449…8bf4`) | stubbed `aws`, `terraform`, `git`, `curl`, `unzip` | good path PLAN VERIFIED; extra action, extra address, wrong summary, drift, missing fix, short pin and lock 403 all STOP |
| `d-b2r-apply-owner-cloudshell.sh` (`948053a7…f83a`) | same stubs | good path verified; wrong plan SHA, live policy not updated, wrong apply summary, and an apply after a later stopped plan run all STOP |

The D-B5 and D-B4 scripts were **not run** against AWS: both need a separate owner yes, and the
connector was signed out throughout (file 02).

## 4. Independent review

A separate reviewer read the fix, the four scripts and the report without being given my
conclusions. It found nothing Critical or High. Every finding was fixed before this PR:

| Id | Severity | Finding | Fix |
| --- | --- | --- | --- |
| M-1 | Medium | D-B5 returned the full subscription ARN, which would be recorded in this public report and would allow an unauthenticated `Unsubscribe` | Only the last 4 characters are returned; tests assert the full ARN never appears |
| L-2 | Low | The apply script's checks on the plan log could match an older run | It reads only the last run and requires no `STOP:` in it |
| L-3 | Low | The apply script's fresh clone did not repeat the blob and diff checks | Repeated |
| L-4 | Low | `unzip` was not stop-guarded and the Terraform version was not asserted | Both guarded |
| L-5 | Low | "No AWS write" ignored the `.tflock` object, and any lock-read error counted as "no lock" | Text corrected (file 04); only a 404 counts as no lock |
| L-6 | Low | Plan JSON, the saved plan and live-policy copies stayed in the CloudShell home | Deleted after use |
| L-7 | Low | D-B5 precheck did not enforce 0/0/0 counts; protocol filters differed between modes | Empty topic enforced for precheck and subscribe; `verify` fails on a non-email protocol |
| L-8 | Low | D-B4 allowed a start after 21:30 although file 06 said it enforced "before R" | Window is now 00:00–20:39 UTC, enforced and tested |
| L-9 | Low | D-B4 `start` polled and could exceed the connector's ~60 s limit, losing the ARN | `start` returns `STARTED` and the ARN at once; `status` follows |
| L-10 | Low | Test gaps | Added: non-dry-run input, FAILED and RUNNING status, second ECS page, other ELB error, window edges, counts, other subscription, protocol |

## 5. Security and regression review of this PR

- No secret value, password, token or credential is read, printed or committed. The operator e-mail is not in this PR.
- No AWS write was made. No Terraform plan or apply ran against AWS.
- The scripts call no forbidden operation (`check_source` forbids every Secrets Manager value or write call), and `Publish`, `Unsubscribe`, `StopExecution` and `{"dryRun": false}` do not appear as calls.
- The audit exception's scope is unchanged; only its reach text was corrected.
- H-20 is not modified or bypassed.
