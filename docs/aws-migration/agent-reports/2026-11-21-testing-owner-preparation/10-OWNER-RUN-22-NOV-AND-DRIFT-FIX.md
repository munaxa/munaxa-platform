# 10. Owner CloudShell run, 22 Nov 2026, and the drift fix

Owner (root, CloudShell, eu-central-1) ran the three reviewed scripts at main `00a7f64`, 12:59 UTC. All three SHA-256 checks were OK.

## Secret bundles (custody scripts): DONE
Each bundle was written once by its script and read back (BUNDLES VERIFIED). The owner sent only these version ids:

| Bundle | Version (AWSCURRENT) |
| --- | --- |
| munaxa-nonprod/control-migrate | ee66de8e-9ab8-4f72-8db8-11c631c1e0e0 |
| munaxa-nonprod/control-api | 655501d8-19f2-4190-9460-960b6464a1a2 |
| munaxa-nonprod/docs-operator | 85c17e64-1cec-4edd-80a2-59c5c06306d5 |
| munaxa-nonprod/docs-migrate | b9b569c4-c9d7-49ae-935f-a59ee4da6a14 |
| munaxa-nonprod/docs-api | b6ea4c3a-31ae-4d01-a4b7-7941f01e53a7 |

- Docs tenant_id: `d75d9645-d2da-48c3-af91-ab6f36e789a8`. Not a secret; Control needs it for the Docs subscription.
- `mail_key` placeholder: Resend was left empty on purpose.
- `control_token` placeholder: to be replaced with `replace-key CONTROL_PLANE_TOKEN` after Control issues it.

Claude checked the same five version ids and their single AWSCURRENT label through the connector with DescribeSecret (metadata only). No value was read. IAM users: 0. Root access keys: 0.

## Docs bootstrap plan: STOPPED SAFELY (nothing applied)
These checks passed: account, root caller, Region, backend, no lock, Terraform checksum, pinned clone `f1fca8f` (ecr.tf only since `a04723a`), provider lock 6.67.0, budget addresses, init, and `Plan: 2 to add, 3 to change, 0 to destroy.` The text plan reported no drift.

The script then stopped at `the plan JSON lists resource drift`. The owner printed the drift key names (no values) and deleted plan.json:

```
aws_ecr_repository.images["antivirus"] update tags
aws_ecr_repository.images["api"] update tags
aws_ecr_repository.images["web"] update tags
aws_iam_policy.image_publisher_boundary update tags
aws_iam_role.image_publisher update inline_policy,tags
```

### Diagnosis: refresh only, no change in AWS
- All five resources were created by the #141 bootstrap apply on 22 Oct 2026, 12:57:30-12:57:32 UTC: root, Terraform 1.16.6 (CloudTrail CreateRepository, CreatePolicy, CreateRole). That apply is the last write of the state object (12:57:33).
- CloudTrail, 90 days, read through the connector 22 Nov:
  - No TagResource, UntagResource, TagRole, UntagRole, TagPolicy or UntagPolicy on any munaxa-docs resource.
  - The only PutRolePolicy on the publisher role is the original `push-production-images` at 12:57:32 on 22 Oct.
- Live tags on all five are exactly the provider `default_tags` (Project, Environment, ManagedBy, Stack). The code sets no resource-level tags on them.
- `tags_all`, the effective tags, is not among the drifted attributes. Only the form of `tags` changed: null, {} or recorded default tags.
- `inline_policy` on `aws_iam_role` is computed. The role was recorded before `aws_iam_role_policy.image_publisher` attached `push-production-images` in the same apply, and the refresh now lists that policy.

None of the five is in the planned changes. The apply would only store the refreshed values in the state.

### Fix (this PR)
The script now accepts drift only when every one of these holds:
- **Addresses:** exactly these five may appear.
- **Action:** each drift entry is `update`.
- **Attributes:** only `tags` may drift on the four repositories and the boundary policy, and only `tags` and `inline_policy` on the role.
- **Effective tags:** `tags_all` is identical before and after.
- **Configured tags:** `tags` is equal once null is read as {}, or the recorded tags equal `tags_all` while none are configured.
- **Role policies:** the role's `inline_policy` names only `push-production-images`. Its content is already checked through `aws_iam_role_policy.image_publisher` (policy delta = only the migrate ARN).

Anything else still stops, and the message lists the drift entries. All later checks are unchanged.

- Harness: 28 tests (9 new in `KnownRefreshDrift`: both tag forms accepted, no-drift path, and refusals for a changed effective tag, a changed configured tag, another attribute, inline_policy on a tags-only resource, an unknown inline policy, an unlisted address, and a non-update action).
- New SHA-256: **`7a9c5cdceb0c16c18fe531573e4a20fadc7953d3187f221272c9f6ed9479ffb0`**. It supersedes `0b61f4a2…f70b`.

## Next
1. Owner re-runs the plan script only, from main after this PR. The bundles are done and are not re-run.
2. Claude checks the output.
3. The apply needs a separate owner yes naming the saved-plan SHA-256.
