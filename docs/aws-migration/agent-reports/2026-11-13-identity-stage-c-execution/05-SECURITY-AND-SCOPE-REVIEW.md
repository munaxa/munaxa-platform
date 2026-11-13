# 05. Security and scope review

## Secret handling

| Question | Answer |
| --- | --- |
| Who generated the key? | the reviewed script in the owner's CloudShell, from the OS CSPRNG [O] |
| Did any value reach Claude, the thread or a repository? | no. The owner sent only the version id and the key id, which are not secret. Claude's AWS calls were metadata and CloudTrail only [V] |
| Did the connector ever handle a value? | no. M-3 stopped before any Secrets Manager call (01 §1) |
| Is any value in this report, PR #121 or a log Claude produced? | no: no secret JSON, credentials, signing material, MFA key material, request or response bodies, or environment dumps |
| Reads of values | two `GetSecretValue` calls, both by the owner's script inside CloudShell, as designed (read-merge-write and read-back) [V] |
| Writes | exactly one `PutSecretValue` on the one pinned secret [V] |

## Scope kept

Not done, as instructed: no other secret read or written; no IAM, KMS, account, OIDC or permission change; no Terraform plan or apply; no ECS or PostgreSQL start or stop; no migration; no DNS, Cloudflare or ACM change; no image or package; no deployment; no production change; no GitHub settings change; PR #121 not merged; stage D and stage E not begun; `mfa_policy` stays `off`.

## Residual items carried forward

| Item | Status |
| --- | --- |
| L-1: root, not least privilege | accepted under the 8 Nov access policy |
| The key must be kept once Identity stores an MFA secret under it | Testing only; the only MFA user will be a throwaway test account |
| S-1: the scheduled Testing shutdown fails at plan since 12 Nov (docs-migrate delta); DB stop still works | cleared by stage D |
| S-2: RDS master rotation fails while the DB is stopped | open, Low |
| S-3: the test certificate is not auto-renewable while unused | open, Low |
| $10 budget | unchanged |
| CloudShell home directory of eu-central-1 | deleted by the owner as step 2 required; nothing else was stored there |

## Stage D

Blocked until the owner approves it separately: merge PR #121, the owner-approved Testing plan and apply, `check-plan-intent.sh --enforce`, then the first Identity session.
