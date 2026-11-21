# 06. Control and Docs: dependency sequence and owner checklist

**Status: NOT STARTED on AWS.** Repository preparation is complete except control#11's image build (file 02). Nothing below has been executed.

## 1. Validation of PR #145's sequence

| Rule (PR #145 file 13) | Re-checked | Result |
| --- | --- | --- |
| 1. Stage E before C-2 | `ops.tf` builds db-admin's secrets from `var.db_bootstrap_products`; main has `["identity"]`; C-2 adds `control`, which changes the db-admin task definition that the E-1 guard compares with `envs/nonprod.stage-e-tasks.json` [V code] | **holds** |
| 2. Docs bootstrap (A-3) before the Docs release (A-5) | `munaxa-docs/migrate` repository still absent (`RepositoryNotFoundException`) [V] | **holds** |
| 3. docs#179 and the Control image fix before their releases | the Control fix is now **control#11**, not control#10 (file 04) | **holds, with the PR changed** |
| 4. Control release (A-5C) before C-1 | Control images unset on main [V code]; the new `images` validation now **refuses** the `a24c568` digests [T] | **holds, now enforced** |
| 5. Control bundle fill (A-4C) before C-2 | both Control bundles have 0 versions [V] | **holds** |
| 6. One plan, declaration and apply per config change, services off | unchanged | holds |
| 7. Every session capped (3-hour stop, R, backstop) | unchanged; add P-9 (file 05) to every session | holds, extended |

## 2. Dependency graph

```
A-R  rotation verified (21 Nov 00:30 UTC, automatic, read-only)
 │
 ├─► A-1  Identity Stage E  ──────────────────────────────┐ (operator org id + subject)
 │                                                        │
A-2  merges (any time): #141 #142 #143 #144 #145 this PR, │
     docs#178 docs#179, control#11 (close #10),           │
     identity#21 work#33 school#26                        │
 │                                                        │
 ├─► A-3  Docs bootstrap plan+apply ─► A-5  Docs release ─┤
 ├─► A-4  Docs bundles fill (CloudShell) ─────────────────┤
 ├─► A-4C Control bundles fill (CloudShell) ──────────────┤
 ├─► A-5C Control release ─► scan 0 HIGH ─┐               │
 │                                        ▼               │
 │   A-6  Resend decision (any time)   A-7 Cloudflare Access app + C-1 apply (33 creates)
 │                                        │               │
 │                                        ▼               ▼
 │                               A-8  C-2 + D-1 apply (services off) ◄── A-1, A-4, A-4C, A-5, D-G1
 │                                        │
 │                                        ▼
 │                               A-9  Control + Docs session; owner signs in; mints Docs credential
 │                                        │
 │                                        ▼
 └──────────────────────────────► A-10 replace-key CONTROL_PLANE_TOKEN; pin apply; licensed Docs session
```

## 3. Owner checklist by item

Repository preparation (done, no approval needed beyond merge) is marked **R**. Owner approval is marked **O**.

| Item | R: prepared in the repository | O: owner action | Proof of success |
| --- | --- | --- | --- |
| Docs ECR bootstrap (A-3) | `munaxa-docs/infra/terraform/bootstrap/ecr.tf` lists `migrate`; expected +1 repository, +1 lifecycle policy, publisher policy update | approve plan, then apply | `DescribeRepositories munaxa-docs/migrate` IMMUTABLE, scan on push |
| Docs secret bundles (A-4) | `docs-testing-secrets.sh bundles` (PR #143) | run it in CloudShell, type FILL, paste the Resend key or press Enter; send back only the SEND CLAUDE lines | 3 bundles with 1 version each (metadata) |
| Control secret bundles (A-4C) | `control-testing-secrets.sh bundles` (PR #143) | run it, type FILL, send back two version ids | 2 bundles with 1 version each |
| Control image release (A-5C) | control#11 (Alpine, verify step on the pushed digest) | merge, then push tag `image/<sha>` | ECR scan of api, migrate, portal: 0 HIGH, 0 CRITICAL |
| Docs image release (A-5) | docs#179 | merge, decide D-G1, then push tag | api, web, antivirus, migrate in ECR; scan recorded (expected 1 HIGH glibc) |
| Resend account and domain (A-6) | config accepts a marked placeholder; mail then fails closed (retried, dead-lettered) | decide: verify `notify.munaxa.com` now, or start with the placeholder | `mail_key resend` or `placeholder` line from the script |
| Cloudflare Access application (A-7) | `operator_access` variable and guard (refuses Control without it) | create the Access app for `operator-test.munaxa.com`; give Claude the team domain and AUD tag (not secrets) | values in the C-1 PR |
| Control C-1 (A-7) | offline plan 33 creates (PR #145 supporting harness) | approve the live plan, then apply | plan equals the declaration; KMS public key readable |
| Control C-2 (A-8) | offline plan 3 task-definition replacements | approve the live plan, then apply (after Stage E) | plan equals the declaration |
| Docs configuration and licensing credential (A-8, A-10) | D-1 pins (42 creates, services off); `replace-key CONTROL_PLANE_TOKEN` | approve the apply; after A-9 run `replace-key` | snapshot verified (ES256) in the Docs session |
| First Control and Docs sessions (A-9, A-10) | session plan 19 creates (Control); P-1 to P-10 apply | approve each session and window; sign in to the portal; mint the credential | acceptance checks of each session; same-day cleanup evidence |

## 4. What Claude must not do (unchanged)

No image tag, no workflow dispatch, no live Terraform plan or apply, no Cloudflare change, no secret script run, no deployment, no merge, without the owner's yes for that specific item.
