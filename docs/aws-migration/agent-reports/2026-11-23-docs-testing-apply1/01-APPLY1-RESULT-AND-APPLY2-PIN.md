# 01. Apply 1 result, ECR cross-check, Apply 2 pin PR

Labels: **[V]** verified. Times are UTC, 23 Nov 2026.

## 1. Y-2 and Y-3: Apply 1 [V]

| Step | Evidence |
| --- | --- |
| Y-2 approval | Owner decision card, 13:30. #162 merged as `9e09c6f` after CI passed |
| Plan | Run [45190164086](https://github.com/munaxa/munaxa-platform/actions/runs/45190164086), 14:03: **33 to add, 0 to change, 4 to replace, 0 to destroy**; "The plan matches the declared changes exactly (37 resource action(s))"; no Terraform warnings |
| Second plan | Run [45215418218](https://github.com/munaxa/munaxa-platform/actions/runs/45215418218), 16:20. The owner started it as `plan` by mistake, and its apply job was skipped. Same 33 + 4 |
| Y-3 approval | Owner decision card, 16:17 |
| Apply | Run [45216206954](https://github.com/munaxa/munaxa-platform/actions/runs/45216206954): plan job `MODE: --enforce`, 33 + 4, matches exactly. Claude checked the plan before the owner approved the apply gate. Apply job "Applied the saved plan of commit 9e09c6f" |

## 2. Post-apply read-only check (connector, MunaxaReadOnly, 16:40) [V]

| Check | Result |
| --- | --- |
| Caller | `AWSReservedSSO_MunaxaReadOnly_96f6bee034a2e5c3` |
| ECS services / running tasks | 0 / 0 |
| RDS `munaxa-nonprod-pg` | `stopped` |
| Load balancers | 0 |
| `munaxa-nonprod-identity` | rev 3 (16:34:24), image `b69d9481…`, `MFA_POLICY=privileged`, `MFA_PRIVILEGED_ROLES=control-operator-admin,control-operator-viewer` |
| `…-identity-migrate` / `-bootstrap` / `-probe` | rev 3 / 4 / 2, images `f44593fa…` / `b69d9481…` / `b69d9481…` (both probe containers) |
| `…-control-api` / `-migrate` / `-portal` | rev 1 each, images `6c79f98e…` / `0ae0db81…` / `752fea31…` |
| Licence key (`alias/munaxa-nonprod-control-licence`) | `ECC_NIST_P256`, `SIGN_VERIFY`, `ECDSA_SHA_256`. Public key read with `kms:GetPublicKey` |

## 3. ECR cross-check of the nine published digests [V]

`DescribeImages` and `DescribeImageScanFindings` were run for every digest in file 00 §2:

- Every digest exists.
- Each has exactly two tags, `<short sha>` and `sha-<full sha>`. None has `latest`.
- ECR reports **no HIGH or CRITICAL finding** for any of them.
- ECR returned no scan status or severity summary for these images. So ECR's own scan adds no
  evidence here. The scan evidence is the publish workflows' Grype gate (file 00 §2), which ran
  before every push.

This closes the pending item in file 00 §2.

## 4. Apply 2 pin PR

The `envs/nonprod.tfvars` changes follow the 21 Nov reviewed Apply 2 inputs. The mocked test is
`supporting/apply1-apply2-mocked.tftest.hcl` of report 2026-11-21-testing-owner-preparation. Its
placeholders are replaced by real values:

- Docs images `api febeaca7…`, `web 28e22b96…`, `antivirus 801c77e1…`, `migrate 4d00650b…`. They are
  9348aab, run 45167367972. api, web and migrate are added to `dssl-exception.tf`. Antivirus passed
  the permanent gate, so it is not listed.
- `control_licence_kid = control-licence-nonprod-2026-11`, plus the KMS public key read in §2. The
  public half is not a secret.
- The operator organisation `071d3060-…` and subject `ae62eef5-…`. These are identifiers, not
  secrets.
- `db_bootstrap_products = ["identity", "control"]`.
- `secret_version_ids` gains control-api `655501d8…`, control-migrate `ee66de8e…`, docs-api
  `b6ea4c3a…`, docs-operator `85c17e64…` and docs-migrate `b9b569c4…`. These are the ids from report
  2026-11-22 file 02 §3. They are metadata only, and no value was read.
- `nonprod.expected-changes.json` lists **42 create + 3 replacements**: `db_admin[0]`, the Control
  api task definition and the Control migrate task definition. The addresses are those of the 22 Nov
  mocked Apply 2 plan (`apply-plans-summary.json`). The 3 in-place updates of the mock are
  task-definition replacements in a real plan, as in Apply 1.

Local checks:

- stack `terraform test`: 95/95.
- A mocked plan with `-var-file=envs/nonprod.tfvars` passes every variable validation.
- `test_dssl_exception.py`: OK.
- connector tests: 143 OK.

**Known limitation.** The Stage E manifest (`nonprod.stage-e-tasks.json`, the `db-admin` family) is
not updated. Apply 2 adds Control to db-admin, so `e1-task-guard.py` would no longer match the live
db-admin. That guard belongs to the completed Identity Stage E. Sessions use `aws-session.yml`,
which does not read it.
