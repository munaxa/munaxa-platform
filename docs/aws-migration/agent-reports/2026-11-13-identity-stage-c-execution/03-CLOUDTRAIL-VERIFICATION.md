# 03. CloudTrail verification

Claude looked up CloudTrail management events in eu-central-1 from 18:00 UTC through the owner's message, read-only through the AWS connector. Only event names, times, identities, user agents and request parameter **names** were inspected; `PutSecretValue` events never record the secret value. [V]

## Secrets Manager events on `munaxa-nonprod/identity`

- All by the account root user, from a single CloudShell source, user agent `AWS Internal` (the CloudShell environment).
- The sequence is the one in 01 §4: preflight `DescribeSecret` / `ListSecretVersionIds`, one `GetSecretValue` of `ad02f18e`, one `PutSecretValue`, one read-back `GetSecretValue` of the new version, then the owner's `ListSecretVersionIds`.
- **Exactly one `PutSecretValue`**, at 19:40:16, client request token `80914756-68cd-420d-8094-0fd49afe3492`, request parameter names `clientRequestToken`, `secretId` (plus the value, which CloudTrail does not log). **No `versionStages`**, so Secrets Manager moved `AWSCURRENT` itself, as designed.
- No error code on any event.
- No Secrets Manager event on any other secret.

## Write events in the window

Apart from the one `PutSecretValue`, the only non-read events were CloudShell's own session events (`CreateSession`, `DeleteSession`, `PutCredentials`, `SendHeartBeat`, `StartEnvironment` at 18:18 and 19:34:29). No IAM, KMS, ECS, RDS, EC2, Route 53, ACM or other write.

## Connector activity by Claude

- About 18:15: one `sts:GetCallerIdentity` (the M-3 gate probe).
- After 19:44: `DescribeSecret`, `ListSecretVersionIds` and CloudTrail `LookupEvents` only.
