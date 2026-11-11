# S3 ListTagsForResource denial investigation (11 Nov 2026)

Scope: the 10 CloudTrail `AccessDenied` events reported by P-12 of the owner's preflight run on
11 Nov 2026 (`2026-11-11-identity-preflight-run-review`). The owner asked at 06:08 UTC for a
read-only investigation and a verdict.

**Method, read-only only.**

- AWS connector, signed in as root, read calls only:
  - CloudTrail `LookupEvents` (by event name);
  - Organizations `DescribeOrganization`, `ListPolicies` and `ListPoliciesForTarget`;
  - S3 `GetBucketPolicy` and `GetBucketTagging` on the two file buckets;
  - IAM `ListRolePolicies`, `ListAttachedRolePolicies`, `GetRolePolicy`, `GetPolicy`,
    `GetPolicyVersion` and `GetRole` on the two deployer roles.
- GitHub Actions run and job metadata.
- Repository source at `main` `d9ecb2f`.
- The AWS provider changelog at tag `v6.67.0`.

**Not done:**

- no policy, IAM, bucket, Terraform, workflow or secret action;
- no permission added and no preflight change;
- no merge.

Evidence:
[`evidence/cloudtrail-s3-listtags-events.json`](evidence/cloudtrail-s3-listtags-events.json) holds
all 10 events. A read-only CloudShell helper that prints the same events is
[`supporting/listtags-denials.sh`](supporting/listtags-denials.sh), SHA256 `e087706e…d070`; it was
not needed, because the connector was reconnected.

Labels: **[V]** verified here.

---

## 1. Verdict

**EXPECTED — no permission change required.**

The 10 events are 10 separate read requests, not repeats. Each is Terraform's AWS provider 6.67.0
asking S3 Control for one file bucket's tags, during the refresh of a `terraform plan`. No policy
allows `s3:ListTagsForResource`, so each request is an implicit deny.

In the same second, the same session read the same bucket's tags with `GetBucketTagging`, and that
succeeded. This is the fallback the provider documents. Every run succeeded, and nothing was left
unread or unmanaged.

## 2. The 10 events [V]

Common to all 10 events:

- **Request:** `s3.amazonaws.com` `ListTagsForResource`, eu-central-1, `readOnly: true`, sent to the
  S3 Control endpoint `229251310592.s3-control.eu-central-1.amazonaws.com`.
- **Error:** `AccessDenied`, HTTP 403.
- **User agent:** `Terraform/1.16.5 terraform-provider-aws/6.67.0 … api/s3control#1.79.0`.

Error message, identical apart from the caller and the bucket:

> User: arn:aws:sts::229251310592:assumed-role/&lt;role&gt;/gha-run-&lt;run&gt; is not authorized to perform:
> s3:ListTagsForResource on resource: "arn:aws:s3:::&lt;bucket&gt;" because **no identity-based policy
> allows** the s3:ListTagsForResource action

| #   | Event time (UTC)     | Event ID                               | Request ID         | Role (session issuer)                    | Run           | Bucket (resource ARN `arn:aws:s3:::…`)    |
| --- | -------------------- | -------------------------------------- | ------------------ | ---------------------------------------- | ------------- | ----------------------------------------- |
| 1   | 2026-11-10 06:05:36  | `d122840b-84ac-4197-a634-2b4e04893cb3` | `ZE0B2BDWAMX2J77J` | `munaxa-shared-deployer-nonprod`         | `42766116306` | `munaxa-nonprod-school-files-229251310592` |
| 2   | 2026-11-10 06:05:36  | `81db45a5-bf71-45cc-bc4b-e2ba6e86895d` | `ZE0FJ9TXACK1Q0JX` | `munaxa-shared-deployer-nonprod`         | `42766116306` | `munaxa-nonprod-docs-files-229251310592`   |
| 3   | 2026-11-10 06:09:44  | `1f430b53-c46f-4833-ab8e-c4ff55ce6d76` | `K7TT1Q78XDX6808M` | `munaxa-shared-deployer-nonprod`         | `42766582624` | `munaxa-nonprod-school-files-229251310592` |
| 4   | 2026-11-10 06:09:44  | `d92160af-1d5a-4c54-9bf7-d4454a76bf9a` | `K7TSFXA2BYYJKNB5` | `munaxa-shared-deployer-nonprod`         | `42766582624` | `munaxa-nonprod-docs-files-229251310592`   |
| 5   | 2026-11-10 06:13:15  | `940edfe3-668e-4c2d-a323-5781653d32f9` | `2FGFV7NSZTX96ZY6` | `munaxa-shared-deployer-nonprod`         | `42766964719` | `munaxa-nonprod-docs-files-229251310592`   |
| 6   | 2026-11-10 06:13:16  | `3586b283-7e6f-4122-a6fc-d72aabe78f13` | `Y6MNZ9KSJSZSGZXD` | `munaxa-shared-deployer-nonprod`         | `42766964719` | `munaxa-nonprod-school-files-229251310592` |
| 7   | 2026-11-10 08:51:47  | `4bade3f9-685f-4ee5-a9fe-c729b9729a0d` | `XR5J2KQQY82FTSWE` | `munaxa-shared-deployer-nonprod-session` | `42785877006` | `munaxa-nonprod-school-files-229251310592` |
| 8   | 2026-11-10 08:51:47  | `211e2c0c-f05f-4116-a8dc-67e34d4fcb52` | `XR5VGJX5JH5NZC01` | `munaxa-shared-deployer-nonprod-session` | `42785877006` | `munaxa-nonprod-docs-files-229251310592`   |
| 9   | 2026-11-11 00:05:23  | `d4ef388a-aab0-4244-ab60-4e40bca22ac2` | `XF8Y59T3ZPBKG6MV` | `munaxa-shared-deployer-nonprod-session` | `42928482147` | `munaxa-nonprod-school-files-229251310592` |
| 10  | 2026-11-11 00:05:23  | `f3226975-9342-4aed-8bc0-7080c863ec36` | `XF8MDDYEQFGFJ3J2` | `munaxa-shared-deployer-nonprod-session` | `42928482147` | `munaxa-nonprod-docs-files-229251310592`   |

Source IPs are GitHub-hosted runner addresses, one per run (in the evidence file). The lookup
returned 46 `ListTagsForResource` events in the window. The other 36 are `logs`, `rds` and
`servicediscovery` calls by the same sessions, and none failed.

## 3. Deduplication [V]

- **10 unique denied requests.** There are no duplicates: every event has its own event ID and
  request ID.
- **They form 5 pairs.** Each run asked once per bucket, once for `school-files` and once for
  `docs-files`. They are 2 distinct resources × 5 runs.
- **Why the preflight list looked duplicated:** it printed time, service, action, code and caller,
  but not the bucket.

## 4. Where each request came from [V]

| Run           | Workflow, trigger                        | Job / step (step window, UTC)                          | Denials at  |
| ------------- | ---------------------------------------- | ------------------------------------------------------ | ----------- |
| `42766116306` | AWS Terraform, owner dispatch (A1 plan)  | Plan nonprod (plan) / `terraform plan` (06:05:26-06:05:40) | 06:05:36    |
| `42766582624` | AWS Terraform, owner dispatch (A1 apply) | Plan nonprod (apply) / `terraform plan` (06:09:36-06:09:48) | 06:09:44    |
| `42766964719` | AWS Terraform, owner dispatch (post-apply plan) | Plan nonprod (apply) / `terraform plan` (06:13:05-06:13:20) | 06:13:15-16 |
| `42785877006` | AWS Testing session, nightly schedule    | Testing down / `Plan the switches` (08:51:37-08:51:53) | 08:51:47    |
| `42928482147` | AWS Testing session, nightly schedule    | Testing down / `Plan the switches` (00:05:14-00:05:29) | 00:05:23    |

- **Step.** Every denial falls inside a plan step, which is Terraform's refresh of existing
  resources. None falls in an apply step: the A1 apply job's `terraform apply` ran 06:10:39-06:10:53
  with no denial. All 5 runs concluded `success`.
- **Terraform resource.** `aws_s3_bucket.files["school"]` and `aws_s3_bucket.files["docs"]`
  (`infra/aws/stack/storage.tf:41`, `for_each = local.buckets`). Docs is enabled in nonprod because
  `hosts.docs` is set (`stack/envs/nonprod.tfvars:24`, `stack/docs.tf:21`), so there are two
  buckets.
- **Code path.** The user agent names the S3 Control client (`api/s3control`), which is the API
  behind `ListTagsForResource` for buckets.

## 5. Policies, bucket configuration and SCPs [V]

**Identity-based policies, read live.** Every statement in all seven documents was checked for
whether it applies to `s3:ListTagsForResource`, by Action, NotAction and wildcards.

| Role                                     | Documents (statements)                                                                                                         | Allow covering the action | Deny covering the action                                                                                                                                                                                                |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `munaxa-shared-deployer-nonprod`         | inline `deployer` (21), `munaxa-shared-deployer-read` (2), `…-nonprod-allow-tagged` (12), `…-nonprod-allow` (17)                 | **none**                  | 11 guardrails in `deployer`, all `Action: *`. None matches these buckets: their names are not `munaxa-docs*`, `munaxa-prod-*` or the state bucket; their tags are `Project=munaxa`, `Environment=nonprod`; they are not in a protected VPC |
| `munaxa-shared-deployer-nonprod-session` | inline `session-deployer` (30), `munaxa-shared-deployer-read` (2), `…-nonprod-session-read` (4)                                  | **none**                  | the same 11 guardrails, same result                                                                                                                                                                                     |

- **No permissions boundary** on either role.
- **The code agrees:**
  - `bootstrap/iam_allow.tf:460-468` (`FileBuckets`) allows bucket configuration actions including
    `s3:GetBucket*`, but not `s3:ListTagsForResource`;
  - `bootstrap/iam_session.tf:273-274` allows `s3:GetBucket*` and the configuration reads;
  - the guardrail `ThisRegionOnly` excludes `s3:*` (`bootstrap/iam.tf:224-234`).
- **Bucket policy, both buckets:** a single statement `TlsOnly`, Deny `s3:*` when
  `aws:SecureTransport` is false. The requests used TLS 1.3 (`TLS_AES_128_GCM_SHA256`), so it does
  not apply. The code is `stack/storage.tf:129-145`.
- **Bucket tags, both buckets:** `Project=munaxa`, `Environment=nonprod`,
  `ManagedBy=terraform/munaxa-platform/infra/aws/stack`, `Stack=shared`. These are the provider
  `default_tags`, so the tags are correct.
- **SCPs:**
  - Organization `o-6i2zz7t70i` has SCPs enabled. The only SCP is the AWS-managed `FullAWSAccess`,
    and none is attached to account `229251310592` directly.
  - `229251310592` is the organization's management account. SCPs do not apply to principals in the
    management account (AWS Organizations documentation), so no SCP can explain or cause these
    denials.

## 6. Root cause [V]

- **Provider behaviour.** From AWS provider 6.23.0 (26 Nov 2025), `aws_s3_bucket` reads and updates
  tags through the S3 Control tagging APIs `TagResource`, `UntagResource` and `ListTagsForResource`,
  to support ABAC on general purpose buckets.
- **Fallback.** The changelog states: "If the principal lacks the appropriate permissions, the
  provider will fall back to tagging after creation and using the S3 tagging APIs
  `PutBucketTagging`, `DeleteBucketTagging`, and `GetBucketTagging` instead." Source:
  `hashicorp/terraform-provider-aws` CHANGELOG at tag `v6.67.0`, section 6.23.0, PR #45251. The
  file's SHA256 as fetched is `1334e836…55f7`.
- **What happened here.** Neither deployer role allows `s3:ListTagsForResource`, so the first call
  is an implicit deny. CloudTrail then shows the fallback for every pair: a successful
  `GetBucketTagging` on the same bucket, by the same session, in the same second. That is 10
  successful `GetBucketTagging` events, one per denial, with no error.
- **Precise missing permission:** `s3:ListTagsForResource` on
  `arn:aws:s3:::munaxa-nonprod-{school,docs}-files-229251310592`.
- **Explicit deny:** none. The message says "no identity-based policy allows", and the policy check
  above confirms it.

## 7. Is this a deployment problem? [V]

No, for these reasons:

- Every request is read-only. Nothing was written, and no state differs: the post-apply plan
  `42766964719` reported no changes.
- The provider got the tags through `GetBucketTagging`, so drift detection on the bucket tags still
  works.
- No run failed, and no apply step was involved.
- The same denial has occurred at every Terraform run since the buckets were created on 5 Nov
  (`2026-11-05-g3-failed-apply-recovery/00-G3-FAILED-APPLY-RECOVERY.md:103`), with no effect.

**Residual risks:**

1. **Creating or re-tagging buckets.** Changing bucket tags uses the fallback path
   (`PutBucketTagging`), which `s3:PutBucket*` allows. The provider warns that "with ABAC enabled,
   tag modifications may fail with the fall back behavior". ABAC is not enabled on these buckets:
   the code has no `aws_s3_bucket_abac`, and ABAC is off by default. So this does not apply today.
2. **Monitoring noise.** Each Terraform run that reads the file buckets adds two denials, and P-12
   and the step 23 check will keep listing them. That is a reporting issue, not an access issue.
   The owner's D-1 decision of 05:54 UTC covers it.
3. **Future provider change.** If a later provider version dropped the fallback, refresh would fail
   loudly in a plan. Nothing would be applied silently, and the provider is pinned (`~> 6.67`, lock
   file `6.67.0`).

## 8. Recommended correction

**None required.** The owner's restriction applies: no permission is added only to make P-12 pass,
and the preflight is not changed to hide these events.

If the project later enables S3 ABAC on these buckets, or wants the provider's primary tag path,
the narrowly scoped change would be to allow `s3:ListTagsForResource` (and, for writes,
`s3:TagResource` and `s3:UntagResource`) on `arn:aws:s3:::munaxa-<env>-*` in `FileBuckets`. That
would be a separate decision and is not proposed here.

## 9. No AWS changes

Only the read calls listed under Method were made. Nothing in AWS, GitHub settings or Terraform was
changed, and nothing was merged. The repository changes are this report, its evidence and helper,
and the README index line.
