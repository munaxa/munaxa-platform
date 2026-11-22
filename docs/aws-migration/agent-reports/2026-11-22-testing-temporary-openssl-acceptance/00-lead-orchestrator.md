# 00. Lead orchestrator: Docs Testing under the temporary D-SSL OpenSSL acceptance

Date: 22 Nov 2026 (brief 14:07 UTC). Labels: **[V]** verified, **[R]** recommended, **[U]**
unverified, **[O]** owner action.

**Docs Testing is NOT deployed.** Nothing was applied, created, published, started, rotated or read
from a secret. No tag, no workflow dispatch, no DNS, no Cloudflare, no IAM or Identity Center change,
no GitHub environment change. AWS reads were metadata only, done **as root** through the Claude
connector (the switch to `MunaxaReadOnly`, O-IAM-6, is still pending).

## Outcome

| # | Brief item | Result |
| --- | --- | --- |
| 1 | Live state | [V] Root MFA on, 0 root keys, 0 IAM users; Identity Center ACTIVE with 3 permission sets assigned; 5 secret bundles one AWSCURRENT version each (ids unchanged); 9 ECR repositories IMMUTABLE + scan on push, no `latest`, `munaxa-docs/migrate` empty; 0 ECS services/tasks, RDS stopped, no load balancer. Alpine v3.24 and edge still `libssl3`/`libcrypto3` 3.5.9-r1 (file 02) |
| 2 | D-SSL recorded | [V] File 01 §1 |
| 3 | Narrow exception | [V] **Implemented safely, without changing the permanent gate**: `scan-image.sh` byte-identical (sha `68c9f23c…`), `.grype.yaml` `ignore: []`, threshold `--fail-on high` unchanged. A separate check accepts a failed scan only for the 10 exact OpenSSL 3.5.9-r1 findings, listed images and workflows, environment `testing`, before 2026-12-01T00:00:00Z on a trustworthy clock; everything else still fails. Production excluded at deployment (platform guard P-1/P-2), Testing `up` with a listed image refused after expiry (E-1). 46 tests ×3 repos, 13 module tests, 93 stack tests, 4 static tests. Proven in CI: the Control run with an extra `openssl` CLI package was **refused** (file 01) |
| 4 | O-IAM-5 / O-IAM-6 | [O] Exact click and paste steps, file 06 A1-A3. Read-only evidence of the live permission sets, file 02 |
| 5 | Secrets, ECR, publisher, state | [V] File 02 (metadata only, no value read) |
| 6 | Image publication | Prepared, not executed: workflows, image names, candidate SHAs, owner click steps (file 03 §4) |
| 7 | Apply 1 / Apply 2 offline plans | [V] Apply 1 = 33 create + 4 replacements; Apply 2 = 42 create + 3 replacements; credential pin = 2 replacements; per-address identical to 21 Nov; the guard adds no resource (file 04) |
| 8 | Runbook | [V] 25 steps, file 05 |
| 9 | PRs | See file 03 §1 and §3 |

## What still blocks Docs Testing

1. [O] O-IAM-5 checks and O-IAM-6 connector switch (file 06 A).
2. [O yes] Y-1 image publication (Identity, Control, Docs) before 1 Dec.
3. [O yes] Y-2..Y-8: Apply 1 plan/apply, Apply 2 plan/apply, Control session with `OPERATOR_CIDRS`,
   Docs credential pin, Docs session. Each is a separate approval (file 06 B).
4. Deadline: after 2026-12-01T00:00:00Z the exception expires and fails closed; from then only
   OpenSSL 3.5.10 images (bump PRs identity#24, control#13, docs#182) can be published or started.

## Observations

- [R] The Identity and Control publisher roles show no permissions boundary in the read-only listing
  (Docs does). Not changed; noted for the deployment IAM review (file 02).
- [V] The Docs publish workflow assumes a role named `…eu-prod-image-publisher`; it pushes to the
  shared ECR used by Testing. Production use of any D-SSL image is still refused by P-1/P-2.

## Files

| File | Content |
| --- | --- |
| [01-DSSL-EXCEPTION.md](01-DSSL-EXCEPTION.md) | Decision, exact findings, design, production exclusion, tests, verification, removal |
| [02-AWS-READONLY-STATUS.md](02-AWS-READONLY-STATUS.md) | Live read-only state (as root) |
| [03-PR-CI-AND-PUBLICATION.md](03-PR-CI-AND-PUBLICATION.md) | PRs, CI evidence, publication preparation |
| [04-OFFLINE-PLANS.md](04-OFFLINE-PLANS.md) | Apply 1 / Apply 2 refreshed mocked plans |
| [05-DOCS-TESTING-RUNBOOK.md](05-DOCS-TESTING-RUNBOOK.md) | 25-step Docs Testing runbook |
| [06-OWNER-ACTIONS-AND-APPROVALS.md](06-OWNER-ACTIONS-AND-APPROVALS.md) | Owner steps and yes/no approvals |
| [supporting/](supporting/) | Plan summary JSON, output excerpt, the mocked test file |
