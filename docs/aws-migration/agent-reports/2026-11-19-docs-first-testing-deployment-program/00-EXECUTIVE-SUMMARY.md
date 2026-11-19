# 00. Executive summary: first complete Testing deployment (Docs first) and production readiness

- **Requested by:** Tamer, 19 Nov 2026 21:50 UTC ("First Complete Testing Deployment and Production Readiness Program").
- **Written:** 19 to 20 Nov 2026 (UTC). All times are UTC; Amman is UTC+3.
- **Scope:** repository work and read-only AWS checks only. **Nothing was deployed.** There was no Terraform apply or plan against the live backend, and no AWS write of any kind. No secret value was read. No workflow was dispatched, no PR was merged, and Stage E was not started (file 11 §4 lists everything that was not done).
- **Baselines (main):** platform `0f06836`, identity `2db6ed9`, control `1f58c90`, docs `9d06698`, school `4c2b4a4`, work `eabcc47`, corporate site `9a48a95`.
- **Status labels:** VERIFIED COMPLETE, CODE COMPLETE — NOT DEPLOYED, READY FOR OWNER APPROVAL, BLOCKED, NOT STARTED. Evidence tags: **[V]** verified in code or by a live read, **[D]** taken from an earlier report, **[E]** an estimate.

## 1. The answer in one paragraph

Docs can be the first complete Testing deployment, but it is not the first thing that can run. In Testing and in production, Docs runs with `NODE_ENV=production` and `LICENSING_MODE=CONTROL_PLANE`. It refuses to start without a licence source, a real mail provider key and its secrets. Its licence comes from Control, and the Docs credential that Control issues can only be minted by an operator signed in through Identity, behind Cloudflare Access. So the safe order is the one already intended:

1. Identity Stage E.
2. Control bring-up.
3. Docs.

Two things change from the intended plan. Docs preparation can run in parallel with Identity, and Docs and Control configuration can share applies.

Today:

- The AWS Testing foundation and its safeguards are verified complete.
- Identity's first session (Stage E) is ready for the owner's approval.
- Control and Docs are code complete but not deployed. Each is blocked on owner-controlled steps.
- No current Docs image exists in ECR. Its `migrate` repository was never created, and its three secret bundles are empty.

This task closed the Docs secret-custody gap with a reviewed owner script (platform PR, file 04 §6). It also fixed a Docs runbook statement that contradicted the code (docs#178).

## 2. Status by product

| Product / layer | Status | Evidence |
| --- | --- | --- |
| AWS Testing foundation and safeguards (H-20 gate, daily cleanup R, backstop, alarms, budget alerts) | **VERIFIED COMPLETE** | Live 19 Nov 22:0x: R `1a6aff64` SUCCEEDED 21:05:22, alarms OK, 12 schedules enabled, nothing running; #141/#142 [V] |
| RDS master secret rotation | **NOT YET DUE**, so no claim is made | Due 20 Nov 23:59:59 UTC; pre-rotation checks by the rotation thread at 21:46 (file 06 §2) |
| Identity | **CODE COMPLETE — NOT DEPLOYED.** Stage D applied (task definitions with image `2db6ed9`, MFA key ring). **Stage E: READY FOR OWNER APPROVAL** | File 02 |
| Control | **CODE COMPLETE — NOT DEPLOYED.** Images published (`a24c568`, the same code as main). **BLOCKED** on Cloudflare Access (owner), Identity Stage E and the two-step bring-up | File 03 |
| Docs | **CODE COMPLETE — NOT DEPLOYED. BLOCKED:** no image at a current commit (ECR holds only `f8a8bea`, 25 Oct, before licensing and before DC-01), no `munaxa-docs/migrate` repository, empty bundles, a Resend decision, and Control | File 04 |
| Work | **CODE COMPLETE — NOT DEPLOYED.** Images are stale (`b490b25`, before work#30/#31). Product gaps remain (read-only admin, no storage or notifications) | File 05 |
| School | **NOT STARTED** on AWS: no image was ever published to ECR; own sign-in; SC-04 to SC-07 open | File 05 |
| Production (any product) | **NOT STARTED** (infrastructure blockers AW-02, AW-06, AW-07, AW-09, AW-10, DC-02 to DC-04) | Files 07, 08 |

## 3. What this task completed

| Item | Where | State |
| --- | --- | --- |
| Live read-only inventory of Testing (ECR, ECS, RDS, ALB, secrets metadata, schedules, alarms, budgets, Cost Explorer, KMS, snapshots) | file 06 | done, 19 Nov 21:51-22:30 |
| Offline Terraform: stack tests **75/75 pass**; a mocked plan of enabling Docs in Testing gives **42 creates, 0 changes, 0 destroys** with services off, and 62 creates as a session | file 06 §5, `supporting/` | done |
| **Docs secret custody script** `scripts/aws/owner/docs-testing-secrets.sh`: fills the three empty Docs bundles inside AWS, replaces the Control token or the Resend key later, and creates and deletes the one-run provision secret. **18 offline tests**, plus 1 new SQL test (23/23), CI and shellcheck. An independent review is recorded in file 07 §4 | munaxa-platform PR (branch `claude/project-thread-r335u7-docs-secrets`) | open, unmerged |
| Docs runbook correction: the S3 adapter **does** sign with the ECS task role (the runbook said it could not) | [munaxa-docs#178](https://github.com/munaxa/munaxa-docs/pull/178) | open, unmerged |
| Stage E authorization package (consolidated from the 14 to 19 Nov reports, with the prerequisites re-verified) | file 02 §5, file 10 | ready |
| Dependency map, Docs Testing deployment design, acceptance checklist, cost model, production path | files 04, 08, 09 | done |

## 4. Answers to the twelve decision questions

1. **Genuinely ready today:**
   - the Testing foundation and safeguards (VERIFIED COMPLETE);
   - Identity's Stage E package (READY FOR OWNER APPROVAL);
   - Control's published images;
   - the Docs infrastructure code (42 creates, mocked);
   - the Docs secret custody procedure (PR, unmerged).
2. **Incomplete:**
   - no product runs in AWS;
   - Docs has no current image and no `migrate` repository;
   - the Docs bundles are empty;
   - there is no Resend key;
   - Cloudflare Access for the operator host does not exist;
   - Work's images are stale;
   - School has never been published;
   - every production blocker in file 11.
3. **Completed in this task:** see §3.
4. **Blocked by owner authorization:** see file 10. In order:
   - Stage E;
   - the Docs bootstrap apply;
   - the Docs image tag;
   - the Resend decision;
   - the Cloudflare Access application;
   - the Control and Docs configuration applies;
   - the sessions;
   - the secret fills.
5. **RDS rotation:** **not yet due** (20 Nov 23:59:59 UTC). Pre-rotation metadata checks are done. Post-rotation verification is scheduled by the rotation thread for about 00:30 UTC on 21 Nov. Nothing is claimed.
6. **Identity ready for Testing activation?** **Yes, for owner approval.** Every Stage E prerequisite (G-1 to G-7, H-20 IAM) is applied and verified. The session needs the owner's explicit yes and a gate pass at the time it starts (file 02).
7. **Control ready?** **Code and images yes; deployment no.** It needs the Cloudflare Access application (owner), a running Identity with an operator account (Stage E), two configuration applies and one session (file 03).
8. **Docs ready for its first Testing deployment?** **No.** The repository and infrastructure code are ready. Missing are:
   - the Docs bootstrap apply (`migrate` repository);
   - an image release;
   - the secret fill;
   - a Resend decision;
   - Control's credential (file 04 §3).
9. **Exact next owner action:** approve Stage E for a session window of your choice, after the rotation check on 21 Nov (file 10, A-1). In parallel and independent of it, merge the two PRs from this task after their review, then approve the Docs bootstrap plan (A-3).
10. **First working Docs Testing deployment:**
    - **Sequence:** file 08, steps 1 to 4: about 8 owner approvals and 3 Testing sessions.
    - **Duration:** at least 3 to 5 working days, mostly owner availability [E].
    - **Cost:** about **US$5 to 10** of session time on top of the about US$12 a month idle baseline [E]. The account's US$50 Testing budget holds.
11. **First customer-facing production launch (Docs first):**
    - **Sequence:** file 08, steps 6 and 7. It needs production infrastructure work that has not started (separate account decision AW-02, AW-06/07/09/10, DC-02/03/04, a production Identity cache, Cloudflare Access and DNS for production, Resend).
    - **Duration:** about 3 to 6 weeks of engineering plus owner gates [E].
    - **Cost:** about **US$120 to 160 a month** for a Docs-first production (Docs, Control, Identity), and about **US$170 to 230 a month** with all products always on (file 09) [E].

No overall completion percentage is given (owner instruction).

## 5. Files

| File | Content |
| --- | --- |
| 01 | Current ecosystem status: every repository, open PR, CI run, image and digest |
| 02 | Identity readiness and the Stage E authorization package |
| 03 | Control and licensing readiness, the bring-up sequence |
| 04 | Docs Testing deployment: dependency chain, design, secrets, sequence, acceptance checklist |
| 05 | School and Work readiness |
| 06 | AWS infrastructure readiness (live read-only checks, offline Terraform, the RDS rotation) |
| 07 | Security and operations, including the independent review of this task's script |
| 08 | Dependency and execution plan (steps, approvals, verification, rollback, duration, cost) |
| 09 | Cost estimate |
| 10 | Owner authorization package (yes/no items, in order) |
| 11 | Risks, remaining blockers, and what was not done |
| supporting/ | Mocked plan addresses and the test harness that produced them |
