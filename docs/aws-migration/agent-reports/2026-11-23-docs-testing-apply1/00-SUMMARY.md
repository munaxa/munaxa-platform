# 2026-11-23: read-only connector verified, Testing images published (Y-1), Apply 1 pin PR

Continues report [2026-11-22-testing-temporary-openssl-acceptance](../2026-11-22-testing-temporary-openssl-acceptance/)
(files 05 and 06). Labels: **[V]** verified, **[P]** pending.

**Status:** Y-1 done. The images are published and pinned in this PR. **Nothing is applied and nothing
is running.** Y-2 (Apply 1 plan) is the next owner approval.

## 1. O-IAM-6: Claude's AWS connector is read-only [V]

Checked on 23 Nov 2026 at 11:39 UTC, through the AWS connector, read-only:

| Check | Result |
| --- | --- |
| `sts:GetCallerIdentity` | `arn:aws:sts::229251310592:assumed-role/AWSReservedSSO_MunaxaReadOnly_96f6bee034a2e5c3/<user>` |
| `ecs:ListClusters` (eu-central-1) | allowed: `munaxa-nonprod` |
| `iam:SimulatePrincipalPolicy` on the role: `secretsmanager:GetSecretValue`, `BatchGetSecretValue` | **explicitDeny** |
| same: `logs:GetLogEvents`, `logs:FilterLogEvents` | **explicitDeny** |
| same: `ecs:ListClusters`, `secretsmanager:DescribeSecret` | allowed (metadata only) |

No secret value was requested. The connector's first two calls (11:36 UTC) failed until the owner
reconnected it. Root is no longer the connector's identity.

## 2. Y-1: image publication [V]

The owner approved Y-1 at 11:39 UTC (decision card). The owner then created three `image/<sha>`
pre-release tags on `main` and approved `image-release` for each run. All three runs **succeeded**.

| Product | Commit | Run | Image | Digest |
| --- | --- | --- | --- | --- |
| Identity | `0b94951357e52aa2644d0b7d9305b5a7f22e7e2d` | [45167312831](https://github.com/munaxa/munaxa-identity/actions/runs/45167312831) | `munaxa-identity/api` | `sha256:b69d9481e43269b5061e3f70a421a41b007bac0d3a0e17b49f8906fe78fd4caa` |
| | | | `munaxa-identity/migrate` | `sha256:f44593fa3f0021eb301f9270849cc7498012247b50cbf8a5e8dc586f14616462` |
| Control | `744765dfa73721e691425b398755888bdf86a9b0` | [45167349640](https://github.com/munaxa/munaxa-control/actions/runs/45167349640) | `munaxa-control/api` | `sha256:6c79f98ede5159aabae316ad2f29c5e85b99e6bc011265a16da4d75fb44f88f0` |
| | | | `munaxa-control/migrate` | `sha256:0ae0db81a6c1eb07068f8bb330379664f15ec3d4cbcadc519cf968082da723a9` |
| | | | `munaxa-control/portal` | `sha256:752fea31c1f0ac6dbcdffc0d5d1bfcd0348eb84e5f7008aad77f645275f64ca6` |
| Docs | `9348aabed5bb34f24eeea8ee1e77f5a3c7f93bd9` | [45167367972](https://github.com/munaxa/munaxa-docs/actions/runs/45167367972) | `munaxa-docs/api` | `sha256:febeaca7bb1e58b261677c30cc4aabeec7d00896b40155f89ead903597be073d` |
| | | | `munaxa-docs/web` | `sha256:28e22b96ada6237abef4f53470c1d13723bb70931ae8dfa774df8d536cbb48cd` |
| | | | `munaxa-docs/migrate` | `sha256:4d00650b9759a64889cf2c95a3c10cb508787737af2d69aff64c23ba56e66ae8` |
| | | | `munaxa-docs/antivirus` | `sha256:801c77e1560ec63430463346810c83527a5183982e94cc82950cbbed3f015dfc` |

How the commits were chosen: each was the head of `main` on 23 Nov, and `main` CI passed at each one.
Identity used run 45033255265. Control used run 45034965914. Docs `9348aab` only changes
`docs/operations/go-live-runbook.md` compared with `d1d10af`, which passed run 45035771577.

Scan evidence from the job logs:

- Each of the eight exception images says this: `the permanent gate FAILED; checking the temporary
  Testing-only D-SSL exception`.
- Each then says this: `exception D-SSL-2026-11 accepted 10 HIGH/CRITICAL finding(s), expires
  2026-12-01T00:00:00Z`, listing only libssl3/libcrypto3 3.5.9-r1. The eight images are Identity
  api/migrate, Control api/migrate/portal, and Docs api/web/migrate.
- Docs antivirus passed the permanent gate alone.
- The Docs run also passed "Confirm the release in ECR" and "Release smoke on the published digests".

Digests come from the logs of each job's build and push steps (`exporting manifest`, `"digest"`).

**[P] ECR cross-check.** Two checks are still to do with the read-only connector: ECR
`DescribeImages` / `DescribeImageScanFindings` for these digests (the ECR scan shows only the 10
accepted findings), and the tags. The connector failed to reconnect at about 13:25 UTC (HTTP 404
from the connector service). This check is made before the Y-2 plan is run, and its result is added
to this folder.

The Docs `worker` image is not in this release. This matches file 03 of the 22 Nov report, which
lists only api, web, migrate and antivirus.

## 3. Apply 1 pin PR (this PR)

This PR is the 21 Nov template `apply1-repository-change-TEMPLATE.patch` with the placeholders
replaced by the digests above. It also has these changes:

- `dssl-exception.tf`: the five Identity and Control digests are added to
  `dssl_testing_only_image_digests`. Production can never pin them (P-2), and a Testing `up` is
  refused from 2026-12-01T00:00:00Z (E-1).
- `withdrawn-images.tf`: the 2db6ed9 Identity digests `9a8c6ebd`/`5f3bdcce` are withdrawn. The list
  now has 12 digests, and refusal tests are added.
- `identity_security_config`: `mfa_policy = privileged` with `control-operator-admin`,
  `control-operator-viewer` (D-OP-1).
- These files carry the same new Identity digests and MFA settings: the Stage E manifest
  `nonprod.stage-e-tasks.json` and the copy embedded in `e1-task-guard.py`.
- `nonprod.expected-changes.json`: **33 create + 4 replacements** (identity, identity-migrate,
  identity-bootstrap, identity-probe task definitions). It matches file 04 of the 22 Nov report.
  The intent text says OpenSSL D-SSL instead of 3.5.10.

Local checks, offline, with no AWS access. Terraform 1.16.5 and hashicorp/aws 6.67.0 were each
checked against the HashiCorp SHA256SUMS.

| Check | Result |
| --- | --- |
| `terraform -chdir=infra/aws/stack test` | **95 passed, 0 failed** |
| `python3 -I -m unittest ... test_dssl_exception.py` | 4 OK |
| `python3 -I -m unittest discover -s scripts/aws/connector` | 143 OK |
| `node --test 'infra/aws/stack/**/*.test.mjs'` | 116 pass |

Merging changes no AWS resource. `aws-terraform.yml` only runs on pull requests and when started
by hand.

**Known side effect until Apply 1 is applied.** Each scheduled `aws-session.yml` `down` run (19:17
and 01:47 UTC) plans against the new `main`. Its plan check refuses anything other than the session
switches, so it **fails without applying**. This happened once before, after #132 on 15 Nov. Testing
is idle, and the independent session cleanup (Step Functions) is not affected.

## 4. Next approvals (file 06 of 22 Nov)

| # | State |
| --- | --- |
| Y-1 | **done** (11:39 UTC approval, runs above) |
| Y-2 | next: merge this PR, then the owner runs AWS Terraform → `nonprod` → `plan`; Claude checks 33 + 4 |
| Y-3..Y-8 | not started |
