# 09. Independent security review (three rounds)

Tags: **[V]** verified fact, **[L]** local test result, **[E]** estimate, **[R]** recommendation,
**[U]** unverified assumption, **[O]** owner authorization required.

Each round was run by a separate reviewer with no part in writing the code. Every reviewer was told:
- no AWS calls, no backend, no publish, no push, no GitHub comments;
- worktrees only.

I did not approve my own work.

## Round 1: code (identity#18 at `098df24`, platform#114 at `3773c25` and `a36d0f6`)

**Verdicts:** identity#18 REQUEST CHANGES (one Medium); platform#114 APPROVE.

What the reviewer ran **[L]**:
- recomputed the sha512 of all 12 served tarballs: they match the lockfile;
- a full CI reproduction: integration 292/292, nothing skipped;
- a **mutation test** of the new token test: each 2.5.0 check (exp, iat, aud) was reverted on its own in the compiled `@munaxa/auth`. The test fails for each one;
- an `addressSubject` fuzz with 200,013 inputs: idempotent, and the two functions agree;
- Terraform module 16/16 and stack 67/67.

| ID | Sev | Finding | Resolution |
| --- | --- | --- | --- |
| A1 | **Medium** | The post-publication step "`pnpm install --lockfile-only`" keeps the 12 `127.0.0.1:4874` URLs (reproduced). CI would keep failing, or a lockfile pointing at localhost could be merged | **Fixed.** A new procedure (drop the 12 entries, `--fix-lockfile`, prettier, zero-`127.0.0.1` check) was tested against a second local registry **[L]**. It is in 01, the PR body and `supporting/tools/drop-munaxa-resolutions.mjs`. `pnpm update --lockfile-only` was also tried and does not work **[L]** |
| A2 | Low | Nothing ties the published bytes to the reviewed bytes | **Fixed.** Candidate sha512 values are in `supporting/identity-18-lockfile-candidate-sha512.txt`. The content-digest comparison is a stop condition (01, step 3) |
| A3 | Info | A localhost lockfile in a draft is safe: sha512 is pinned, and the registry token is scoped per host | none |
| A4 | Info | IPv6 /64 for the general rules is the one real behaviour change; it is documented | none |
| A5 | Info | `increment` is now `EVAL`. READONLY is still detected on Redis 7 and Valkey; the AUTH-token default user may run `EVAL`. If ACL users ever replace the token, they need `+@scripting` | recorded here; Phase E checks `EVAL` on ElastiCache **[U]** |
| A6 | Info | The `isEnrolled` guard may now refuse first in one mfa-store test, so that test no longer exercises the adapter guard alone | recorded; optional store-level test later |
| A7 | Info | The new `degraded` reporting cannot reach Identity's credential routes | none |
| B1 | Low | `single_task_store` did not see `extra_security_group_ids` | **Fixed** in `6ab747d`: now refused, with a third test (module 17/17) |
| B2 | Low | Phase A reports still gave the old token class | **Fixed** in `6ab747d` |
| B3, B4, B5 | Info | 0/100 reasoning properly hedged; new tests not vacuous; token class accepted by both ElastiCache pages | none |

## Round 2: the fixes, the reports and the runbook (platform#114 at `6ab747d`, report drafts 01 to 08 and 11)

**Verdicts:** platform#114 APPROVE. identity#18 APPROVE as a draft, still do not merge. Reports: all APPROVE, except runbook 03, which was REQUEST CHANGES and is now fixed.

What the reviewer ran **[L]**:
- Terraform 17/17 and 67/67 at `6ab747d`;
- the A1 procedure on its own registry on port 4876: 12 URLs moved, only `tarball:` lines changed, and frozen install succeeded;
- a grep of the reports and `supporting/` for emails, keys and tokens. Only placeholders, public hashes and the CI's throwaway Postgres passwords were found;
- a check of 06's facts against `CONTRACT.md`, `data.tf` and `bootstrap/iam.tf`. The bundle does hold `IDENTITY_SIGNING_PRIVATE_KEY`.

| ID | Sev | Finding | Resolution |
| --- | --- | --- | --- |
| R1 | **Medium** | Runbook §13 relied on `asm-exec` for the operator password. An earlier report found it not available, there was no fallback, and the old §6 helper prompts a person | **Fixed.** The route is now **[U]**, to be checked before stage E. Fallbacks: the owner types once at a hidden prompt (named in the approval), or the operator sign-in is skipped. The §6 reference was removed |
| R2 | **Medium** | MFA and recovery checks would enroll the persistent operator account. The seed and codes would enter context, the custody was undefined, and no factor-removal task exists (AW-16) | **Fixed.** These checks now run only on a throwaway account. Its secrets stay inside one process and only status codes are recorded. The helper is a repository task before stage E **[R]** |
| R3 | **Medium** | The per-session `id.test` DNS update was missing | **Fixed.** Added after session up as **[O]** (owner, Cloudflare), with a `getent` check. It is also in stage E and in `down` |
| R4 | Low | Mutating steps lacked **[O]** | **Fixed** |
| R5 | Low | Future AWS reads were tagged **[V]** | **Fixed**: retagged as checks not yet run |
| R6 | Low | The IPv6 /64 check cannot run on the Testing ALB (no IPv6) | **Fixed**: marked as not checkable there, covered locally |
| P2 | Low | The `098df24` commit message still names the wrong procedure | Recorded. Correct it in the post-publication lockfile commit's message (01). History is not rewritten |
| P3 | Low | 02 said Work reaches Identity through NAT. Tasks use their own public IPv4 | **Fixed** |
| P4 | Info | 07 said `cache.t4g.micro` is a default; it is a required input | **Fixed** |
| P5 | Info | The README did not list extra groups among the refusals | **Fixed** in `9acc6ae` |

## Round 3: final heads

A fresh reviewer looked at platform#114 at `9acc6ae`, identity#18 at `098df24` and the whole report folder.

**Verdicts:** platform#114 APPROVE. identity#18 APPROVE as a draft; do not merge. Report folder: REQUEST CHANGES (2 Medium), now fixed.

What the reviewer ran **[L]**:
- Terraform tests: module 17, stack 67, bootstrap 12. `fmt` clean.
- **Mutations:** each new validation clause removed on its own fails exactly its own test, and the old token regex fails its test.
- **Callers:** the new validation never fires on real inputs. The extra group exists only with `identity_cache`, which is production only and exclusive with the sidecar.
- **Tarballs:** all 12 match the lockfile and the recorded sha512. None has install scripts or non-`@munaxa` dependencies.
- **CI reproduction:** 59/59 and 292/292.
- **New test against 2.4.1 `tokens.js`:** fails.
- A grep for secrets and personal data: none.

| ID | Sev | Finding | Resolution |
| --- | --- | --- | --- |
| R3-1 | **Medium** | Read-only AWS checks (P-8, §4.1, §4.4) were in no approval stage | **Fixed.** New stage R (read-only pre-checks) in 03 §2; each check tagged **[O] (stage R)** |
| R3-2 | **Medium** | The irreversible parts of stages C and E were not marked | **Fixed.** C: the key must be kept once data is encrypted. E: the schema migrations are forward-only |
| R3-3 | Low | The §10 pass rule failed the normal end state | **Fixed** wording |
| R3-4 | Low | Tokens and cookies from the sign-in check had no custody rule | **Fixed.** They stay in the helper process; only status codes and the `aud`/`exp`/`sid` presence are output |
| R3-5 | Low | The throwaway account needed a non-deliverable identifier and a leftover rule | **Fixed.** `@example.invalid`; the leftover is named in the stage E approval |
| R3-6 | Low | 10 claimed round 3 results before round 3 ran | **Fixed** from this round |
| R3-7 | Low | Stage lists in 00 and 11 disagreed with 03 | **Fixed.** Both follow 03 §2 (B, R, C, D, E; one at-rest apply) |
| R3-8 | Low | `[V-doc]` was missing from the legends | **Fixed** in 04 to 07 |
| R3-9 | Low | 01 read as if `EVAL` on ElastiCache were verified | **Fixed:** "to be verified in Phase E" |
| R3-10 | Low | 04 cited a branch-vs-main plan comparison whose output was not kept | **Fixed:** says so, and adds the diff-only argument the reviewer confirmed |
| R3-11 | Low | `offline-plan.sh` unset only four `AWS_*` variables and did not pin the lockfile | **Fixed:** unsets every `AWS_*` and uses `-lockfile=readonly` |
| R3-12 | Info | The README points at this report before it is merged | Resolved by the report PR |
| R3-13 | Info | A module comment omitted extra groups | **Fixed** in the report PR (comment only) |
| R3-14 | Info | `addressSubject` twice is not idempotent for malformed short IPv6; no security effect (the ALB sets the address) | 01 qualified to "every well-formed address" |
| R3-15 | Info | ALB fail-open for unhealthy targets; the invariant still holds | none |

## Summary of open items (none Critical, High or Medium)

| Item | Where it is tracked |
| --- | --- |
| `EVAL` and READONLY on ElastiCache with the AUTH default user (A5) | Phase E **[U]** |
| Optional store-level recovery-code test (A6) | Identity backlog |
| Throwaway-account verification helper and credential route for §13 (R1, R2) | Repository task before stage E |
| Corrected wording in the post-publication lockfile commit (P2) | 01 step list |
