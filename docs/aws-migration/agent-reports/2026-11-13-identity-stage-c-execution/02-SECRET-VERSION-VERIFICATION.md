# 02. Secret version verification (metadata only)

Read by Claude through the AWS connector after the owner's message, with `DescribeSecret` and `ListSecretVersionIds` (include deprecated) only. No `GetSecretValue` was called and no value was returned. [V]

| Field | Value |
| --- | --- |
| Secret | `munaxa-nonprod/identity` |
| ARN | `arn:aws:secretsmanager:eu-central-1:229251310592:secret:munaxa-nonprod/identity-sn5umm` |
| KMS key | `arn:aws:kms:eu-central-1:229251310592:key/45eda044-092a-4f31-9243-3f9548636e37` (unchanged) |
| Deletion scheduled | no |
| Last changed | 2026-11-13T19:40:16.029Z |
| Number of versions | 2 |

| Version | Created | Stages |
| --- | --- | --- |
| `80914756-68cd-420d-8094-0fd49afe3492` | 2026-11-13T19:40:16.025Z | `AWSCURRENT` |
| `ad02f18e-f3e7-41da-9959-f9b41e0b7e1a` | 2026-11-09T13:46:28Z | `AWSPREVIOUS` |

- The new version id matches the owner's two lines and the `PutSecretValue` client request token (03).
- No `AWSPENDING` version and no unlabelled version exist.
- The running Testing configuration is unaffected: nothing is running, and every task definition names a version id, not a label.
- Undo, if ever needed before stage D, is a labels-only `UpdateSecretVersionStage`; it is not needed.
