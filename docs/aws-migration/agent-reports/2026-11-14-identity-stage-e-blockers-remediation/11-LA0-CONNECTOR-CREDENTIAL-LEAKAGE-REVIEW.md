# L-A0: connector credential leakage review (C-8, C-8R, C-8v, C-16, C-24)

Date: 14 Nov 2026. Independent owner review of PR #130 (file 10). Repository evidence only: no
connector call, no AWS CLI call, no password generated, no secret created, read, changed or deleted.
C-8 and C-8R were not run.

## Conclusion

**L-A0 is UNRESOLVED and stays an owner decision (D-LA0).** The repository holds real connector
output that settles part of the question (what the connector *returns* for each AWS call), and
shows one exposure path the PR's reports did not name. It cannot settle what the connector's
server-side audit log keeps; only a live call can, and none was made.

## 1. Where the password exists

| Step | Script and line | What carries the password |
| --- | --- | --- |
| Generated | `c8-create-operator-secrets.py` `c8()`, `c8r-recover-operator-secrets.py` `c8r()`: `secretsmanager:GetRandomPassword` (`PasswordLength` 40) | the **response** (`RandomPassword`), inside the connector sandbox's Python process |
| Policy check | `acceptable(pw, email)` in both scripts | sandbox memory only; up to 3 generations if a candidate is refused |
| Stored, C-8 | `CreateSecret` twice (`munaxa-nonprod/identity-operator`, `munaxa-nonprod/identity-bootstrap`) | the **request parameter** `SecretString` (JSON with email, password, organisation) |
| Stored, C-8R | `PutSecretValue` (persistent) and `CreateSecret` (bootstrap) | the **request parameter** `SecretString` |
| Retried | `create()` in C-8 and the C-8R loops: one retry on `PY_TIMEOUT`, `ThrottlingException`, `InternalServiceError`, same `ClientRequestToken` | a second request with the same `SecretString` |
| Not present | C-8v (DescribeSecret, ListSecretVersionIds), C-16 (DescribeSecret, DeleteSecret), C-24 (LookupEvents), E-1, H-20 | never: none calls GetRandomPassword, CreateSecret, PutSecretValue, GetSecretValue or BatchGetSecretValue (`sandbox_harness.py` refuses the last two; checked in `test_connector_scripts.py`) |

The scripts' own return value never holds the password or the email: every return is built from
names, ARNs, version ids and codes, and every error goes through `code_of()`, which returns the AWS
error **code** only (`test_connector_scripts.py` drives fake errors whose messages contain the
request and checks that no message, password or email reaches `result`). That part of the PR's
claim is verified.

## 2. What the connector records: repository evidence

The repository keeps 17 complete `run_script` results from 11 Nov 2026, 224 AWS calls in all
(`2026-11-11-identity-phase1-readonly-assessment/evidence/*.json` and
`2026-11-11-identity-claude-executed-deployment-plan/evidence/log-filter-revision/*.json`).
Counted for this review:

- Top-level fields of a result: `status`, `return_value`, `stdout`, `stderr` (when non-empty) and
  `api_calls`.
- Fields of an `api_calls` entry, across all 224: `service` (224), `operation` (224), `status` (224),
  `n_items` (179, a count of list items per response key, for example `{"Events": 50}`) and
  `error` (5). **No entry holds request parameters or a response body.**
- The `error` field holds the **full AWS error message**, not only the code. Two of the five
  recorded errors are:
  - `ResourceNotFoundException: An error occurred (ResourceNotFoundException) when calling the FilterLogEvents operation: The specified log group does not exist.`
  - `InvalidParameterException: An error occurred (InvalidParameterException) when calling the FilterLogEvents operation: Invalid character(s) in term '%('`

  The second message **echoes part of the request parameters**. The connector writes it into
  `api_calls` itself, whatever the script does with the exception. So `code_of()` protects the
  script's `result`, but it cannot protect the connector's own `api_calls` record.

What this establishes, for the connector as it behaved on 11 Nov:

| Question | Answer | Basis |
| --- | --- | --- |
| 1. Where is the password generated | `GetRandomPassword`, inside the sandbox | §1 |
| 2. Which calls receive it | `CreateSecret` (C-8 ×2, C-8R ×1), `PutSecretValue` (C-8R ×1), plus any retry of these | §1 |
| 3. Does the connector record request parameters in `api_calls` | **Not observed** in 224 calls | §2 |
| 4. Does it record responses in `api_calls` | **Not observed**: only `n_items` counts of list keys; `GetRandomPassword` has no list key | §2 |
| 5. Can script output include it | No: `result` is codes, names, ARNs and versions; no `print`; `stdout`/`stderr` are empty unless the script writes or crashes, and every script catches all exceptions | code, tests |
| 6. Can errors or retries expose it | **Yes, potentially**: the connector records the full error message of every failed call, and AWS validation messages can quote request content (observed). No observed Secrets Manager message quotes `SecretString`, but this cannot be excluded offline | §2 |
| 7. Does the connector's audit trail keep it | **Unknown.** The AWS MCP server advertises "observability and audit logging". What that log keeps (script text, parameters, responses) is not visible from the repository | none available |
| 8. Is a safer method possible | Yes (§4) | |

Limits of this evidence: it is three days old, from read-only calls, and the connector may change.
It shows what the connector *returns to the session*; it says nothing about what the server keeps.

Two further facts the earlier reports already accepted, restated so they are not lost:

- The script **source** is sent to the connector as the tool's input, so it is in the session
  transcript and (per the 13 Nov observation) in the account's audit records. C-8/C-8R carry the
  private operator email in their INPUT line. They never carry the password.
- The password lives in the sandbox's process memory for the length of one call (L-A0 as accepted
  on 11 Nov).

## 3. Verdict

L-A0 is narrower than the PR's file 06 §5 feared (no parameters or responses in `api_calls` in 224
calls) and wider in one respect it did not name (full error messages are recorded by the
connector, outside the script's control). The server-side audit log remains unknown. **Unresolved;
not accepted by this review.** C-8 and C-8R must not run until the owner decides D-LA0 (file 08).

## 4. Safer alternatives (proposals only, not implemented)

1. **Generate the password inside Secrets Manager, never in a call.** A CloudFormation stack
   (owner-approved, one `CreateStack` through the connector) with an
   `AWS::SecretsManager::Secret` that uses `GenerateSecretString`
   (`SecretStringTemplate` = email and organisation, `GenerateStringKey` =
   `IDENTITY_OWNER_PASSWORD`, `PasswordLength` 40, `ExcludeCharacters`). The password never
   appears in any API request or response the connector sees; the template holds only the email.
   Trade-offs: CloudFormation cannot give the second (bootstrap) secret the same value, so the
   bootstrap task would read the persistent secret's JSON keys directly (its execution role gets
   `GetSecretValue` on `identity-operator` for the session only), or the bootstrap secret is
   dropped; the `acceptable()` policy check moves to the bootstrap container (it already refuses a
   trivial password, after which C-8R-style rotation is needed). This changes Option A and needs an
   owner decision.
2. **Keep C-8 but shrink the error path.** Before `CreateSecret`/`PutSecretValue`, validate locally
   everything AWS would refuse with a message (name, KMS alias shape, tag shapes, size), so the
   only expected failures are service errors whose messages carry no request text. This narrows
   question 6 but cannot close question 7.

## 5. Harmless verification procedure for D-LA0 (future, owner-approved)

Goal: learn what the connector records, with no real credential, no secret created and nothing
changed. One `run_script` call, read-only plus one deliberate failure:

1. `sts:GetCallerIdentity` (baseline entry).
2. `secretsmanager:DescribeSecret` with `SecretId` = a fresh canary name such as
   `munaxa-nonprod/la0-canary-<uuid4>` that does not exist. Expected `ResourceNotFoundException`;
   look for the canary string anywhere in the returned `api_calls`, `stdout`, `stderr`.
3. `secretsmanager:GetRandomPassword` with `PasswordLength` 32, the value discarded at once and
   never returned (it protects nothing). In the returned `api_calls`, look for any 32-character
   string or a response field.
4. Optional, and only if steps 1 to 3 show no parameters: `secretsmanager:CreateSecret` meant to
   fail validation, with `Name` = the canary name, `SecretString` = a second canary such as
   `LA0-CANARY-<uuid4>` (not a credential) and a deliberately invalid input (for example a reserved
   `aws:` tag key). Look for the second canary in `api_calls`. This review could not confirm offline
   that every such failure creates nothing, so step 6 checks, and a canary secret that does exist
   is deleted by exact name.
5. Afterwards, `cloudtrail:LookupEvents` for the canary events (requestParameters and
   responseElements presence only, never values) and, if the AWS MCP server's own audit log is
   reachable by the owner, a search there for both canaries.
6. C-8v-style check that the canary name does not exist (nothing was created).

Pass rule: neither canary and no 32-character random string appears in anything the connector
returned or logged. If any appears, C-8/C-8R must change to alternative 1 before Stage E.

Step 4 is the only write-shaped call; it is designed to fail. Steps 1 to 6 need the owner's explicit
approval: they are live calls against the account, and step 4 is a `CreateSecret` request.
