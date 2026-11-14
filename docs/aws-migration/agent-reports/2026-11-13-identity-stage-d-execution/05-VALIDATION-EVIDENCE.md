# 05. Validation evidence

## Timeline (UTC, 13 Nov 2026)

| Time | Event |
| --- | --- |
| 21:18 | owner authorization for M and P |
| 21:19 | pre-merge checks; PR #121 marked ready; squash merge `68fa6f9` (expected head `30de485`) |
| 21:19:47 | dispatch of run 43509702203 (`nonprod`, `plan`) |
| 21:20 | read-only AWS checks: database stopped, backstop calls, rotation, certificate, budgets, ECS |
| 21:29:02–21:29:40 | owner approved the gate; plan job success; apply job skipped |
| 21:3x | job log read; read-only `DescribeTaskDefinition` (task role, modes, tag keys) |
| 21:42 | owner approved decision A |
| 21:43:38–21:44:24 | apply run 43513076111 plan job: `--enforce` matched 6; plan saved |
| 21:44:39–21:45:15 | apply job (owner approved the second gate): saved plan applied |
| 21:46–21:48 | read-only post-apply verification (06) |

## Commits

| Item | SHA |
| --- | --- |
| Reviewed head | `30de48542f3c16653d30a6d4fa891ca215e10ad2` |
| Merge commit (main) | `68fa6f93fd55c2480f3a8e6e486b5957539eaafa` |
| Declaration SHA-256 | `05aafdae7d58d994b6cb1c11307e6f836083b8298eebdfa9145f8c447ce33b81` |
| Workflow file SHA-256 | `a44ab304d206c7e0849779531cb711401de6813a6621795f1248a7d52aad5113` |

## GitHub evidence

- PR #121: before (open, draft, clean, head `30de485`, checks green, no review threads or comments); after (merged).
- Run 43509702203: jobs, step conclusions and the plan job log (plan summary, changed attribute names, intent result).
- Commands: `git diff --name-only origin/main 30de485`, `git show 30de485:<tfvars> | grep …`, `sha256sum` of the declaration at three commits, `git diff 30de485 origin/main` (empty), workflow file hash.

## AWS read-only evidence (connector, root)

- `rds:DescribeDBInstances`, `DescribeEvents`.
- `cloudtrail:LookupEvents` (`StopDBInstance`, `UpdateService` since 20:55; since 21:25, rechecked at 21:33 after the plan's own read events (Describe*, Get*, Decrypt) had been delivered: **no management write event** and no `GetSecretValue`; the state lock file is an S3 data event, not in this trail).
- `secretsmanager:DescribeSecret` on the RDS master secret (metadata).
- `acm:ListCertificates`, `DescribeCertificate`; `budgets:DescribeBudgets`.
- `ecs:ListServices`, `ListTasks`, `DescribeTaskDefinition` (revision, task role, IPC/PID mode, fault injection, tag keys).

No secret value, plan file or state file was read.

## Not performed

Under decisions M and P (until 21:29), as originally recorded: no Terraform apply; no `action=apply` dispatch; no second dispatch; no saved plan; no deployment or service start; no migration; no database start or stop; no secret create, rotate, update or delete; no IAM, network, security group, KMS, DNS, schedule or budget change; no production or management-account change; no safety check weakened; the expected-change declaration was not modified. Repository writes: the PR #121 merge (authorized) and this report's branch.

**Superseded in part at 21:42:** the owner then approved decision A, and one `action=apply` dispatch (run 43513076111) applied the six declared changes. That run and its verification are in 06. Everything else in the list above still holds after the apply.
