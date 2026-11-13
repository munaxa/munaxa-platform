# 01. Source and schema verification

Legend: **[V]** verified in source or by a local test, **[S]** from the Stage R live read-only results (02a of the previous report, 13 Nov 15:50 to 16:00 UTC), **[D]** AWS documentation, **[E]** expectation, **[U]** not verified.

Sources read for this report:

| Source | Commit |
| --- | --- |
| munaxa-identity | `2db6ed9bb2eec55a38a1d9808b4a51f6258662d8`, the approved commit, checked out detached |
| munaxa-platform `main` | `610a488` |
| PR #121 head | `3ca18ce`, unchanged since the previous report |

No AWS call was made for this report.

## 1. The bundle `munaxa-nonprod/identity`: exact keys

| Fact | Evidence |
| --- | --- |
| The stack expects exactly `DATABASE_URL`, `IDENTITY_SIGNING_PRIVATE_KEY`, `IDENTITY_SIGNING_SECRET`, `REDIS_URL`, `REDIS_PASSWORD`, plus `MFA_ENCRYPTION_KEYS` only when `identity_security_config` is set | `infra/aws/stack/data.tf:171-174` `local.identity_secret_keys` [V] |
| The bundle was created with exactly those five keys, in that order, as compact JSON | the 9 Nov owner generator `2026-11-09-identity-config-a1-preparation/supporting/identity-a1-owner-values.mjs:81-98` (its own check: "bundle key sets match infra/aws/stack/data.tf") [V] |
| The secret has one version, `ad02f18e-…`, `AWSCURRENT`, created 9 Nov 13:46 UTC; ARN suffix `-sn5umm`; KMS key `45eda044-…` (`alias/munaxa-nonprod-data`); no rotation | Stage R R-6 [S] |
| ECS injects each key as an environment variable of the same name, by `valueFrom = <arn>:<KEY>::<version id>`: a **pinned version**, never a label | `infra/aws/modules/service/main.tf:33`; rendered in `supporting/p5-placeholder-render-diff.txt` [V] |
| Identity reads `IDENTITY_SIGNING_SECRET` as its `MUNAXA_SIGNING_SECRET` (the refresh-token pepper) | identity `packages/config/src/environment.ts:76` [V] |

**The existing bundle must be read and merged, not replaced.** `PutSecretValue` stores a whole new `SecretString`; there is no per-key update [D: API_PutSecretValue]. The five existing values, including the database password, signing private key and pepper, must therefore be carried into the new version unchanged. If any of them is lost, the 2db6ed9 task fails to start or signs with a different key. The script checks key-for-key equality before and after the write (02 §2).

## 2. The MFA key ring: format, encoding, length

From identity `packages/config/src/mfa-keys.ts` at 2db6ed9 [V]:

| Rule | Source |
| --- | --- |
| `MFA_ENCRYPTION_KEYS` = comma-separated `kid=key` entries | lines 1-13, 28-40 |
| kid: `^[A-Za-z0-9_-]{1,64}$`, no duplicates | line 26 (`KID`), 44-52 |
| key: decodes (base64 or base64url, `-`/`_` mapped, padding optional, regex `^[A-Za-z0-9+/_-]+={0,2}$`) to **exactly 32 bytes**, AES-256-GCM | lines 53-57, 67-70 |
| key must not be one repeated byte | lines 58-61 |
| key must not equal, decode to, or be contained in `IDENTITY_SIGNING_SECRET` or `IDENTITY_SIGNING_PRIVATE_KEY` (base64 or base64url text) | `reusesSecret`, lines 72-88; applied in `environment.ts` `mfaKeyIssues` |

Chosen encoding: 32 bytes from `secrets.token_bytes` (the OS CSPRNG), **base64url without padding, 43 characters**, the format of Identity's own example (identity `docs/runbooks/mfa.md:78-104`, `mfa-2026-11=<43 characters of base64url>`). The entry written is `mfa-nonprod-2026-11=<43 characters>`, one entry, no comma.

## 3. The kid `mfa-nonprod-2026-11`

- It matches Identity's kid rule and is 19 characters, so it passes both stack validations [V]:
  - `variables.tf:385`, Identity's regex;
  - `variables.tf:393`, which refuses a 43-character kid because that is likely a pasted key.
- `MFA_ENCRYPTION_PRIMARY_KID` comes from `identity_security_config.mfa_primary_kid` (`services.tf:101`). PR #121 sets it to `mfa-nonprod-2026-11`, and the mocked render shows `MFA_ENCRYPTION_PRIMARY_KID=mfa-nonprod-2026-11` in the Identity container [V].
- Identity refuses to start if the primary kid names no entry of the ring (`environment.ts` `mfaKeyIssues`). The script writes the same constant kid; the offline test feeds the written ring to Identity's own loader with that environment and it **starts** (supporting/offline-test-output.txt, case 1a) [V].
- The kid is not secret: it is written into every ciphertext envelope `v1.<kid>.<nonce>.<ciphertext>.<tag>` (identity `docs/runbooks/mfa.md:20`).

## 4. The configuration loader's behaviour (production mode)

The Testing task runs with `NODE_ENV=production` (rendered environment) [V]. In production mode `loadEnvironment` (`environment.ts:249`, `288`, `363-420`) refuses to start, naming only the variable and never the value, when:

- the ring is empty ("is required in production");
- there is no primary kid, or the primary kid is not in the ring;
- any rule of §2 fails.

All problems are reported at once. Offline test results:

- the 2db6ed9 loader accepts the ring the script writes, with the P-5 environment (`MFA_POLICY=off`, `IDENTITY_PASSWORD_RESET=disabled`): result "starts", 0 problems, 1 entry, 32 bytes, no reuse [V];
- the previous report's harness covers the refusals (missing ring, wrong kid, not `kid=key`, 16-byte key, reused pepper): 11/11 [V].

## 5. Must `mfa_policy` stay `off`?

Yes, for this initial Testing configuration:

- The runbook (2026-11-12-phase-c-d-preparation/03, P-4) fixes `identity_security_config = { mfa_primary_kid, mfa_policy = "off" }`.
- `privileged` would require `MFA_PRIVILEGED_ROLES`, which is not set (`environment.ts` `mfaPolicyIssues`). The procedure for privileged accounts' enrolment and recovery does not exist yet (identity `docs/production-readiness.md` §6).
- The runbook §13 forbids enrolling the operator account.
- With `off`, MFA is optional. The ring is still required, so the throwaway account can test enrolment.

Stage C does not change the policy. Only PR #121 (Terraform) carries it.

## 6. Secrets Manager write and staging [D]

From the PutSecretValue API reference:

- Without `VersionStages`, `AWSCURRENT` moves to the new version and `AWSPREVIOUS` moves to the version it left.
- `ClientRequestToken` becomes the `VersionId`. A repeat with the same token and the same data does nothing, so an SDK retry cannot create a second version. The same token with different data fails.
- `SecretString` is not written to CloudTrail.
- Versions are immutable. Nothing is deleted.

After stage C:

| Version | Label | Holds |
| --- | --- | --- |
| new | `AWSCURRENT` | the five old values plus the ring |
| `ad02f18e` | `AWSPREVIOUS` | the five old values, still readable and still pinned by today's task definitions |

Secrets Manager may remove versions that carry no label once a secret has more than 100 versions. Here there are two, both labelled, so `ad02f18e` stays recoverable. A second write would leave it unlabelled; the 04 §3 rule "no further write until stage D" stays in force.

**Why moving `AWSCURRENT` is harmless:** every ECS reference to this bundle pins a version id (`services.tf:151-178`, `ops.tf:137-141`). Nothing reads `AWSCURRENT` of `munaxa-nonprod/identity` [V].

## 7. Minimum permissions for the owner-run operation

| Action | Resource | Why |
| --- | --- | --- |
| `sts:GetCallerIdentity` | — | account check |
| `secretsmanager:DescribeSecret` | the secret ARN | metadata, labels |
| `secretsmanager:GetSecretValue` | the secret ARN | read `ad02f18e` and read back the new version, in the process |
| `secretsmanager:PutSecretValue` | the secret ARN | the one write |
| `kms:Decrypt` | key `45eda044-…`, `kms:ViaService = secretsmanager.eu-central-1.amazonaws.com` | read |
| `kms:GenerateDataKey` | the same key and condition | write |
| `secretsmanager:ListSecretVersionIds` | the secret ARN | step 6 of 03 (CLI, metadata) |

The owner signs in as the account root user, which the approved development access allows (ACCESS-POLICY, 8 Nov). The data key's policy delegates to the account (`root`, `kms:*`) [S], so root has all of the permissions above. No IAM, KMS policy or account change is needed or made.

The ideal is a dedicated role with exactly this table. It does not exist, and creating it is outside this task (deployment IAM is deferred, ACCESS-POLICY D-4). Accepted as finding L-1 in 05.

## 8. What the CloudTrail record contains

`PutSecretValue` and `GetSecretValue` are management events. The secret string is not included [D]. After stage C, Claude checks one `LookupEvents` read with booleans and names only, in the next task: one `PutSecretValue` by the owner's principal on this ARN.
