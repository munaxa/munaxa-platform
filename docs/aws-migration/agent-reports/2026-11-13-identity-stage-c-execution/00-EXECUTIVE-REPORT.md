# 00. Executive report: Identity Testing stage C, execution

**Status (13 Nov 2026, 19:40:16 UTC): STAGE C DONE AND VERIFIED. Stage D is not started and needs a separate owner approval.**

- Route **M-1**: the owner ran the reviewed revision 2 CloudShell script (`2026-11-13-identity-stage-c-cli/`, SHA-256 `e857c0447b8dc23b87a0b62b0472f53bac08eaf50f1022d0152e1bcd44508c70`). Route M-3 (Claude through the AWS connector) was tried first and stopped at its safety gate (01 §1).
- One new version of `munaxa-nonprod/identity`: **`80914756-68cd-420d-8094-0fd49afe3492`**, now `AWSCURRENT`. `ad02f18e-f3e7-41da-9959-f9b41e0b7e1a` is `AWSPREVIOUS`. Key id `mfa-nonprod-2026-11`.
- The MFA key was generated and handled only inside the owner's CloudShell. Claude never read a secret value. Every check in this report used metadata or CloudTrail only.
- PR #121 (P-5) now pins the new version (`268eebe`). It stays a **draft and is not merged**.

Legend: **[V]** verified by Claude (read-only AWS metadata, CloudTrail or a local test), **[O]** reported by the owner, **[U]** not verifiable.

## Results

| # | Item | Result |
| --- | --- | --- |
| 1 | Isolated execution path | M-1 CloudShell, script hash checked by `sha256sum -c` [O]; CloudTrail shows the calls came from CloudShell as root [V] (03) |
| 2 | Stage C | succeeded: the owner's output was `CREATED VERIFIED` and two lines were sent [O]; exactly one `PutSecretValue` [V] |
| 3 | New version id | `80914756-68cd-420d-8094-0fd49afe3492`, created 19:40:16.025 UTC [V] (02) |
| 4 | Labels | new = `AWSCURRENT`, `ad02f18e…` = `AWSPREVIOUS`, exactly two versions, no `AWSPENDING` [V] (02) |
| 5 | Exposure | no value in the thread, this report, PR #121 or any log Claude produced; `PutSecretValue` CloudTrail events never record the value (05) |
| 6 | CloudTrail | the expected sequence only: preflight reads, one read of `ad02f18e`, one write without `VersionStages`, one read-back; no error; no other write in the account in the window besides CloudShell session events [V] (03) |
| 7 | P-5 / PR #121 | one-line pin change committed; fmt, validate, `terraform test` 67/67, `check-plan-intent.sh --validate` (6 changes) and a mocked render pass; draft, not merged (04) |
| 8 | Remaining blockers | Stage D approval (merge #121, real plan and apply, first session); S-1, S-2, S-3 and the budget carried forward (05) |

## The next owner decision [O]

Stage D, when you are ready: merge PR #121 and run the owner-approved Testing plan and apply. It is a separate yes/no and nothing has been started.

## Files

| File | Contents |
| --- | --- |
| 01 | the M-3 safety gate, the M-1 run and its timeline |
| 01a | the M-3 safety gate note as written at 18:15 (unchanged) |
| 02 | secret version metadata |
| 03 | CloudTrail verification |
| 04 | P-5 status and offline checks |
| 05 | security and scope review |
