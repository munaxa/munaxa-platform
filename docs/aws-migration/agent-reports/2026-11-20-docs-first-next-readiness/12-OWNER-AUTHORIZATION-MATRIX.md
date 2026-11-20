# 12. Owner authorization matrix

Reassessed from the 19 Nov package (A-1 to A-10).
- **Removed as obsolete:** none.
- **Changed:** A-2, A-5, A-8.
- **Added with evidence:** A-4C, A-5C, A-R.

Nothing below is authorized until the owner says yes to that item. A merge is not deployment authorization.

| Id | Status | Prerequisite | Action | Owner authorization needed | Cost [E] | Blocks | Order |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A-R | NEEDS VERIFICATION (automatic) | DB auto-start 21:07 UTC 20 Nov | rotation thread checks about 00:30 UTC 21 Nov; if it failed, remediation plan in file 03 §5 | only if remediation is needed | 0 | A-1 | 1 |
| **A-1** | READY FOR OWNER APPROVAL | A-R passes; no C-2 merged before it | Identity Stage E (file 05 checklist) | **yes**, plus a window (Amman time) | under US$0.30 | A-8 (operator ids for C-2) | 2 |
| A-2 | READY FOR OWNER APPROVAL | CI green | merge platform #141, #142, #143, #144, this report's PR; docs#178, **docs#179**; **control#11** (replaces control#10) | yes (merges) | 0 | A-3 to A-5C | 2 (parallel) |
| A-3 | READY FOR OWNER APPROVAL after A-2 | A-2 | Docs bootstrap plan (expected +1 ECR repository, +1 lifecycle policy, publisher policy update), then apply | yes, after seeing the plan | about US$0 | A-5 | 3 |
| A-4 | READY FOR OWNER APPROVAL after A-2 | A-2 | owner runs `docs-testing-secrets.sh bundles` in CloudShell (one tab), types FILL, pastes the Resend key or presses Enter, sends back only the SEND CLAUDE lines | yes (runs it) | 0 | D-1 | 3 |
| **A-4C** (new) | READY FOR OWNER APPROVAL after A-2 | A-2 | owner runs `control-testing-secrets.sh bundles`, types FILL, sends back the two version ids | yes (runs it) | 0 | C-2 | 3 |
| A-5 | READY FOR OWNER APPROVAL after A-3 | A-3, docs#179 merged | release Docs images from main (tag `image/<sha>`) | yes | 0 | D-1 | 4 |
| **A-5C** (new) | READY FOR OWNER APPROVAL after A-2 | control#11 merged | release Control images from main (clears SF-1) | yes | 0 | C-1 | 4 |
| A-6 | owner decision | none | Resend: verify `notify.munaxa.com` now, or start with the placeholder (mail does not send) | decision | 0 | none (mail only) | any |
| A-7 | READY FOR OWNER APPROVAL after A-5C | A-5C (C-1 does not touch db-admin, so it does not depend on Stage E) | create the Cloudflare Access app for `operator-test.munaxa.com`; C-1 config PR and apply (33 creates) | yes (Cloudflare, owner) and yes (apply) | US$1 a month (KMS key) | C-2 | 5 |
| A-8 | READY FOR OWNER APPROVAL after A-1, A-7, A-4, A-4C, A-5 | those (A-1 first: ordering rule 1 in file 13) | C-2 + D-1 config PR and apply (3 replacements + 42 creates, services off) | yes, after seeing the plan | 0 | A-9 | 6 |
| A-9 | BLOCKED | A-8 | Control and Docs session; owner signs in to the portal (operator password in the console secret, as root) and mints the Docs credential | yes; sign in; mint | about US$0.22 an hour | A-10 | 7 |
| A-10 | BLOCKED | A-9 | `docs-testing-secrets.sh replace-key CONTROL_PLANE_TOKEN`; pin PR and apply; licensed Docs session | yes (runs it; apply) | about US$0.22 an hour | first licensed Docs | 8 |
| D-N1 | owner decision (carried) | none | raise the account budget limit from US$10, or accept the alert noise | decision | 0 | nothing | any |

**Next owner action: A-1**, after A-R. A-2 can be done at any time.
