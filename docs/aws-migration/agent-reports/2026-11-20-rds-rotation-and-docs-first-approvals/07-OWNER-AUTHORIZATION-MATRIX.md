# 07. Owner authorization matrix

Nothing below is authorized until the owner says yes to that item. A merge is not deployment authorization. Changes from PR #145 file 12 are in **bold**.

| Id | Status | Prerequisite | Action | Owner authorization | Cost [E] | Order |
| --- | --- | --- | --- | --- | --- | --- |
| A-R | NEEDS VERIFICATION (pending 00:30 UTC 21 Nov) | DB auto-start 21:07 UTC | read-only check, file 03 §5 | none (read-only); remediation in file 03 §6 needs a yes | 0 | 1 |
| **A-1** | **BLOCKED** until A-R passes, then READY FOR OWNER APPROVAL | A-R; P-1 to **P-10** (file 05) | Identity Stage E | **yes, with a window between 13:00 and 18:30 Amman, after that morning's scheduled down** | about US$0.20 to 0.30 | 2 |
| A-2 | READY FOR OWNER APPROVAL | CI green on each | merge platform #141, #142, #143, #144, #145, **this report's PR**; docs#178, docs#179; **control#11 (close #10)** once its image job is green; **identity#21, work#33, school#26** once green | yes (merges) | 0 | any |
| **A-2G** | **NEW, owner action** | none | fix GitHub Packages read for munaxa-control CI: the image job got **401 on `@munaxa/auth` 2.4.1** (file 02). Check that `PLATFORM_PACKAGES_TOKEN` in munaxa-control is valid, or grant munaxa-control read on the `@munaxa/*` packages; then re-run control#11 CI | yes (GitHub settings) | 0 | before A-5C |
| A-3 | READY FOR OWNER APPROVAL after A-2 | A-2 | Docs bootstrap plan, then apply | yes, after seeing the plan | 0 | 3 |
| A-4 | READY FOR OWNER APPROVAL after A-2 | #143 merged | `docs-testing-secrets.sh bundles` in CloudShell | yes (owner runs it) | 0 | 3 |
| A-4C | READY FOR OWNER APPROVAL after A-2 | #143 merged | `control-testing-secrets.sh bundles` in CloudShell | yes (owner runs it) | 0 | 3 |
| A-5 | READY FOR OWNER APPROVAL after A-3 and **D-G1** | A-3, docs#179 | Docs release from main | yes | 0 | 4 |
| **D-G1** | **NEW decision** | none | accept **1 HIGH (glibc CVE-2026-84243)** expected on Docs api, web, migrate **for Testing only** until Debian ships a fix (recommended), or hold A-5 | decision | 0 | before A-5 |
| A-5C | READY FOR OWNER APPROVAL after A-2 and **A-2G** | **control#11** merged and its CI green | Control release from main; success only if the ECR scan shows 0 HIGH / 0 CRITICAL | yes | 0 | 4 |
| A-6 | owner decision | none | Resend: verify `notify.munaxa.com`, or start with the placeholder | decision | 0 | any |
| A-7 | READY FOR OWNER APPROVAL after A-5C | A-5C scan clean | Cloudflare Access app for `operator-test.munaxa.com`; C-1 config PR and apply (33 creates) | yes (Cloudflare) and yes (apply) | US$1 a month | 5 |
| A-8 | BLOCKED | A-1, A-4, A-4C, A-5, A-7 | C-2 + D-1 config PR and apply (services off) | yes, after seeing the plan | 0 | 6 |
| A-9 | BLOCKED | A-8 | Control and Docs session; owner signs in and mints the Docs credential | yes; sign in; mint | about US$0.22 an hour | 7 |
| A-10 | BLOCKED | A-9 | `replace-key CONTROL_PLANE_TOKEN`; pin apply; licensed Docs session | yes | about US$0.22 an hour | 8 |
| D-N1 | owner decision (carried) | none | account budget limit US$10 (spend 12.62) | decision | 0 | any |

## Next owner decision

After the 03:30 Amman check passes: **"Approve Identity Stage E on 21 Nov 2026, starting between 13:00 and 18:30 Amman, after that morning's scheduled down has finished?" Yes / No.**

Everything else in this matrix can wait until after Stage E.
