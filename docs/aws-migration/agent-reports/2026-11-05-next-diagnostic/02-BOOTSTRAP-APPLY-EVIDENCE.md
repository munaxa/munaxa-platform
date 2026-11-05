# Second bootstrap re-apply: what the evidence establishes

**Date:** 5 Nov 2026.
**Author:** the lead.
**AWS calls:** none. No apply or plan was re-run to recover evidence.

**Labels:**

| Label | Meaning |
| --- | --- |
| [V-gh] | GitHub evidence |
| [V-repo] | repository |
| [O-ev] | owner-provided AWS output |
| [O-rep] | the owner's statement, with no output |
| [E] | inference |
| [U] | unavailable |

## 1. Where the evidence would be

**GitHub Actions cannot hold it.**
- The bootstrap is never run by a workflow. `aws-terraform.yml` lines 1 and 17 say: "Bootstrap (infra/aws/bootstrap) is never run here: root applies it in CloudShell" [V-repo].
- The platform workflow runs on 5 Nov after the 06:03 plan run 41977870108 are all `pull_request` or `push` CI and Terraform format/validate checks. None is a dispatch, and no plan or apply job ran (the Plan and Apply jobs were skipped) [V-gh, `actions_list`, 25 most recent runs].

**The repository does not hold it.** No re-apply output was committed. The phase 7 runbook (`2026-11-05-phase7/08`) tells the owner to paste the stage 1 output to the lead, and that was not done in this thread [V-repo].

**CloudShell is where it is.** The runbook writes everything to `/tmp/p7` [V-repo, runbook lines 36 to 122]:

| File | Content | Runbook step |
| --- | --- | --- |
| `bootstrap-before.tfstate` | state before; serial and lineage | 3 |
| `plan.txt` | human plan; `Plan:` line | 6 |
| `plan.json`, `actual.txt`, `expected.txt` | addresses, moves, changed attributes, Sids | 6 |
| apply output | `Apply complete! Resources: 0 added, 5 changed, 0 destroyed.` | 7 (scrollback only, not written to a file) |
| `post.txt` | post-apply plan, `-detailed-exitcode` | 8 |
| `bootstrap-after.tfstate` | state after | 8 |
| attached-policy listing | role attachments | 8 (scrollback only) |
| `simulation-rev3.tsv` | 481 results | 9 |

**Risk to the evidence.** CloudShell keeps `/tmp` only while the shell environment lives. Only the home directory persists, and it was full on 5 Nov. If the environment has been recycled, these files are gone [E, from the CloudShell storage model]. The S3 state version history of `bootstrap/terraform.tfstate` remains, but reading it is an AWS call.

## 2. Status of each item asked for

| Item | Status | Evidence |
| --- | --- | --- |
| Exact plan | **Unavailable [U]** | Expected `Plan: 0 to add, 5 to change, 0 to destroy`, at the five `policy` addresses (`phase7/08` step 6). Not supplied |
| Exact apply result | **Owner-reported only [O-rep]** | "The owner has completed the approved second bootstrap re-apply" (owner message, 10:10 UTC). No output was supplied |
| Resources added, changed or destroyed | **Unavailable [U]** | Expected 0 / 5 / 0 |
| Post-apply no-change plan | **Unavailable [U]** | Expected `No changes.`, exit 0 |
| Intended policies live on the intended roles | **Partly established [O-ev, indirect]** | Revision 3 preflight passed. The run reached `complete=yes`, so every preflight check passed (`b2-owner-simulation.sh` lines 61 to 151) [V-repo + O-ev]. Details below this table |

**What preflight established.** Preflight passing shows these facts:
- `munaxa-shared-deployer-{nonprod,prod}-allow` contain `NoLogOrDatabaseData`, `NoExportableCertificates`, `NeverExportCertificates` and `iam:ListRoleTags`.
- Both workload boundaries contain `NeverFromADeployerSession`.
- Only the nonprod boundary contains `TestingBackstop`.
- The session policy has `SessionNeverSecurityGroupRules` and `SessionNeverNetworkPlacement`, and no longer has `SessionIngressOnOwnGroups`.

That covers all five changed resources. Preflight also checks the attachments (`b2-owner-simulation.sh` lines 71 to 92):
- the managed policies (`-read`, `-allow` and `-allow-tagged`) on both deployers, and `-read` and `-session-read` on the session deployer;
- the inline policies on the three deployers and on the session CI role.

**Limit:** preflight checks only that the named Sid strings and policy names are present. It does not compare whole documents (review `03`).

**Attachments.** B4, B8 and B10 returned explicitDeny on the deployer roles, which is consistent with `-allow` being attached to both deployers [O-ev]. B2 is the single case that is not consistent with it (`01` §3, Q5).

**Not established by anything available:**
- that no other resource changed;
- that nothing was destroyed;
- that the post-apply plan was clean;
- that the state serial advanced once.

## 3. Conclusion

**The second re-apply is NOT VERIFIED:**
- The intended attachments and the platform#43 Sid markers are live, by preflight [O-ev]. The whole documents are not compared.
- Its plan, apply counts and post-apply plan are owner-reported or unavailable.

**This is evidence-incomplete, not evidence of a problem.**

## 4. How to close it without any AWS call (owner, needs no approval)

`supporting/reapply-evidence-print.sh` (sha256 `794a6c28908d0f9aaac2a1983ea2730b9fbeeb81a5de0bc6a0f8cee891c33eff`) reads only the local files in `/tmp/p7`. It runs no `aws` or `terraform` command.

**What it prints:**
- the `Plan:` line, `ADDRESSES-OK`, moves, changed attributes and the planned Sids;
- the last lines of `post.txt`;
- state serials, lineage and resource counts before and after;
- the Sids and attachment pairs of the bootstrap policies in the after-state;
- the simulation PASS/FAIL counts and FAIL lines;
- sha256 sums.

**What it does not print:** any attribute value other than Sids, addresses, attachment pairs and counts.

I tested it offline against mock files [L].

**If `/tmp/p7` no longer exists,** the script prints `NO-EVIDENCE`. The remaining read-only sources would then be:
- the S3 version history of the state object;
- a fresh `terraform plan` (it must show "No changes");
- `list-attached-role-policies`.

All of these are AWS reads that need the owner's separate approval. None is proposed in this report.

**What closes the item.** `Plan: 0 to add, 5 to change, 0 to destroy`, `ADDRESSES-OK`, 0 moves, `policy` as the only changed attribute, the post-apply `No changes.`, and an after-serial higher than the before-serial with the same lineage.
