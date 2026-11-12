# 06. MFA requirement and Testing deployment readiness (preparation only)

Tags: **[V]** verified in repository code, **[L]** local check, **[E]** expected and not yet observed, **[AWS]** needs AWS verification, **[O]** owner authorization.

Nothing in this document was executed. Specifically:
- no Terraform plan against a backend, and no apply;
- no secret read or written;
- no MFA key;
- no ECS change, no session.

## 1. The MFA requirement in the `5a5994f` images

**[V]** `packages/config/src/environment.ts` at `5a5994f` (`mfaKeyIssues`, about lines 366 to 395):
- In production mode, an empty `MFA_ENCRYPTION_KEYS` is a startup error: "is required in production. TOTP secrets are encrypted at rest under this dedicated key ring".
- A non-empty `MFA_ENCRYPTION_PRIMARY_KID` without keys is also refused.
- `MFA_POLICY` other than `off` with no keys is refused, in any mode.

The check runs **when the container starts, not when the image is built**.

**[V]** `apps/api/Dockerfile` takes exactly two build secrets: `npm_token` and the optional `ca_bundle`. It has no MFA input.

So **publishing the images needs no MFA key**, and none was generated, read or written. The requirement is unchanged and was not weakened.

**What the next Testing session needs [O, stage C]:**
1. A new version of the `munaxa-nonprod/identity` bundle that adds `MFA_ENCRYPTION_KEYS`:
   - format `kid=<32 random bytes, base64url>`;
   - generated where it is stored;
   - never the signing key or `IDENTITY_SIGNING_SECRET`, which Identity refuses;
   - Claude never sees the value.
   The route is the owner in the console, or an `asm-exec` resolve if it is available. An earlier report found `asm-exec` unavailable here **[AWS]**: check before stage C.
2. `identity_security_config = { mfa_primary_kid = "<kid only>", mfa_policy = "off" }` in `envs/nonprod.tfvars`. It is commented out today [V]. A variable validation refuses a kid shaped like a 43-character key.
3. `secret_version_ids.identity` pinned to the new version.

All three go in one reviewed tfvars PR, together with the new digests (P-5 below). With `identity_security_config` null, the stack does not reference `MFA_ENCRYPTION_KEYS` (`data.tf` `identity_secret_keys`) [V]. So pinning the new image **without** P-4 would make the hardened image refuse to start. The variable comment already forbids that.

Once MFA data has been encrypted under the key, the key must be kept. Stage C is irreversible in effect.

## 2. Plan for the next phase, in order

Each stage is a separate owner yes. The runbook is `2026-11-12-phase-c-d-preparation/03-NONPROD-DEPLOYMENT-RUNBOOK.md`. Its status changes are below.

| # | Stage | Status | Kind |
| --- | --- | --- | --- |
| 1 | **R. Read-only pre-checks**:<br>• backstop and `down` schedules active;<br>• `ecr describe-images` for the two new digests (04 already records them, if published);<br>• `describe-secret` metadata of `munaxa-nonprod/identity`;<br>• nothing running | not run | [O] read-only, connector |
| 2 | **C. MFA key bundle**: a new `munaxa-nonprod/identity` version with `MFA_ENCRYPTION_KEYS` | not run | [O] secret write, irreversible in effect |
| 3 | **P-5 tfvars PR (repository)**:<br>• pin `images.identity_api` and `identity_migrate` to the 04 digests;<br>• set `identity_security_config`;<br>• pin `secret_version_ids.identity`;<br>• declare `envs/nonprod.expected-changes.json` | not written: it needs the stage C version id | Claude, standing merge rule |
| 4 | **D. At-rest plan and apply** (`aws-terraform.yml`, `aws-nonprod` approval), then a post-apply plan "No changes" | not run | [O] |
| 5 | **E. Session** `up`, the `id.test` DNS, bootstrap and migrate, the forced redeployment, verification, `down` (runbook §7 to §16) | not run | [O] |
| 6 | Identity health and authentication: runbook §12 and §13 (live, ready, sign-in, wrong password, JWT `aud`/`exp`) | not run | in E |
| 7 | Valkey: runbook §11 (sidecar `HEALTHY` before `identity`, no `requirepass` value in logs, no port mapping) | not run | in E |
| 8 | Session revocation and MFA: throwaway `@example.invalid` account only. The helper that creates it **does not exist yet** (runbook §13 R). Revocation checks follow identity#8/#10. MFA is never enrolled on the operator account | **repository task outstanding** | before E |
| 9 | Work, Control, School, Docs impact (section 4) | assessed | none |
| 10 | Shutdown and cost: runbook §16. `down`, nonprod plan "No changes", CloudTrail summary. **[E]** under USD 2 for 3 hours | not run | in E |

## 3. Expected non-production plan changes, recalculated from code

### Basis

The last real apply was Config A1 at `67904bc` (10 Nov). Post-apply run 42766964719 said "No changes" [V].

`2026-11-12-phase-c-d-preparation/05` planned `67904bc` against `47ffd08` offline, which gave +1/~1 [L].

**Recalculated here:** `git diff 47ffd08 aaf00e4 -- infra/aws` changes only (platform#114) [V]:
- comments in `stack/services.tf`, the README and `identity-cache.tf`;
- a variable validation in `modules/service/variables.tf`, which only refuses configurations and changes no planned value;
- the production-only cache AUTH-token precondition regex;
- tests.

No resource argument changed, so **the at-rest delta is unchanged**.

Terraform is not installed in this session, so the offline plan was not re-run. That is a limitation. The P-5 PR must re-run `supporting/tools/offline-plan.sh` (05) and commit its output.

### At rest, before P-5 (unchanged from 05)

| Address | Action | Source |
| --- | --- | --- |
| `aws_secretsmanager_secret.service["docs-migrate"]` | create | platform#104/#105 (`CONTRACT.md` "Pending plan delta") [L][V] |
| `aws_iam_role_policy.docs_db_admin_execution[0]` | update in place | #105, Resource list gains the docs-migrate secret [V by expression] |

### Added by P-5 (image pin, `identity_security_config`, new bundle version)

| Address | Action | Why |
| --- | --- | --- |
| `module.identity[0].aws_ecs_task_definition.this` | replace (`delete`, `create`) | new image digest, `MFA_ENCRYPTION_PRIMARY_KID` and `MFA_POLICY` env, `MFA_ENCRYPTION_KEYS` secret, new version id [V] |
| `module.migrate["identity"].aws_ecs_task_definition.this` | replace | new migrate digest [V] |
| `aws_ecs_task_definition.identity_bootstrap[0]` | replace | uses `images.identity_api` (`ops.tf:268`) and the identity bundle [V] |

**Correction to 05 [V].** 05 expected "execution-policy updates for the new secret keys". That is wrong. The execution policies grant `secretsmanager:GetSecretValue` on the **secret ARN** (`modules/service/main.tf` `ReadOwnSecretBundle`). Adding a JSON key or a version id does not change them. So **no IAM change is expected from P-5**.

The identity probe task definition is not created, because `identity_probe_source` is unset in nonprod [V].

**Expected total [E]:** 1 create + 1 update + 3 replacements. Terraform prints this as "4 to add, 1 to change, 3 to destroy".

The three "destroys" are task-definition revisions with `skip_destroy = true`: Terraform drops them from state but does **not** deregister them, so they stay as rollback targets [V].

`check-plan-intent.sh` accepts a replacement declared as `["delete","create"]` [V]. **Runbook 03 §5 says "stop on any destroy"**. It must be read as: any destroy other than the three declared task-definition replacements. The P-5 PR must change that line.

**[AWS]** The real plan is the only proof, because state might have drifted.

### Not expected, and a stop condition if seen

- any `elasticache`, `sns` or `cloudwatch_metric_alarm` address;
- any change to RDS, VPC, subnets, routes, ACM or the backstop;
- any IAM change other than the docs policy;
- any production address.

## 4. Impact on Work, Control, School and Docs

| Product | Effect of the new Identity image in Testing |
| --- | --- |
| Work | No Work resource exists in nonprod (images unset) [V]. WK-01/WK-02 (work#31) need Identity's introspection endpoint from identity#15, which is in `5a5994f` [V, ancestor], whenever Work is deployed |
| Control | Not deployed in nonprod [V]. No change |
| School | Not deployed [V]. No change |
| Docs | Only the docs-migrate secret and policy delta above; no Docs service at rest [V] |

## 5. What is verified, expected, or needs AWS

- **[V]:**
  - the MFA rule;
  - the image needs no MFA input;
  - no infrastructure argument changed since the last offline plan;
  - execution policies are ARN-scoped;
  - three task definitions use the Identity images.
- **[E]:**
  - the 4/1/3 plan summary;
  - the session cost.
- **[AWS]:**
  - the real plan;
  - the `asm-exec` availability;
  - the backstop state;
  - the bundle version metadata;
  - the ECS deployment behaviour (runbook §9).
