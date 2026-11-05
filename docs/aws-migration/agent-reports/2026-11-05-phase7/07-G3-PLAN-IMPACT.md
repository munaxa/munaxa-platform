# Phase 7: G3 plan impact

Date: 5 Nov 2026. Lead, with Agents 3 and 4. Labels: [V-repo], [V-gh], [L] local mocked plan, [E], [U], [O].

## 1. Conclusion

**The G3 baseline is preserved: 64 creates, 0 changes, 0 replacements, 0 destroys, with the same 64 addresses as run 41977870108** [L]. No new real plan was dispatched in Phase 7, so this rests on the mocked plan plus the fact that no change touches what the real plan reads; the next real plan dispatch (before the G3 apply) must confirm it [U].

## 2. Baseline

- Workflow run `41977870108` (aws-terraform.yml, nonprod plan, head `decd1dc`, approved by the owner on 5 Nov): 64 creates, 0 change, 0 replace, 0 destroy [V-gh, report `2026-11-05-bootstrap-reapply/04`].
- Addresses: [`../2026-11-05-bootstrap-reapply/evidence/fresh-plan-run-41977870108-addresses.txt`](../2026-11-05-bootstrap-reapply/evidence/fresh-plan-run-41977870108-addresses.txt), identical to the Phase 5 expected list `2026-11-04-phase5/supporting/g3-expected-addresses.txt` [V-repo, `diff`].
- The stack code on main at `7cd448d` equals the code of run 41977870108 (`decd1dc` and `7cd448d` are docs-only commits on top of `46dfbd9`) [V-repo].

## 3. What Phase 7 changes in the stack

`git diff --stat 7cd448d 744c67c -- infra/aws/stack infra/aws/modules`: 8 files, 391 insertions, 3 deletions [V-repo]. None of it changes G3:

| Change | Why it does not change G3 | Evidence |
| --- | --- | --- |
| P2 `backstop.tf` (13 resources) | `session_backstop_schedule` defaults to `""` and `envs/nonprod.tfvars` sets `""` (lead change, D-4 = B). With the patch as written (default `cron(0 21 * * ? *)`), the mocked G3 plan was **77** | [L] mocked plans, before and after |
| P4 `admit_alb` on every routed service module | Service modules exist only for products with an image; `images = {}` in G3, so there is no `from_alb` rule in G3 | [L] Agent 4: 0 `from_alb` in the G3 mock |
| a6 variable validations | They apply only when an image is set and `services_enabled` is true | [V-repo] |
| a6 `valkey_image` pattern | Unset in G3 | [V-repo] |
| Tests | Not part of a plan | - |

`git diff e78aa92 744c67c -- infra/aws/stack infra/aws/modules` is empty, so the later review fixes (58b80f4, 744c67c) touch only workflows, scripts and the bootstrap.

## 4. Mocked plan evidence [L]

Harness: the stack's `mock_provider` from `tests/stack.tftest.hcl`, one `command = plan` run with `-var-file=envs/nonprod.tfvars`, `terraform test -verbose`, Terraform 1.16.5 and aws provider 6.67.0 (SHA256-checked). This is not an AWS plan.

| Tree | Result | Addresses vs run 41977870108 |
| --- | --- | --- |
| e78aa92 with the patch's default schedule | `77 to add` | +13 backstop addresses |
| e78aa92 (lead change), equal to 744c67c for the stack | `64 to add, 0 to change, 0 to destroy` | **identical** ([`supporting/g3-mocked-plan-e78aa92-addresses.txt`](supporting/g3-mocked-plan-e78aa92-addresses.txt), sha256 `eb9f1844…5950`) |
| Same, with `session_backstop_schedule = "cron(0 21 * * ? *)"` | `77 to add`; after a mocked G3 apply, the backstop plan alone is `13 to add, 0 to change, 0 to destroy` (Agent 3) | the 13 in [`supporting/backstop-apply-mocked-addresses.txt`](supporting/backstop-apply-mocked-addresses.txt) |

The 13 backstop addresses: `aws_iam_role.session_backstop[0]`, `aws_iam_role_policy.session_backstop[0]`, `aws_scheduler_schedule.stop_database[0]` and `aws_scheduler_schedule.scale_in["…"]` for control-api, control-portal, docs-api, docs-scanner, docs-web, identity, school-admin, school-api, work-admin, work-api.

## 5. What is still separate

- **G3 declaration PR** (`envs/nonprod.expected-changes.json` = the 64 creates): part of the G3 approval, not written in Phase 7.
- **Backstop apply** (Choice B): its own PR (`session_backstop_schedule = "cron(0 21 * * ? *)"` plus a 13-create declaration, drafted in [`supporting/backstop/`](supporting/backstop/)), its own plan and its own owner approval, right after G3.
- **G3 apply**: not authorized in this phase. No plan was dispatched, nothing was applied.
- The bootstrap changes in PR #43 do not change the stack plan. They change only what the deployers may do. The G3 apply happens after the second re-apply, under the narrower deployer, so the G3 apply is the first live test of p6-01 against the stack's create calls [E]. p6-01 adds only denies of data reads and export, and those are calls Terraform does not make [V-repo grep, Phase 6].
