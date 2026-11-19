# 01. Current ecosystem status

- **As of:** 19 Nov 2026, 21:50 to 22:30 UTC. Everything below was read from GitHub (main branches, open PRs) and, read-only, from AWS. Times are UTC.
- **Evidence tags:** **[V]** verified in code or by a live read, **[D]** taken from an earlier report, **[E]** an estimate.

## 1. Repositories (main)

| Repository | Main at | What changed recently | Deployable artefact in ECR | State |
| --- | --- | --- | --- | --- |
| munaxa-platform | `0f06836` | #138 (next gates report), #139/#140 (H-20 gate). Open: #141 (H-20 IAM report), #142 (20 Nov cleanup report) | n/a (Terraform, packages 2.5.0 on GitHub Packages) | [V] |
| munaxa-identity | `2db6ed9` | #20 zlib CVE fix (last code change) | api `9a8c6ebd…`, migrate `5f3bdcce…` at `2db6ed9`; older tags `5277d71`, `5a5994f` | [V] |
| munaxa-control | `1f58c90` | comments/docs only since `a24c568` | api, migrate, portal at `a24c568` | [V] |
| munaxa-docs | `9d06698` | #176 (DC-01 migration path), #177 (migration hardening). Open: #178 (this task) | api `f8a8bea`, web `db97825`, antivirus `c6a6d8c` (all 25 Oct, before licensing and DC-01). **No `munaxa-docs/migrate` repository** | [V] |
| munaxa-school | `4c2b4a4` | no AWS work | none (repositories empty) | [V] |
| munaxa-work | `eabcc47` | #30, #31 (WK-01/WK-02) | api, admin, migrate at `b490b25` (before #30/#31) | [V] |
| munaxa (corporate site) | `9a48a95` | not on AWS; relevant only for DNS of `munaxa.com` (Cloudflare) | n/a | [V] |

## 2. Open PRs that matter to deployment

| PR | Content | Merge effect |
| --- | --- | --- |
| platform #141 | H-20 IAM bootstrap report (applied 19 Nov 11:28) | docs only |
| platform #142 | 20 Nov 00:05 Amman scheduled cleanup verification | docs only |
| platform #143 (this task, script) | `scripts/aws/owner/docs-testing-secrets.sh`, tests, CI step, README | code only, nothing runs on merge |
| platform #144 (this task, report) | this folder | docs only |
| docs #178 (this task) | go-live runbook: S3 adapter signs with the ECS task role | docs only |

Review order requested by the owner: #141, then #142, then the PRs of this task. None of them deploys anything when merged [V: no workflow in any of the four repositories runs on `push` to main with AWS credentials, except the image publication workflows that need a tag or dispatch].

## 3. CI on main

All required checks on the main commits above were green at the time of reading [V]. Known accepted exceptions: the `picomatch` audit exception (platform #136) and the GitHub runner DNS outage noted on 11 Nov (resolved).

## 4. AWS Testing account snapshot (read-only)

| Area | Reading |
| --- | --- |
| ECS cluster `munaxa-nonprod` | 0 services, 0 tasks |
| ALB | none (created only by a session) |
| RDS `munaxa-nonprod-pg` | stopped; db.t4g.micro, PostgreSQL 16.13, 20 GB, encrypted, not public, deletion protection on; AWS auto-restart 20 Nov 21:07:07 |
| Certificate `*.test.munaxa.com` | ISSUED, valid to 22 May 2027 |
| Schedules | 12 enabled; cleanup R 21:05, backstop 21:00 |
| Last cleanup R | execution `1a6aff64`, SUCCEEDED 19 Nov 21:05:22 |
| Alarms | `session-cleanup-failed`, `session-cleanup-not-run`: OK |
| NAT / EIP | none |
| Secrets | `identity` 2 versions, `identity-migrate` 1, RDS managed secret (AWSCURRENT, AWSPENDING, AWSPREVIOUS); every other nonprod bundle, the three Docs bundles included, has zero versions (metadata only, no value read) |
| Budgets (month to date) | Testing 3.52 of 50; shared 11.91 of 50; account 11.91 of 10 (over, known B-1); old docs-eu-prod 5.91 of 10 |

Detail in file 06.
