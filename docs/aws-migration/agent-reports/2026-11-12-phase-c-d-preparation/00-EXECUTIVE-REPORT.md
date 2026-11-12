# 00. Phase C and D preparation: executive report (12 Nov 2026)

Tags: **[V]** verified fact, **[L]** local test result, **[E]** estimate, **[R]** recommendation,
**[U]** unverified assumption, **[O]** owner authorization required.

## Verdict

**Repository preparation is complete. Nothing operational has happened.**

- Identity works on the Platform 2.5.0 candidate, with no regressions and one intended tightening.
- The adoption PR (identity#18) is a **draft and stays one** until the owner authorizes publication of 2.5.0.
- The Testing deployment runbook, the nonprod plan expectations and the ECS deployment analysis are ready.
- Two production decisions are prepared for the owner, each with a recommendation where the brief asked for one.

**No AWS call, Terraform against a backend, apply, secret access, IAM change, workflow dispatch,
package publication, tag, release, image build, deploy, migration, DNS, Cloudflare or GitHub setting
change was made.**

## Results

| Area | Result | File |
| --- | --- | --- |
| C1 compatibility | Identity uses 12 of the 13 lockstep packages. 2.5.0 changes only auth, cache and security; the other 10 packages' `dist` is byte-identical to 2.4.1 **[L]** | 01 |
| C2 local candidate | 13 packages packed from Platform main `47ffd08`, served by a local read-only registry. Content digests are reproducible; tarball bytes are not, because of pnpm key order **[L]** | 01, supporting |
| C3 draft PR | [identity#18](https://github.com/munaxa/munaxa-identity/pull/18) at `098df24`: `^2.5.0`, 12 lockfile entries, one new test, comments. `@munaxa/licensing` untouched. CI fails at Install by design | 01, 10 |
| C4 regression | Baseline 2.4.1 (main `25823b1`): config 59/59, integration 291/291. Candidate 2.5.0: 59/59, **292/292**. Real PostgreSQL 16 and Redis, nothing skipped. On 2.4.1, **5 of 6** self-signed tokens with a bad `exp`, `iat` or `aud` were accepted; on 2.5.0 all are refused **[L]** | 02 |
| D1 Terraform | All #110 requirements traced to tests. Module 17/17, stack 67/67, bootstrap 12/12. Found and fixed: the AUTH token class could pass the plan and fail at the production apply | 05 |
| D2 ECS 0/100 | AWS docs do **not** promise that the old task stops first, so two tasks may exist briefly. What holds: the ALB never sends new requests to two stores at once, provided it is the only way in. That is now **enforced** (platform#114). Outage **[E]** 1 to 2 minutes per deployment; state reset accepted (ADR-0002) | 04 |
| D3 runbook | 17 sections, stages A to E, each owner approval named. The decisive observation: is T2 `createdAt` earlier than T1 `stoppedAt`? | 03 |
| D4 nonprod plan | At rest: **+1 create, ~1 update, 0 destroy** (the pending docs-migrate delta). Nothing from #110 or #114; Identity task definitions byte-identical **[L]**. At most one extra `sts:AssumeRole` from the ephemeral alias; no `GetSecretValue` **[E]** | 05 |
| Production IAM | **[R] Option B** (an operator sets the token; Terraform never reads it). If automation is wanted, A' (a token-only secret). **Never A**: the bundle holds the access-token signing key | 06 |
| Production availability | One node (about USD 13/month **[E]**) or two in two zones (about USD 26 **[E]**). Not decided for the owner | 07 |
| Work and Control | Use only `TokenService` and crypto. No change and no PR now; upgrade after publication | 08 |
| Reviews | Three independent rounds. Every Critical, High and Medium finding is fixed: 1 Medium in round 1, 3 in round 2 and 2 in round 3 (all five in the runbook after round 1) | 09 |

## Owner decisions (yes or no)

1. **Publish Platform 2.5.0?** This is the next step, and it is irreversible. It unlocks identity#18 (11).
2. **Production cache token: B (recommended) or A'?** Needed only before production (06).
3. **Production cache: one node or two?** Needed only before production (07).

Later, each as a separate yes, in the order of runbook 03 §2: the Identity image build (B), the read-only pre-checks (R), the MFA key bundle version (C), the nonprod at-rest apply that includes the image pin (D), and the Testing session (E).

## Repository changes

- munaxa-platform#114 (see 10 for state): `single_task_store` refuses discovery, private callers and
  extra security groups; 0/100 wording corrected everywhere; AUTH token class `[A-Za-z0-9-]{32,128}`.
- munaxa-identity#18: draft (above).
- This report folder.
