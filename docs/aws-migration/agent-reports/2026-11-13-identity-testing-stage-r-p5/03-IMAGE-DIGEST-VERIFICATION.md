# 03. Image digest verification

Legend: **[V]** verified by Claude, **[W]** reported by a workflow run, **[AWS]** needs the Stage R read.

## The only approved images

| | Value |
| --- | --- |
| Source commit | `2db6ed9bb2eec55a38a1d9808b4a51f6258662d8` (munaxa-identity#20, on `main`, CI green run 43323607151) [V] |
| API | `229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-identity/api@sha256:9a8c6ebdc9a5ff33f07bb56760e3856f5a7819550b737db72bba4b0d794b3c3b` |
| Migration | `229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-identity/migrate@sha256:5f3bdcce0bef560da5c9843a9be583e3c53508b0e8d11754213eb6df8734b874` |

## Checks performed in this task

| Check | Result | Kind |
| --- | --- | --- |
| The digests in PR #121 equal the owner's approved values, character for character | yes (both 64 hex; compared by string equality on the diff) | [V] |
| The digests equal what the publish run pushed | yes: `containerimage.digest` in run 43359947421, jobs 131670838386 (api) and 131670838297 (migrate), re-read today; each job also shows the base `node:22-alpine@sha256:1314fb30…` | [W] |
| The run built `2db6ed9` from `main` | "Resolve the source commit" and "Confirm the commit is on main" succeeded; `head_sha` = `2db6ed9…` | [W] |
| ECR: tags, immutability, scan COMPLETE with no findings | recorded by the CVE thread at 03:40 UTC today with the root connector (`2026-11-13-identity-cve-2026-4738-remediation/06`, `supporting/ecr-verification-2026-11-13.json`) | [V] earlier today, **not re-read here** (connector down): Stage R R-5 |
| No older digest anywhere in the PR | `5277d71` (`71d01fdf…`, `d175ef37…`) removed from `nonprod.tfvars`; the `5a5994f` (`848d33c0…`, `df44505d…`) and vulnerable digests appear nowhere in the diff | [V] |
| Prod unaffected | `prod.tfvars` `images = {}` | [V] |
| The images start with the P-5 configuration | 2db6ed9's own configuration loader accepts the rendered task environment with a full bundle and refuses every broken variant (11/11, `supporting/identity-2db6ed9-config-harness-output.txt`) | [L] |
