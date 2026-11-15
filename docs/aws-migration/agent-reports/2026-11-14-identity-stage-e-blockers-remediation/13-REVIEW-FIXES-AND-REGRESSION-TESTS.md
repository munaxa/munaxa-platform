# Review fixes and regression tests

Date: 14 Nov 2026. Independent owner review of PR #130 (file 10). Each finding below was fixed on
the PR branch `claude/project-thread-edtxfe` with a test that fails on the code before the fix.
Commits on top of the reviewed head 38dd0e7: `1cfd70f` (Pass A and B fixes), `e556b1a` (Pass C
follow-ups, reports 11 and 12), and the final report commit (B-7 rule, reports 10 and 13, index).

All commands ran offline in `/home/claude/munaxa-platform`, through a wrapper that removes AWS
credentials (`env -u AWS_ACCESS_KEY_ID -u AWS_SECRET_ACCESS_KEY -u AWS_SESSION_TOKEN`,
`AWS_CONFIG_FILE=/dev/null`, `AWS_SHARED_CREDENTIALS_FILE=/dev/null`, `AWS_EC2_METADATA_DISABLED=true`).
Terraform 1.16.5 with provider `hashicorp/aws` 6.67.0 from a local filesystem mirror,
`init -backend=false`, mocked providers.

## 1. Fixes

| Finding | Severity | Fix | Where | Regression tests |
| --- | --- | --- | --- | --- |
| A-1 | High | Every Choice comparison of an AWS response field is preceded by an `IsPresent` guard; a missing field goes to that branch's "unexpected" result instead of raising `States.Runtime` (which `States.ALL` cannot catch, so one odd response failed all four branches). `ResultSelector` on DescribeLoadBalancers (confirm) and DescribeDBInstances replaced by a raw `ResultPath` and a shape check | `session-cleanup/definition.asl.json` (SecretShape, AlbShape, AlbCheck, AlbConfirmShape, ServiceCheck, TaskShape, DbShape) | `OwnerReviewResponseShapes` (13 tests): a secret list, ALB, ECS or DB response in another shape is "unexpected" and the other branches finish |
| A-2 | High (plausible) | The secret branch accepts `ARN` or `Arn` (the aws-sdk integration casing is not verified offline) and fails closed when neither is present | `definition.asl.json` SecretCheck, SecretArnUpper/Lower | `test_secret_arn_named_arn_lower_case_is_accepted`, `test_secret_without_any_arn_field_is_unexpected_and_others_finish` |
| A-3 / B-1 | High / Medium | E-1 now checks every environment **value** (not only names), task cpu, memory and runtime platform, `requiresCompatibilities`, container and volume fields it does not know, and the identity port mapping. A revision with a changed `PGHOST`, `IDENTITY_BASE_URL` or an extra field fails validation. The manifest pins every value; ECS defaults and empty values ECS omits still pass | `e1-task-guard.py` `validate()`, `extras()`; `envs/nonprod.stage-e-tasks.json` `task`, `environment`, `extra`; `modules/service/outputs.tf` `task_definition_size` | `test_owner_review_b1_*` (2), `test_owner_review_b8_*` (3), `test_pass_c_an_empty_value_ecs_omits_still_passes`, `test_pass_c_a_correctly_named_volume_with_another_source_fails`; Terraform `stage-e-manifest.tftest.hcl` asserts the rendered values, extras and sizes equal the manifest |
| A-4 | Medium | `status` reads DescribeTasks `failures`: MISSING with no task is NOT_FOUND / TASK_EXPIRED_OR_UNKNOWN, MISSING with some tasks is UNKNOWN / SOME_TASKS_EXPIRED, any other reason is FAIL / DESCRIBE_FAILURES (never IN_PROGRESS) | `e1-task-guard.py` `status()` | `test_owner_review_a4_*` (3) |
| A-5 | Medium | Live runbooks no longer start a task by hand: final runbook §4.2 uses E-1 run inputs, S-3..S-6c and S-9 use E-1, S-9b disables the throwaway account through E-1; the superseded step 0-6 script is removed (in main 68fa6f9) | final operator runbook; first-session checklist | `test_owner_review_a5_no_live_runbook_starts_a_task_by_hand` (lint over both runbooks) |
| A-6 | Medium | ListSecrets is paged with `NextToken`, up to 5 pages; a NextToken after 5 pages, or the name on two pages or twice on one page, is "unexpected" | `definition.asl.json` SecretPagesStart .. SecretMore | `test_secret_on_a_later_page_is_found_and_deleted`, `test_endless_pages_are_bounded_and_unexpected`, `test_the_name_on_two_pages_is_unexpected`, `test_two_secrets_of_the_name_on_one_page_are_unexpected`, `test_a_next_token_on_the_last_allowed_page_is_never_ignored` |
| A-7 | Medium | Not-run alarm: `period = 3600`, `evaluation_periods = 26`, `datapoints_to_alarm = 26`, missing data breaching (no daily flapping) | `session-cleanup.tf` | `session-cleanup.tftest.hcl` asserts 3600, 26, 26 |
| A-8 | Low | The probe loader never retries after an account was created (it names the created sub); a retry after a refused password uses a fresh address | `identity-probe-loader.mjs` `bootstrap()`, `throwaway()`, `account()` | two loader tests "(owner review A-8)" |
| A-10 | Low | H-20 `arm` counts a same-named schedule as already armed only if `ActionAfterCompletion = DELETE`, timezone UTC, `RetryPolicy.MaximumRetryAttempts = 3` and `FlexibleTimeWindow.Mode = OFF` | `h20-session-cleanup-gate-and-arm.py` `arm_one` | `test_owner_review_a10_a_same_named_schedule_that_keeps_itself_is_a_conflict`, `test_pass_c_every_field_of_an_armed_schedule_is_compared` (retries, timezone, window) |
| A-11 (part) | Low | `ALB_SHAPE` accepts only `munaxa-nonprod-<digits>.eu-central-1.elb.amazonaws.com` | `e1-task-guard.py` | ALB name cases in `test_the_probe_takes_a_validated_alb_name_only` (`munaxa-prod-…`, `internal-munaxa-nonprod-…`) |
| B-7 | Low | The C-8 and C-8R call records (their script text holds the operator email) are never committed as evidence; the runbook also states C-8/C-8R stay blocked until D-LA0 | `c8-create-operator-secrets.py`, `c8r-recover-operator-secrets.py` headers; final runbook S-5 | `test_owner_review_b7_c8_call_records_are_never_evidence` |
| B-8 | Low | Unknown task or container fields fail (see A-3) | `e1-task-guard.py` | `test_owner_review_b8_unknown_task_and_container_fields_fail`, `test_owner_review_b8_ecs_defaults_still_pass` |
| C-1 | Low | Test that the pinned Identity and probe values equal `envs/nonprod.tfvars` (hosts, kids, public keys, MFA policy) | test only | `test_pass_c_c1_pinned_environment_values_equal_nonprod_tfvars` |
| C-2 | Low | The loader prints `INFO throwaway-created-sub-unknown` when an account was created but its sub is not a UUID | `identity-probe-loader.mjs` | "created without a usable sub says so (Pass C C-2)" |
| C-3 | Low/Medium | `infra/aws/README.md` step 3: the E-1 families (`db-admin`, `identity-migrate`, `identity-bootstrap`, `identity-probe`, `identity`) are never started by hand; `aws ecs run-task` only for Control, Work and School families. The `run_one` function is removed from the first-session checklist | README, checklist | `test_pass_c_c3_no_run_one_and_the_readme_keeps_e1_families_out_of_run_task` |
| C-4 | Low | `CheckInput` first tests `$.dryRun` `IsPresent: false` in its own rule, so it does not rely on `And` short-circuiting | `definition.asl.json` | `test_missing_input_is_bad_input_without_relying_on_and_short_circuit` |
| C-5 | Low | Tests moved above `if __name__ == "__main__"` so a direct run executes them | `test_session_cleanup.py` | run count 49 by both discover and direct run |
| C-6 | Low | Tests for the mutants that survived Pass B (foreign ALB ARN, other DB identifier, missing name field, NextMarker on the confirmation) | tests only | `OwnerReviewSurvivingMutants` (4), `PassCGuards` (3) |

The loader's SHA-256 pinned in the manifest is `605478009042bea7ad60d683cc3a2afdcbfc3feb74c7c1bb7daac5e38392e01e`
(after prettier); the manifest embedded in `e1-task-guard.py` is regenerated from the JSON, and
`test_db_admin_command_and_probe_loader_are_pinned_by_their_sha256` and the embedded-manifest test
check both.

## 2. Evidence that the tests detect the defects

Each new test was run against the code before its fix (file restored from 38dd0e7 or the
specific condition removed) and failed; with the fix it passes. Examples checked in the last
round: removing the `FlexibleTimeWindow` condition fails `test_pass_c_every_field_of_an_armed_schedule_is_compared`
(subtest `window`); restoring the 38dd0e7 README fails the C-3 test; the loader without the C-2
fix prints only `FAIL throwaway-account bootstrap-no-sub` and fails the C-2 test. The
`stage-e-manifest.tftest.hcl` asserts fail when a manifest value is changed. No test was weakened
or skipped; no existing assertion was removed.

## 3. Accepted Low findings (not fixed, residual risk)

| ID | Finding | Why accepted | Residual risk |
| --- | --- | --- | --- |
| A-9 | `dependsOn SUCCESS` on `throwaway-account` has no explicit `startTimeout` | The first probe run shows it; the container fails closed (no `stage-e-account.json`) | The probe may give up while an account exists; that account is named in the log (A-8) and disabled by S-9b |
| A-10 (rest) | `crosses_backstop` hard-codes 21:00 and 21:05 UTC; the gate ignores a FAILED last P/S run once the failed alarm is OK again | The schedule variable keeps its default; the failed alarm notifies (D-B5) | A changed schedule needs this function changed too |
| A-11 (rest) | `guard_running`/`status` describe at most 100 tasks; `valkey` digest check on a multi-arch pin is unverified | Stage E runs one task at a time; a digest mismatch fails closed | A false FAIL on the first `status` |
| A-12 | `DbAbsent` is ok false; a dry run waits for a busy database | Design: a missing database is unexpected | R fails daily if the database is ever deleted |
| B-3, B-4, B-5, B-6 | IAM residuals | file 12 §4 | file 12 §4 |
| C-7 | ServiceCheck does not read `Failures` (pre-existing) | `Services: []` is treated as absent; the scale-down is idempotent | A non-MISSING describe failure is reported as "absent" |
| A-sim | `DescribeLoadBalancers` page kept in state data (256 KB limit) | A handful of load balancers | file 12 §4 |

## 4. Test results (final branch head)

| Suite | Command | Result | At 38dd0e7 |
| --- | --- | --- | --- |
| Connector scripts | `python3 -m unittest discover -s scripts/aws/connector -p 'test_*.py'` | **128 tests OK** (task guard 52, session-cleanup arm 20, connector scripts 56) | 112 OK (38, 18, 56) |
| Cleanup simulator | `python3 -m unittest discover -s infra/aws/stack/session-cleanup -p 'test_*.py'` | **49 tests OK** | 30 OK |
| Node probe and loader | `node --test 'infra/aws/stack/**/*.test.mjs'` | **116 pass, 0 fail** (loader 43, probe 73) | 114 pass |
| Terraform format | `terraform fmt -check -recursive infra/aws` | OK | OK |
| Terraform validate | `terraform validate` in `infra/aws/stack` and `infra/aws/bootstrap` | `Success! The configuration is valid.` (both) | same |
| Terraform test, stack | `terraform test` | **75 passed, 0 failed** | 75 |
| Terraform test, bootstrap | `terraform test` | **14 passed, 0 failed** | 14 |
| Prettier | `prettier --check "**/*.{ts,tsx,js,jsx,json,md,yml,yaml}"` (3.9.6) | All matched files use Prettier code style | same |
| Markdown links | relative links in every changed or new `.md` | 70 checked, 0 broken | |
| Secret leak scan | 11,402 added lines since 68fa6f9: AWS key ids, private keys, secret keys | 0 matches; e-mail addresses only synthetic (`.invalid`, `example.com`, `munaxa-synthetic.net`) | |
| Operator email | the private runtime value, checked against added lines and every file in the index, never printed | 0 occurrences | |

`infra/aws/stack/scripts/docs-owner-password.test.mjs` (Docs, from PR #105) reports 0 tests before
and after; it is outside this PR.

The `terraform test` count is unchanged at 75 because the owner review extended existing runs
(`enabled_cleanup_is_scoped_and_complete`, the Stage E manifest runs) with new assertions rather
than adding runs.
