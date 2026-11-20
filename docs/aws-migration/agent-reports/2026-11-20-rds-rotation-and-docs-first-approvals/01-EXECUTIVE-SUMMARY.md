# 01. Executive summary

**Task:** owner request of 20 Nov 2026 18:19 UTC (21:19 Amman): verify the RDS master secret rotation when its time comes, review the security PRs, prepare Identity Stage E and the Control and Docs owner package.
**Scope:** repository inspection, offline tests, code and documentation changes, PR creation, and read-only AWS metadata through the root connector. No AWS write, no merge, no secret value read, no live Terraform plan, no Stage E.

Evidence tags: **[V]** verified live in this task (read-only AWS or GitHub), **[T]** offline test or CI run, **[D]** an earlier report, **[E]** estimate.

## Time check

| | UTC | Amman (UTC+3) |
| --- | --- | --- |
| This task started | 20 Nov 18:19 | 20 Nov 21:19 |
| RDS 7-day automatic restart | 20 Nov 21:07 | 21 Nov 00:07 |
| Scheduled post-rotation verification | 21 Nov 00:30 | 21 Nov 03:30 |

The verification time had **not** arrived. Per the instruction, nothing waited or slept: only read-only preflight was done, and the post-rotation result is **PENDING** (file 03).

## Overall status

| Area | Status |
| --- | --- |
| RDS master secret rotation | **NEEDS VERIFICATION (pending 21 Nov 00:30 UTC).** 13 hourly attempts on 20 Nov (05:08 to 17:25 UTC) all `RotationFailed` while the instance is stopped; AWSPENDING `5f35b6a0…` still staged; AWSCURRENT `b04015a3…` unchanged and valid [V] |
| Testing foundation | VERIFIED COMPLETE, idle: 0 services, 0 tasks, no ALB, NAT or EIP; last cleanup R SUCCEEDED 19 Nov 21:05 UTC; alarms OK [V] |
| Identity Stage E | **BLOCKED** until (1) rotation verified, (2) preflight P-1 to P-10 pass, (3) owner yes. Repository side ready; live task definitions match the Stage E manifest images and pins [V] |
| Control image CVEs (7 HIGH) | **NOT FIXED.** New finding: control#10 cannot clear them (file 04). Replacement **control#11** (Alpine base, image checks) opened; CI result in file 02. Fixed only after a release is scanned by ECR |
| Docs #179 | CI green [V]. New finding: a Docs release on Debian 12 is expected to show **1 HIGH** (glibc) at scan (file 04) |
| Platform #143 (secret scripts) | Reviewed: no blocking defect; 31/31 tests pass [T]; live preconditions match the scripts' constants [V] |
| `effect` advisory | Fix PRs opened for the remaining three repos: identity#21, work#33, school#26 |
| Control / Docs deployment | NOT STARTED on AWS. Sequence and owner checklist updated (files 06, 07) |
| Cost | November to date US$12.62 [V]; idle about US$0.43 a day; Testing budget 3.98 / 50 |

## Corrections to the 20 Nov morning report (PR #145)

1. The RDS instance is **`munaxa-nonprod-pg`**, not `munaxa-test-pg` (that name is only the mocked endpoint in the offline harnesses). `DescribeDBInstances munaxa-test-pg` returns DBInstanceNotFound [V].
2. After the 21:07 UTC auto-start the database will **not** run for about 24 hours. The scheduled GitHub `down` (cron 19:17 UTC) has started at 01:16 to 01:40 UTC on 18 to 20 Nov [V run list], and that `down` stops the database. Expected running time is about 4 to 4.5 hours (about US$0.07 [E]), still leaving four hourly rotation retries (21:25, 22:25, 23:25, 00:25 UTC) while the instance is available.
3. control#10 does not clear the 7 HIGH findings (file 04).
4. "`status` performs no `get-secret-value`" (PR #145 file 09) is true for the Control script only. The Docs script's `status` reads the docs-api bundle to classify it (it prints only "resend/placeholder/INVALID" and the tenant id); its header says so.

## What changed in this task

| PR | What |
| --- | --- |
| [munaxa-control#11](https://github.com/munaxa/munaxa-control/pull/11) | Control images on the Identity Alpine base with zlib 1.4-r0; new `verify-image.sh` in CI and on the pushed digest at release. Supersedes control#10 |
| [munaxa-identity#21](https://github.com/munaxa/munaxa-identity/pull/21), [munaxa-work#33](https://github.com/munaxa/munaxa-work/pull/33), [munaxa-school#26](https://github.com/munaxa/munaxa-school/pull/26) | `effect` override `^3.22.1` (GHSA-7589-6fvf-x4pw), lockfile 3.21.0 to 3.22.5 |
| this report's PR | this folder and the index row |

None deploys on merge. Nothing was merged.

## Next owner decision

**None is needed tonight.** The next decision comes after the 03:30 Amman check: if rotation is verified, **"Approve Identity Stage E on 21 Nov, starting between 13:00 and 18:30 Amman?" (yes / no)**. File 05 has the checklist; file 07 the full matrix.

## Single safest next action

Let the rotation finish on its own and run the read-only verification at or after 00:30 UTC 21 Nov (03:30 Amman). Do nothing to the database or the secret before then.
