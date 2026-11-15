# 05. Probe pin review (D-PIN)

**Status: prepared on PR #132 (draft), branch `claude/project-thread-sdov0b-config`, head `6df2c4c`.
Not planned against AWS, not applied.** <https://github.com/munaxa/munaxa-platform/pull/132>

## 1. The pin

| Item | Value | How it was obtained |
| --- | --- | --- |
| Commit | `2f6d44317b921d4cf59649285f2481c8bef9fdb0` (main, PR #130 merge) | the merge result |
| File | `infra/aws/stack/supporting/identity-session-probe.mjs` | |
| SHA-256 | `7254a0bade48dcd3d1d3517a0597181967e4b753b6a5b455b26ff48e13a7e369` | downloaded from `raw.githubusercontent.com/munaxa/munaxa-platform/2f6d443…/…/identity-session-probe.mjs` and hashed; equal to the hash of the file in the local checkout at that commit |

Set in three places, which tests keep equal:

- `envs/nonprod.tfvars` `identity_probe_source = { commit, sha256 }`;
- `envs/nonprod.stage-e-tasks.json` `probePin`;
- the E-1 guard generated from it (`e1-task-guard.py`).

The loader (`scripts/identity-probe-loader.mjs`) is unchanged, so the manifest `loaderSha256`
(`605478…e01e`) still matches it (Terraform test).

PR #131 (L-A0) does not change the probe file, so the pin stays valid if #131 merges first.

## 2. The task definition, checked against the manifest

Offline mocked plan with `envs/nonprod.tfvars` on the #132 branch (stack Terraform tests 75/75, of
which `stage-e-manifest` compares every container, environment value, secret, role, volume, size and
platform with the manifest):

| Requirement (section 6) | Result |
| --- | --- |
| Change | exactly 1 create: `aws_ecs_task_definition.identity_probe[0]`, family `munaxa-nonprod-identity-probe` |
| Image | both containers use the Identity 2db6ed9 API image by digest `munaxa-identity/api@sha256:9a8c6ebd…3c3b` (the probe code is loaded by the pinned loader, not baked in) |
| Environment | equal to the manifest; the probe pin's two values are compared with `probePin` |
| Roles | execution role `role/munaxa-shared/munaxa-nonprod-identity-bootstrap-execution`, no task role (so the containers have no AWS credentials); security group `munaxa-nonprod-identity`; 256 CPU, 512 MiB, X86_64 Linux |
| No DB URL in the probe | the `identity-probe` container has no secrets at all. Only the non-essential `throwaway-account` container (uid 0, read-only root, all capabilities dropped) receives `DIRECT_DATABASE_URL` from `identity-migrate` (pinned version `a3cc6622…`), creates the throwaway account, writes the hand-off and exits (BE-3 design) |
| Volume and dependsOn | one volume `stage-e-handoff`, mounted read-write in `throwaway-account` and read-only in `identity-probe`; `identity-probe` `dependsOn` `throwaway-account` with condition `SUCCESS` |
| No operator secret | the probe never names `identity-operator` (new L-A0 assert on PR #131) |
| No leak | no secret value, email or password in the task definition; the pin and the hash are public |
| Mode | throwaway (`identity_probe_account` default), per D-BE4: a throwaway account per probe run, disabled afterwards |

## 3. Combined declaration if PR #131 merges first

If #131 merges before #132, the next nonprod plan also contains, from #131:

- `aws_ecs_task_definition.identity_bootstrap[0]`: delete and create (the secret references change);
- `aws_iam_role_policy.identity_bootstrap_execution[0]`: update (the secret ARN changes).

#132's declaration must then list 12 changes instead of 10, or `check-plan-intent.sh --enforce`
refuses the plan (as designed). The order and the exact edit are in file 09.
