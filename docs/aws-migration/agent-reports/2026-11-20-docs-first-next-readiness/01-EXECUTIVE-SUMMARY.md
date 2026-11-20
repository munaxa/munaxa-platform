# 01. Executive summary

**Task:** continue AWS Testing readiness and Docs-first deployment preparation (owner request, 20 Nov 2026 09:09 UTC).
**Scope:** repository work, offline tests, and read-only AWS metadata. No AWS write, no merge, no deployment, no secret read, no Terraform plan against the live backend.

Evidence tags: **[V]** verified live today (read-only AWS or GitHub), **[T]** test or offline run in this task, **[D]** an earlier report, **[E]** an estimate.

## Overall status

| Area | Status |
| --- | --- |
| Testing foundation (VPC, RDS, KMS, cleanup, backstop, H-20) | VERIFIED COMPLETE (idle, nothing running) [V] |
| RDS master secret rotation | **NEEDS VERIFICATION**: not permanently failed. AWS has retried it hourly since 05:08 UTC and every attempt fails while the DB is stopped. It is expected to succeed after the DB auto-starts at 21:07 UTC today. The rotation thread checks it at about 00:30 UTC on 21 Nov (file 03) [V] |
| Identity Stage E | READY FOR OWNER APPROVAL (A-1). Not executed [V/D] |
| Control C-1 / C-2 | READY FOR OWNER APPROVAL once its prerequisites are met. Packages and offline plans are in file 06 [T] |
| Docs | CODE COMPLETE — NOT DEPLOYED. BLOCKED on owner steps A-3 to A-6 and on Control (file 07) |
| Work | CODE COMPLETE — NOT DEPLOYED. Images are stale and carry one CRITICAL CVE (file 08) [V] |
| School | NOT STARTED on AWS (file 08) |

## What changed in this task

1. **PR #143 (owner secret script) hardened.**
   - One run at a time is enforced with a lock.
   - `provision-delete` refuses any secret the script did not create (Purpose tag).
   - Five new tests: stored-then-CLI-error resume, AWSPREVIOUS movement, lock contention, no container token under `bash -x`, and the tag check.
2. **New: Control secret custody script** `control-testing-secrets.sh` (same PR, 8 tests). It closes a gap found today: the two Control bundles were empty and had no custody procedure.
3. **docs#179:** pins the Docs Node base image by digest, and adds an `effect` override because a high advisory published today breaks `pnpm audit` on Docs main.
4. **control#10:** refreshes the Control base image digest and applies OS security upgrades, because the published Control images carry **7 HIGH CVEs** [V ECR scan]. It also adds the same `effect` override.
5. **Offline mocked plans for Control** [T]:
   - C-1: **33 creates**.
   - C-2: **3 changes** (task definitions: db-admin, control-api, control-migrate).
   - Control session: **19 creates**.
   - The guard that refuses a Control session without the licence key was confirmed.
6. **Identity Stage E owner-approval checklist** (file 05): preflight, expected resources, validation, rollback, cleanup and cost.
7. **New owner items, each with evidence:**
   - A-4C: fill the Control bundles.
   - A-5C: release new Control images.
   - Ordering rule: Stage E runs before C-2, or the Stage E manifest is updated in the C-2 PR.

## Current blockers to the first licensed Docs in Testing

1. RDS rotation check (21 Nov, automatic).
2. A-1 Stage E.
3. Merges (A-2).
4. Docs bootstrap (A-3).
5. Docs and Control bundle fills (A-4, A-4C).
6. Docs and Control image releases (A-5, A-5C).
7. Resend decision (A-6).
8. Cloudflare Access application (A-7).
9. C-2 + D-1 apply (A-8).
10. Session and credential (A-9, A-10).

## Costs

- November to date: **US$12.46** (Cost Explorer).
- Idle run rate: **US$0.35 to 0.43 a day, about US$11 to 13 a month** [V].
- Expected Testing spend with about 40 session hours: **US$18 to 25 a month**, inside the US$50 target (file 11).

## Next owner action

**A-1:** approve Identity Stage E for a window of your choice **after** the rotation check at about 00:30 UTC on 21 Nov (03:30 Amman) reports success. A-2 (merges) can be done in parallel.
