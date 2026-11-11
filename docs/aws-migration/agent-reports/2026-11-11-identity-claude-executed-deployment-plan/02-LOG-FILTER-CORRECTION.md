# Step 19c log filter: correction of F-1 and F-2

- Date: 11 Nov 2026, test call 09:36:20 UTC
- Scope: preparation and testing only, on the owner's request of 09:34 UTC.
- Data: synthetic lines only. No real log group was read, and no metric filter was created.
- AWS: one script with two `logs:TestMetricFilter` calls in `eu-central-1`, both read-only. No
  other AWS call was made.
- Findings corrected: F-1 and F-2 from the Phase 1 assessment (PR #88, section 6). The original
  19-line evidence from that assessment is kept unchanged here as
  `evidence/log-filter-revision/a4-original-19-lines.json`.

**This is a proposal for ChatGPT review. Nothing was deployed or applied.**

## 1. The patterns

Old pattern, from checklist step 19c:

```text
?eyJ ?BEGIN ?PRIVATE ?"password\":\""
```

Revised pattern, one CloudWatch Logs regular expression:

```text
%eyJ|PRIVATE\sKEY|[Pp]assword\x5c?\x22\s*:\s*\x5c?\x22[^\x22\x5c\[]%
```

How the revised pattern reads, branch by branch:

| Branch                                              | Matches                                                                                                                                                                                                               | Why it is written this way                                                                                                                                                                                      |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `eyJ`                                               | Any JWT, whatever surrounds it: a JSON field, a Bearer header, a URL, a cookie, or a bare token                                                                                                                       | `eyJ` is the base64 form of `{"`, which begins every JWT header. This is unchanged from the old pattern                                                                                                         |
| `PRIVATE\sKEY`                                      | `BEGIN` and `END` lines of PKCS#8, EC, RSA, OpenSSH and encrypted private keys, also inside a JSON string                                                                                                             | `BEGIN` alone also matched public keys and certificates (F-2). Only private-key headers contain `PRIVATE KEY`                                                                                                   |
| `[Pp]assword\x5c?\x22\s*:\s*\x5c?\x22[^\x22\x5c\[]` | A key ending in `password` or `Password` (`password`, `Password`, `newPassword`), then optional whitespace on either side of `:`, then a string value whose first character is not `"` (empty), `\` or `[` (redacted) | `\s*` fixes F-1. `[^…\[]` fixes F-2: Identity's logger writes redacted values as `[redacted]` (`apps/api/src/observability/logger.ts`). `\x5c?` also covers JSON escaped inside a string (`\"password\":\"…\"`) |

Two CloudWatch rules shape the syntax, as stated in the AWS documentation for filter pattern
syntax:

- inside `%…%`, `"` and the space character are not allowed, so they are written as `\x22` and
  `\s`;
- parentheses are not supported, so the pattern uses top-level `|` only.

## 2. Result

| Pattern                                     | Secrets detected | Clean lines left alone | Total correct | Result   |
| ------------------------------------------- | ---------------- | ---------------------- | ------------- | -------- |
| Old `?eyJ ?BEGIN ?PRIVATE ?"password\":\""` | 15 of 24         | 16 of 23               | 31 of 47      | **FAIL** |
| Revised (below)                             | 24 of 24         | 23 of 23               | 47 of 47      | **PASS** |

Lines 1 to 19 are the Phase 1 lines, with the same text and in the same order. On those lines, the
old pattern gave the same three wrong answers as in PR #88: line 8 (F-1), and lines 13 and 17
(F-2). The run is reproducible.

| Requirement from the owner's request                                      | Lines             | Revised result |
| ------------------------------------------------------------------------- | ----------------- | -------------- |
| Password fields with optional whitespace after the colon are detected     | 8, 20 to 24       | all detected   |
| Redacted password values are not classified as leaks                      | 13, 29 to 32, 35  | none matched   |
| Public-key and certificate PEM headers are not classified as private keys | 17, 41 to 43      | none matched   |
| JWTs are still detected                                                   | 1 to 3, 9, 45, 46 | all detected   |
| Private-key PEM headers are still detected                                | 4 to 6, 37 to 40  | all detected   |
| Unredacted password values are still detected                             | 7, 8, 20 to 28    | all detected   |

## 3. All 47 test lines

The fake JWT `<JWT>` is
`eyJhbGciOiJFUzI1NiIsImtpZCI6InRlc3QifQ.eyJzdWIiOiJGQUtFIn0.ZmFrZXNpZw`. It decodes to
`{"alg":"ES256","kid":"test"}.{"sub":"FAKE"}`, with the signature `fakesig`. Every password value
is `FAKE-not-a-password` or `x`. `\t` in line 23 is a real tab character in the test input.

| #   | Test                     | Kind   | Line (synthetic)                                                                                      | Old pattern          | Revised pattern |
| --- | ------------------------ | ------ | ----------------------------------------------------------------------------------------------------- | -------------------- | --------------- |
| 1   | o01 jwt-json             | secret | `{"level":30,"msg":"issued","token":"<JWT>"}`                                                         | match                | match           |
| 2   | o02 jwt-bearer           | secret | `authorization: Bearer <JWT>`                                                                         | match                | match           |
| 3   | o03 jwt-bare             | secret | `<JWT>`                                                                                               | match                | match           |
| 4   | o04 pem-private          | secret | `-----BEGIN PRIVATE KEY-----`                                                                         | match                | match           |
| 5   | o05 pem-ec               | secret | `-----BEGIN EC PRIVATE KEY-----`                                                                      | match                | match           |
| 6   | o06 pem-rsa              | secret | `-----BEGIN RSA PRIVATE KEY-----`                                                                     | match                | match           |
| 7   | o07 password-json        | secret | `{"level":30,"body":{"email":"x@example.invalid","password":"FAKE-not-a-password"}}`                  | match                | match           |
| 8   | o08 password-json-space  | secret | `{"body": {"password": "FAKE-not-a-password"}}`                                                       | no match **(wrong)** | match           |
| 9   | o09 jwt-in-url           | secret | `GET /callback?token=<JWT> 200`                                                                       | match                | match           |
| 10  | o10 request-log          | clean  | `{"level":30,"req":{"method":"POST","url":"/auth/login"},"res":{"statusCode":200},"responseTime":12}` | no match             | no match        |
| 11  | o11 startup              | clean  | `{"level":30,"msg":"Nest application successfully started"}`                                          | no match             | no match        |
| 12  | o12 health               | clean  | `{"level":30,"req":{"method":"GET","url":"/health"},"res":{"statusCode":200}}`                        | no match             | no match        |
| 13  | o13 redacted-upper       | clean  | `{"level":30,"body":{"email":"[REDACTED]","password":"[REDACTED]"}}`                                  | match **(wrong)**    | no match        |
| 14  | o14 passwordhash-word    | clean  | `{"level":30,"msg":"passwordHash column migrated"}`                                                   | no match             | no match        |
| 15  | o15 migration            | clean  | `All migrations have been successfully applied.`                                                      | no match             | no match        |
| 16  | o16 lowercase-words      | clean  | `begin transaction; private schema ok`                                                                | no match             | no match        |
| 17  | o17 public-key           | clean  | `-----BEGIN PUBLIC KEY-----`                                                                          | match **(wrong)**    | no match        |
| 18  | o18 eye-word             | clean  | `eyeJ test eyj lowercase`                                                                             | no match             | no match        |
| 19  | o19 401                  | clean  | `{"level":40,"msg":"Unauthorized","res":{"statusCode":401}}`                                          | no match             | no match        |
| 20  | n20 pw-space-after       | secret | `{"password": "FAKE-not-a-password"}`                                                                 | no match **(wrong)** | match           |
| 21  | n21 pw-space-before      | secret | `{"password" :"FAKE-not-a-password"}`                                                                 | no match **(wrong)** | match           |
| 22  | n22 pw-space-both        | secret | `{"password" : "FAKE-not-a-password"}`                                                                | no match **(wrong)** | match           |
| 23  | n23 pw-tab               | secret | `{"password":\t"FAKE-not-a-password"}`                                                                | no match **(wrong)** | match           |
| 24  | n24 pw-two-spaces        | secret | `{"password":  "FAKE-not-a-password"}`                                                                | no match **(wrong)** | match           |
| 25  | n25 pw-escaped-json      | secret | `{"msg":"payload {\"password\":\"FAKE-not-a-password\"}"}`                                            | no match **(wrong)** | match           |
| 26  | n26 pw-capital-key       | secret | `{"Password":"FAKE-not-a-password"}`                                                                  | no match **(wrong)** | match           |
| 27  | n27 pw-nested-key        | secret | `{"body":{"newPassword":"FAKE-not-a-password"}}`                                                      | no match **(wrong)** | match           |
| 28  | n28 pw-one-char          | secret | `{"password":"x"}`                                                                                    | match                | match           |
| 29  | n29 redacted-lower       | clean  | `{"password":"[redacted]"}`                                                                           | match **(wrong)**    | no match        |
| 30  | n30 redacted-lower-space | clean  | `{"password": "[redacted]"}`                                                                          | no match             | no match        |
| 31  | n31 redacted-upper-space | clean  | `{"password" : "[REDACTED]"}`                                                                         | no match             | no match        |
| 32  | n32 redacted-nested      | clean  | `{"req":{"body":{"identifier":"[redacted]","password":"[redacted]"}}}`                                | match **(wrong)**    | no match        |
| 33  | n33 empty-password       | clean  | `{"password":""}`                                                                                     | match **(wrong)**    | no match        |
| 34  | n34 password-null        | clean  | `{"password":null}`                                                                                   | no match             | no match        |
| 35  | n35 passwordHash-field   | clean  | `{"passwordHash":"[redacted]"}`                                                                       | no match             | no match        |
| 36  | n36 password-word-prose  | clean  | `password reset is not implemented`                                                                   | no match             | no match        |
| 37  | n37 pem-openssh          | secret | `-----BEGIN OPENSSH PRIVATE KEY-----`                                                                 | match                | match           |
| 38  | n38 pem-encrypted        | secret | `-----BEGIN ENCRYPTED PRIVATE KEY-----`                                                               | match                | match           |
| 39  | n39 pem-in-json          | secret | `{"privateKey":"-----BEGIN PRIVATE KEY-----\nMIIFAKE\n-----END PRIVATE KEY-----"}`                    | match                | match           |
| 40  | n40 pem-end-line         | secret | `-----END PRIVATE KEY-----`                                                                           | match                | match           |
| 41  | n41 pem-public-rsa       | clean  | `-----BEGIN RSA PUBLIC KEY-----`                                                                      | match **(wrong)**    | no match        |
| 42  | n42 pem-certificate      | clean  | `-----BEGIN CERTIFICATE-----`                                                                         | match **(wrong)**    | no match        |
| 43  | n43 pem-public-end       | clean  | `-----END PUBLIC KEY-----`                                                                            | no match             | no match        |
| 44  | n44 private-word         | clean  | `{"msg":"Cache-Control: private, no-store"}`                                                          | no match             | no match        |
| 45  | n45 jwt-cookie           | secret | `set-cookie: munaxa_rt=<JWT>; HttpOnly; Secure`                                                       | match                | match           |
| 46  | n46 jwt-header-only      | secret | `{"partial":"eyJhbGciOiJFUzI1NiJ9"}`                                                                  | match                | match           |
| 47  | n47 jwks-public          | clean  | `{"keys":[{"kty":"EC","crv":"P-256","kid":"test","x":"FAKEX","y":"FAKEY"}]}`                          | no match             | no match        |

## 4. Limits of CloudWatch filter syntax and of this coverage

What the revised pattern **does not** detect:

- **L-F1. A password value that begins with `[`.** `"password":"[abc"` is treated as redacted.
  Without look-ahead, CloudWatch regular expressions cannot exclude only `[redacted]`.
- **L-F2. Other key names and forms.** It does not detect `passwd`, `pwd`, `secret` or
  `PASSWORD`. Nor does it detect `password=…` (query strings or key=value logs), single-quoted
  values, or a value on the next line.
- **L-F3. A private key without its header line.** A key body such as `MIIE…`, logged on its own
  or as an unlabelled value, is not detected. Only lines that contain `PRIVATE KEY` are caught.
- **L-F4. Other secrets.** Database URLs with credentials, session cookies that are not JWTs, API
  keys and Valkey passwords are not detected. Identity's redaction list in code is the main
  control (`logger.ts:18-35`); this filter is a spot check.

Where it may still raise false alarms (a needless stop, not a leak):

- **L-F5. Any `eyJ` text.** That includes non-secret base64 JSON and the word itself, and in the
  Identity log group it fails closed. No such line was found in the code at `5277d71`.

Syntax and test limits:

- **L-F6. Case-sensitive and ASCII only.** CloudWatch regular expressions do not support
  multi-byte characters.
- **L-F7. Quotas.** A filter pattern may hold at most 2 regular expressions, and this one uses
  one. A log group may have at most 5 metric or subscription filters that use regular
  expressions. That quota does not matter here, because step 19c uses `FilterLogEvents` and
  creates no metric filter.
- **L-F8. Tested API versus session API.** The test used `TestMetricFilter`. The session uses
  `FilterLogEvents`, and AWS documents one syntax for both. If CloudWatch refuses the pattern on
  the session day, that is a stop (H-17), not a reason to fall back to the old pattern.
- **L-F9. Synthetic lines only.** No real Identity, Valkey or bootstrap log was read. Real formats
  can differ, for example the Valkey sidecar's plain-text lines or Node crash output.
- **L-F10. Counts only.** On the session day the result is a count. A non-zero count needs a
  reviewed follow-up that reports field names only, never line contents.

## 6. FilterLogEvents verification (11 Nov 2026, 09:43 to 09:46 UTC)

The owner asked for one more check: does the session-day API, `FilterLogEvents`, accept the
revised pattern, and can its result be reported as a count only? Only synthetic data was used. No
real Identity, Valkey or bootstrap log was read, and no metric or subscription filter was created.

### 6.1 First attempt: a log group that does not exist (no change made)

- Evidence: `evidence/log-filter-revision/filterlogevents-probe-missing-group.json`
- Four patterns were sent to `/munaxa/synthetic/filter-syntax-probe-does-not-exist`: the revised
  pattern, the old pattern and two deliberately broken ones.
- All four returned `ResourceNotFoundException`. AWS checks the log group before the pattern, so
  this method tests nothing about the pattern.
- A metadata-only `DescribeLogGroups` call (`describe-log-groups-metadata.json`) showed three log
  groups: `/munaxa/nonprod/identity`, `/munaxa/nonprod/identity-migrate` and `/munaxa/nonprod/ops`.
  All three had 0 bytes stored. None was queried.

### 6.2 Test on a temporary synthetic log group (owner choice, 09:44 UTC)

Evidence: `evidence/log-filter-revision/filterlogevents-synthetic-group.json`. It holds the exact
script and every request, plus each response with a timestamp.

| Time (UTC) | Step                                                                                                                                                 | Result                                                                      |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 09:44:45   | `CreateLogGroup` `/munaxa/synthetic/filter-test-20261111T094444Z`, tags Project=munaxa, Environment=nonprod, Purpose=synthetic-filter-test-temporary | ok                                                                          |
| 09:44:46   | `PutRetentionPolicy` 1 day, a safety net in case the delete failed                                                                                   | ok                                                                          |
| 09:44:46   | `CreateLogStream` `synthetic`                                                                                                                        | ok                                                                          |
| 09:44:47   | `PutLogEvents`: the 47 synthetic lines from section 3, in the same order, timestamps t0 to t0+46 ms                                                  | ok, none rejected                                                           |
| 09:45:32   | `FilterLogEvents` with `" "`. This counts lines that contain a space; it is a count only, used to check ingestion                                    | 29. Exactly 29 of the 47 lines contain a space                              |
| 09:45:36   | `FilterLogEvents` **revised pattern**                                                                                                                | **accepted; count 24**                                                      |
| 09:45:37   | `FilterLogEvents` old pattern                                                                                                                        | accepted; count 22                                                          |
| 09:45:38   | `FilterLogEvents` `%(eyJ)%` (deliberately broken)                                                                                                    | **refused**: `InvalidParameterException: Invalid character(s) in term '%('` |
| 09:45:39   | `DeleteLogGroup`                                                                                                                                     | ok                                                                          |
| 09:45:39   | `DescribeLogGroups` prefix `/munaxa/synthetic/`                                                                                                      | **0 remaining**                                                             |

Results:

- **FilterLogEvents accepts the exact revised pattern.** It is the same string as in checklist
  step 19c. A pattern that breaks the documented rules is refused with
  `InvalidParameterException`, so on the session day a syntax problem shows up as an error. Under
  H-17 that error is a stop; it is never a silent 0.
- **Matching is the same as `TestMetricFilter`.**
  - Revised: lines 1 to 9, 20 to 28, 37 to 40, 45 and 46. That is the 24 synthetic secrets
    exactly, and no clean line.
  - Old: lines 1 to 7, 9, 13, 17, 28, 29, 32, 33, 37 to 42, 45 and 46. That is the same set
    `TestMetricFilter` gave for the old pattern.
- **Count only.** The script returned only counts, and line numbers worked out from each event's
  timestamp. It never returned the message text. The session-day equivalent is the checklist's
  `--query 'length(events)'`. No `nextToken` was present in any response.
- **Nothing persists.** The group was deleted, and the follow-up listing shows none left. Tagging
  and the 1-day retention were safeguards only.

Limits of this verification:

- **L-FV1. Ingestion of some clean lines is not directly proven.** Every line that appears in at
  least one match set, plus the 29-line space count, shows those lines were searched. Six clean
  lines have no space and matched nothing, so nothing directly shows they were searched: 10, 12,
  19, 34, 35 and 47. `PutLogEvents` rejected no event, and the batch was accepted as a whole.
- **L-FV2. Small result.** The session-day window is up to 3 hours. `FilterLogEvents` returns at
  most 10,000 events or 1 MB per page. A non-zero count is already a stop, so a large result
  only adds to an existing stop, as long as the CLI is left to page (no `--max-items`).
- **L-FV3. One region, one API.** The test ran in `eu-central-1` with `FilterLogEvents`. It did
  not cover Logs Insights, Live Tail or the console.
- L-F1 to L-F10 (section 4) still apply unchanged.

## 5. Files

| File                                                                    | Content                                                              |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `evidence/log-filter-revision/a4-original-19-lines.json`                | Phase 1 evidence from PR #88, byte-for-byte                          |
| `evidence/log-filter-revision/a4-revised-47-lines.json`                 | The exact script, both patterns, all 47 inputs and both results      |
| `evidence/log-filter-revision/filterlogevents-probe-missing-group.json` | FilterLogEvents on a missing group: no syntax check (6.1)            |
| `evidence/log-filter-revision/describe-log-groups-metadata.json`        | Log group names and sizes only (6.1)                                 |
| `evidence/log-filter-revision/filterlogevents-synthetic-group.json`     | Temporary synthetic group: create, put, filter, delete, verify (6.2) |
