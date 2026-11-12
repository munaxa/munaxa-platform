# 05. Independent review

12 Nov 2026. A separate reviewer agent, with no part in writing the reports, checked them read-only
against the source at the heads in `03`. It made no AWS, Terraform-backend or registry call. It was
asked to verify explicitly: shared-state completeness, multi-instance correctness, MFA and replay
protection, Redis failure behaviour, network and secret-reference design, Terraform separation, Platform
package compatibility, cross-product impact, cost assumptions and rollback safety.

## Round 1: CHANGES REQUIRED (1 High, 7 Medium, 7 Low, 2 Info)

| # | Sev. | Finding | Resolution |
|---|---|---|---|
| F1 | High | The release dry run (`npm pack --dry-run`) never asks the registry, so it packs every workspace package and cannot show what `pnpm -r publish` would publish; the acceptance check could never pass | Fixed: a separate release-workflow PR narrows both release steps to the 13 lockstep packages before any dispatch (`02` §4 step 1, `04` Phase B, `00` §4) |
| F2 | Medium | The concurrent-session limit uses the PostgreSQL advisory lock (`PrismaSessionStore.createWithinLimit`, path 1), not `CacheLock` | Fixed: inventory item 12 moved to "already shared (database)"; `CacheLock.release` non-atomicity noted (`01` §4) |
| F3 | Medium | The existing `valkey_image` validation would refuse production with the cache and no sidecar | Fixed: the changed rule is listed explicitly (`01` §6, `04` Phase A) |
| F4 | Medium | With services off or no image, production could still register a sidecar revision, kept by `skip_destroy` | Fixed: unconditional `environment != "prod" \|\| valkey_image == ""`, plus a test (`01` §6, §8) |
| F5 | Medium | The ingress rule referencing `module.identity[0]` fails while production has no Identity image | Fixed: the cache and its rules reference a dedicated cache-client group, not `module.identity`; the cache can be created with `images = {}` (`01` §6, `04` Phase E step 2) |
| F6 | Medium | The probe runs in Identity's main security group, so admitting that group would admit the probe | Fixed: a dedicated cache-client group, attached only to the Identity ECS service through a new `extra_security_group_ids` module variable (`01` §6, §7.1, `04` Phase E step 6) |
| F7 | Medium | Secret sequencing contradictory: the apply reads `REDIS_PASSWORD` before the operator was said to write it | Fixed: password written and pinned first, cache applied, then `REDIS_URL` added without changing `auth_token_version` (`01` §7.5, `04` Phase E steps 1 to 3) |
| F8 | Medium | Rollback revisions pin old bundle versions, so a rollback could run on an old store, or fail after a token rotation | Fixed: the switch procedure makes the old store unusable before starting; rollback only to revisions on the current bundle version (`01` §7.5, §8, `04` Phase E) |
| F9 | Low | `api-per-user` is a token bucket (no bucket suffix, about 12 s TTL, best-effort GET/SET) | Fixed (`01` §4 item 2) |
| F10 | Low | Lockout failure counter TTL is `attemptWindow`; key shapes missing | Fixed (`01` §4 item 4) |
| F11 | Low | Enrolment challenges live 10 min; the 5-minute wait does not outlast them | Fixed: the wait is justified by the 120 s TOTP window only; lost challenges cannot be replayed on a new store (`01` §4 item 5, §8, `04`) |
| F12 | Low | Old tasks with a stale role hierarchy can write stale permission sets into the shared cache during a rolling replacement | Fixed: wait 60 s after every task is replaced (`01` §4 item 11, `04` rollback) |
| F13 | Low | Identity uses 12 lockstep packages, not 13 | Fixed (`00` §5, `02` §1) |
| F14 | Low | `05-INDEPENDENT-REVIEW.md` listed but missing | Fixed: this file |
| F15 | Low | Slow-log ingestion and KMS request costs missing | Fixed: listed as cents (`01` §7.13) |
| F16 | Info | `iat` is checked only when present | Fixed wording (`02` §3, `03` §2) |
| F17 | Info | "Never two stores" with 0 % / 100 % is not yet proven | Marked unverified until the Phase D step 5 test (`01` §1, §3, `00` §3, `04` Phase D) |

Confirmed correct by the reviewer: no other in-process security state; TOTP replay TTL 120 s and
`assertMfaDistributed`; challenge attempts reserved before checking; atomic Lua increment;
`addressSubject` idempotence; `GENERAL_RULES` filtering; database subnets local-only; KMS log-group
condition; release mechanics and changesets; frozen lockfiles everywhere; the dependency matrix; no text
implying an AWS action.

## Round 2: CHANGES REQUIRED (2 Medium, 3 Low, 3 Info)

All round 1 fixes were confirmed correct and complete.

| # | Sev. | Finding | Resolution |
|---|---|---|---|
| R1 | Medium | `release.yml` narrowing was placed in the version PR and under owner-authorized steps, contradicting "nothing else" and the acceptance | Fixed: its own repository PR (step 1) before the version PR; only the two dispatches need owner authorization (`02` §4, `04` Phase B) |
| R2 | Medium | Adding `identity_cache` to `prod.tfvars` in Phase A would make every production plan read the bundle (ephemeral resources are read at plan time) and turn unrelated applies into cache creation | Fixed: `prod.tfvars` changes only in the Phase E PR; new validation requiring a pinned `secret_version_ids.identity`; the plan role also needs the bundle read (`01` §6, `04` Phases A and E) |
| R3 | Low | Fallback paragraph still said "Identity's security group" | Fixed (`01` §7.5) |
| R4 | Low | Phase A still listed `egress_to` on the Identity module, which would open 6379 egress from the probe's group | Fixed: removed; egress is on the client group only (`04` Phase A) |
| R5 | Low | `publish --dry-run` would get 401 (no token in the dry-run step) | Fixed: option removed; the filter is the only option (`02` §4 step 1) |
| R6 | Info | The circuit breaker picks its own rollback target | Fixed wording: its rollback fails closed; the revision rule applies to manual rollbacks (`01` §7.5, `04` Phase E) |
| R7 | Info | The probe test is weak evidence | Fixed: rule review and describe calls carry the check (`04` Phase E step 6) |
| R8 | Info | MFA failure key shape vague | Fixed: `mfa:failures:<tenant>:<user>` (`01` §4 item 6) |

## Round 3: APPROVE

All round 2 fixes confirmed. Two Lows, fixed in the same edit as the reviewer allowed:
- S1: `04` Phase A said four new validations; it is five, and the pinned-version rule now has a test.
- S2: `04` Phase A now says the plan role also needs the bundle read (the ephemeral read runs at plan time).

No Critical, High or Medium finding remains.
