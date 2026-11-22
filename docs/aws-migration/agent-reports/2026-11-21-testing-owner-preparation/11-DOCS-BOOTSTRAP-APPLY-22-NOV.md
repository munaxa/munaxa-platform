# 11. Docs bootstrap plan and apply, 22 Nov 2026

## Plan
- **Who and where:** the owner, as root, in CloudShell (eu-central-1).
- **Script:** `scripts/aws/owner/docs-bootstrap-migrate-plan-owner-cloudshell.sh` at main `107ca86`, sha `7a9c5cdc…ffb0`, pin `f1fca8f`.
- **Run:** 13:42:47 to 13:43:45 UTC.
- **Checks:** all passed. `Plan: 2 to add, 3 to change, 0 to destroy.` 5 drift entries, all the known refresh-only tags and inline_policy differences (file 10).
- **Changes:** exactly the reviewed 2 creates and 3 policy updates. Each update only adds `arn:aws:ecr:eu-central-1:229251310592:repository/munaxa-docs/migrate`. The repository is IMMUTABLE with scan on push. 50 no-op.
- **Saved plan SHA-256:** `eb77022c47bca0320c6c1f5dd4fecea7195c2b9d1076fc124729de932a2e3c59`
- **Summary SHA-256:** `e6a3e499cd6deb95e14a5d1716e38959f87a164cefbb51de27212655618992aa`

## Owner approval
The owner tapped "Yes, apply it now" at 13:45:52 UTC on the card "Apply the verified Docs bootstrap plan now?".

## Apply
At about 13:46 UTC, the owner ran the apply in the same tab. The saved plan's SHA-256 was checked first (OK), then `terraform apply` ran on the saved plan:

> Apply complete! Resources: 2 added, 3 changed, 0 destroyed.

| Resource | Result |
| --- | --- |
| aws_ecr_repository.images["migrate"] | created (`munaxa-docs/migrate`) |
| aws_ecr_lifecycle_policy.images["migrate"] | created |
| aws_iam_policy.image_publisher_boundary | modified |
| aws_iam_policy.workload_boundary | modified |
| aws_iam_role_policy.image_publisher | modified |

## Verification (Claude, connector, read-only, about 13:48 UTC)
**Before the apply (13:47 UTC):**
- Publisher boundary default version v1; workload boundary v2. Both last changed 22 Oct.
- `munaxa-docs/migrate` did not exist.
- The publisher inline policy had no migrate ARN.

**After the apply:**
- **Publisher boundary:** default v2, includes the migrate repository ARN.
- **Workload boundary:** default v3, includes the migrate repository ARN.
- **`munaxa-docs/migrate`:**
  - IMMUTABLE, scanOnPush true, AES256 encryption;
  - lifecycle policy present;
  - tags = the provider default_tags (Project, Environment=Production, ManagedBy, Stack=bootstrap).
- **Publisher inline policy `push-production-images`:** includes the migrate ARN.
- **Account hygiene:** IAM users 0, root access keys 0, root MFA on.

CloudTrail had not delivered the 13:46 events at check time (normal delay of up to about 15 minutes). The live state above is the primary evidence.

## Next
- The Docs migrate image can now be published to ECR once D-SSL clears.
- O-IAM-5 (owner sign-in checks) and O-IAM-6 (connector on MunaxaReadOnly) remain.
