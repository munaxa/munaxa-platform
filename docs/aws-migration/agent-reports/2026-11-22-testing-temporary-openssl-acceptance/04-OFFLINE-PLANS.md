# 04. Apply 1 and Apply 2: refreshed offline plans

**Offline only.** Terraform 1.16.5 (zip SHA-256 checked against HashiCorp `SHA256SUMS`),
hashicorp/aws 6.67.0 (same check; the stack's `.terraform.lock.hcl` pins it), mocked provider, no
credentials, no AWS call, no state read. Source: munaxa-platform `main` `7a6fa9a` plus the D-SSL
guard of platform#159 (which adds no resource), `-var-file=envs/nonprod.tfvars`
(`account_id = 229251310592`, `region = eu-central-1`, `environment = nonprod`). The test file is
the 21 Nov one, unchanged: [supporting/apply1-apply2-mocked.tftest.hcl](supporting/apply1-apply2-mocked.tftest.hcl)
(placeholders for every digest, bundle version id and the licence key; each applied run feeds the next).

```
terraform -chdir=infra/aws/stack test -verbose -var-file=envs/nonprod.tfvars -filter=tests/apply1-apply2-mocked.tftest.hcl
Success! 7 passed, 0 failed.
```

| Step | Mocked plan (22 Nov) | Per-address compared with 21 Nov | Real-plan reading |
| --- | --- | --- | --- |
| **Apply 1** (C-1 + Identity pin + MFA privileged) | `33 to add, 4 to change, 0 to destroy` | **identical** (37 addresses) | 33 create + 4 task-definition replacements `["delete","create"]` (`module.identity[0]`, `module.migrate["identity"]`, `identity_bootstrap[0]`, `identity_probe[0]`); 0 pure destroy |
| **Apply 2** (C-2 + D-1) | `42 to add, 3 to change, 0 to destroy` | **identical** (45 addresses) | 42 create + 3 replacements (`db_admin[0]`, Control api, Control migrate) |
| Docs credential pin | `0 to add, 2 to change` | **identical** | 2 replacements (`module.docs_api[0]`, `docs_provision[0]`) |
| Docs session `up` | `28 to add` | **identical** | ALB, listeners, rules, certificate validation, services and target groups |

Machine-readable summary (every address and action per step):
[supporting/apply-plans-summary.json](supporting/apply-plans-summary.json), SHA-256
`8ad7600d4f352839ac8652102dcea340a44d44bcd05d4db29b24aeaf4524f99d`; run excerpt
[supporting/apply-plans-output-excerpt.txt](supporting/apply-plans-output-excerpt.txt).

Review of every action (from the address lists): **no destroy** other than the task-definition
revision replacements; **IAM**: only new execution/task roles and their inline policies for the new
Control and Docs services, the Docs provision execution role and policy (all under the existing
workload boundary, tested in `stack.tftest.hcl`); **network**: 2 ALB egress rules per apply to the
new services plus per-service security groups and their rules, no new ingress from the internet
outside the session's ALB (session `up` only); **KMS**: Apply 1 creates the Control licence signing key, its alias and key policy (expected, C-1); **ingress**: only service-to-service rules (`from_alb`, `database_from_service`, `from_callers`); **secrets**: no secret resource created or changed
(only version ids pinned); **production**: none (nonprod var-file; the D-SSL guard keeps prod at
`images = {}`). Nothing differs unexpectedly, so no stop.

What the real plans add (not reproducible offline): the state lock and the refresh. The
`aws-terraform.yml` workflow checks account, region, backend key (`stack-nonprod`) and compares the
plan to `envs/nonprod.expected-changes.json` per address, refusing any difference. Real plans are
run only by the owner from the workflow (Stage 2/3 of file 05), separately from applies.

The Apply 1 repository change set (`apply1-repository-change-TEMPLATE.patch`, report
2026-11-21-testing-owner-preparation) still applies with one addition: the new Identity and Control
digests also go into `dssl_testing_only_image_digests` (they are published under the exception).
