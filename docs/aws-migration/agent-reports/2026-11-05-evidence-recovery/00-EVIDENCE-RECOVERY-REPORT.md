# Second bootstrap re-apply (5 Nov 2026): evidence recovery investigation

- **Date:** 5 Nov 2026. First draft 13:41 UTC; revised after independent review; §9 added at 16:20 UTC; final corrections at about 17:15 UTC (revision history at the end).
- **Author:** the lead.
- **Independent reviewer:** separate reviewer, `01-INDEPENDENT-REVIEW.md` next to this file. Verdict **AGREE WITH CHANGES**; all 14 findings applied (§5).

**Scope.** Read-only throughout.
- **§1 to §8 (to 13:41 UTC):** the lead made no AWS call and used no credentials.
- **§9 (16:11 to 16:20 UTC):** on the owner's explicit approval, the lead performed **read-only** AWS operations only, through the AWS connector (listed in §9). Nothing was created, changed or deleted.
- **Throughout:** nothing was run in Terraform, and no IAM, policy, state, infrastructure or GitHub setting was changed. CanteenHub, Render and Supabase were not inspected or touched.

**Where this report lives.** First kept as a project file only, per the owner's no-commit instruction. The owner then asked (13:59 UTC) for it to be committed. It is copied here unchanged apart from this paragraph and the reviewer file name (`01-INDEPENDENT-REVIEW.md`).

**Evidence labels:**

| Label | Meaning |
| --- | --- |
| [O-ev] | original AWS output the owner supplied (pasted text or files) |
| [O-rep] | the owner's statement, without output |
| [V-gh] | GitHub API, read by the lead |
| [V-repo] | git content, read by the lead |
| [L] | local offline analysis |
| [E] | inference |
| [U] | not available |

## 1. Executive verdict

### Final verdict (supersedes the pre-read assessment below)

**Second bootstrap re-apply at `6b8997a`: PARTIALLY VERIFIED.** This rests on the read-only AWS evidence in §9.

| Item | Status |
| --- | --- |
| Apply effect (0 added, 5 changed, 0 destroyed) | **VERIFIED, effect only.** The original Terraform `Apply complete!` output is not recovered, and that Terraform made the writes is inference [E] |
| State serial and lineage | **VERIFIED** (serial 3 → 4, same lineage) |
| Managed instance counts | **VERIFIED** (68 before and after, none added or removed) |
| Attachments | **VERIFIED for the 6 roles read.** The 4 publisher roles and the role trust policies were not read |
| Policy documents | **VERIFIED for the 14 documents read**, by a non-cryptographic comparison (§9 O-3) |
| Terraform plan text | **UNRECOVERABLE FROM CURRENT SOURCES** |
| Post-apply plan result | **UNRECOVERABLE FROM CURRENT SOURCES** |

**Process finding.** The runbook's pre-apply plan-review gate (the owner pastes the plan to the lead before applying) was apparently skipped (§9).

**B2: `ROOT CAUSE UNRESOLVED — REMAINS BLOCKED`, unchanged.** Neither a simulator-side nor a harness-side explanation is confirmed (§9).

### Pre-read assessment (13:41 UTC, kept as written; superseded by the final verdict above)


**Second bootstrap re-apply at `6b8997a`: NOT VERIFIED.** The plan, the apply result, the post-apply plan, the state serials and the resource counts are **UNRECOVERABLE FROM CURRENT SOURCES** (`/tmp/p7` is gone, and no copy exists in GitHub, in the repository or in the project chat). What *is* evidenced, indirectly but by original AWS output:

- the named attachments were present at about 10:10 UTC (presence and names only);
- the new statement IDs (Sids) were present in the five changed policies.

This shows an end state, not the act. It does not show that the `6b8997a` plan, and only that plan, was applied. **The re-apply itself stays NOT VERIFIED** (§3).

**B2: `ROOT CAUSE UNRESOLVED — REMAINS BLOCKED`, unchanged.** No existing evidence resolves it (§4).

**A correction to the brief.** The brief says the expected result was "19 additions, 5 changes, 0 destructions".

- **For this re-apply that is wrong.** The approved expectation for the second re-apply at `6b8997a` was **`0 to add, 5 to change, 0 to destroy`**, policy attribute only. Source: `munaxa-platform` `docs/aws-migration/agent-reports/2026-11-05-phase7/08-SECOND-BOOTSTRAP-RUNBOOK.md` line 18 and step 6 [V-repo].
- **"19 added" belongs to the first re-apply** at `46dfbd9`, at about 05:15 UTC: 19 added, 4 changed, 0 destroyed [V-repo, from owner-pasted O-ev: `2026-11-05-bootstrap-reapply/00` lines 12 and 33, `evidence/run1-cloudshell-apply-and-simulation.txt` line 56]. That is Phase 6 evidence (`~/p6`), and it must not be used for this one.

## 2. Evidence inventory

All repository paths are in `munaxa/munaxa-platform`. Times are UTC.

| # | Item | Source and location | ID | Time | Kind | Integrity check | Proves | Does not prove |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| E1 | "The owner has completed the approved second bootstrap re-apply" | Owner message relayed into this thread | message ending …YNJCkaPjBg74ug7jpvkmsm (shortened) | 10:10:23 | [O-rep] | none possible | That the owner states it was done | Any plan, count or result |
| E2 | Simulation revision 3 `RESULT total=481 expected_match=477 … complete=yes` | Owner message (pasted text) | same, plus the message ending …2WFNk2owvewc1DnRvGcLGs (four FAIL lines) | 10:10 / 10:11 | [O-ev] pasted, not the file | The script hash on main is `12cd2ca7…6e22b` [V-repo]. The pasted path `results=/tmp/p7/simulation-rev3.tsv` matches the runbook's hash-gated invocation (`phase7/08` lines 119 to 122) [E]; that is not proof the hash check ran. It also shows `/tmp/p7` existed at about 10:10 | That preflight passed (`complete=yes` is reached only after it) | Apply counts. That the plan was 0/5/0 |
| E3 | Preflight checks inside revision 3 | `docs/aws-migration/agent-reports/2026-11-05-phase7/supporting/simulation/b2-owner-simulation.sh` lines 61 to 151 | commit `f409459` (merged 09:33) | - | [V-repo] code | file on main | With E2, these were present at about 10:10 (presence only, by name, `grep -qx`): the managed and inline policies on the 3 deployers, and the inline `assume-own-session-deployer-only` on the session CI role; Sid markers `NoLogOrDatabaseData`, `NoExportableCertificates`, `NeverExportCertificates`, `iam:ListRoleTags` (both `-allow`); `NeverFromADeployerSession` (both boundaries); `TestingBackstop` (nonprod boundary only); `SessionNeverSecurityGroupRules` and `SessionNeverNetworkPlacement` (session), with `SessionIngressOnOwnGroups` gone | That the full documents equal `6b8997a`. That nothing else changed. That no extra policy is attached. The CI roles, the publisher role and the session CI role's managed policies are not checked at all |
| E4 | Diagnostic 1: `summary.tsv` and A6, B2, B4 and B6 JSON | Owner upload. Copied byte for byte to `docs/aws-migration/agent-reports/2026-11-05-next-diagnostic/supporting/diagnostic-1-results/` with `SHA256SUMS` | merged in `6ab69d1` (#46) | upload 11:25 | [O-ev] original files | SHA256SUMS recorded at receipt [V-repo] | The live `-allow` policies contain an unconditioned GetLogEvents deny that decided B4, B5, B6, B8 and B10 (identified by elimination, not by its column). The inline `deployer` policy has `NeverTheOtherEnvironmentByName` at the rendered offset | Plan or apply. The whole document text |
| E5 | Runbook for the second re-apply | `…/2026-11-05-phase7/08-SECOND-BOOTSTRAP-RUNBOOK.md` | `f409459` | - | [V-repo] instructions | file on main | What *should* have been done and saved to `/tmp/p7` | That it was done, or what it printed |
| E6 | GitHub Actions run 41977870108 (AWS Terraform, `workflow_dispatch`) | munaxa-platform Actions | head `decd1dc` | 06:03 to 06:04 | [V-gh] | run metadata; **no artifacts** (`list_workflow_run_artifacts`: 0) | A nonprod stack plan (64 creates) **before** `6b8997a` existed (merged 08:51) | Anything about the second re-apply. It also never runs the bootstrap: "Bootstrap (infra/aws/bootstrap) is never run here" (`aws-terraform.yml` line 17) |
| E7 | GitHub Actions run 41943924455 (AWS Testing session, schedule) | munaxa-platform Actions, job 126971301674 "Testing down" | head `d734ae9` | 00:47 | [V-gh] | run metadata | That the scheduled `down` ran green before any re-apply. Init, plan and apply were skipped | Anything about the second re-apply |
| E8 | PR #42 | munaxa-platform | head `fb6f095`, merged 06:32 | 06:21 to 06:32 | [V-gh] | PR metadata | Docs for simulation run 2 (332/332) and run 41977870108 | Anything about the second re-apply (it predates `6b8997a`) |
| E9 | Report folders `2026-11-05-phase7`, `2026-11-05-second-bootstrap-reapply`, `2026-11-05-next-diagnostic` | munaxa-platform main (`f409459`, `0e379d5`, `6ab69d1`) | - | 09:33 / 10:41 / 13:29 | [V-repo] later summaries by the lead | git | Restate E1 to E4 | They are not independent evidence of the apply. **Stale label:** `second-bootstrap-reapply/00` line 39 (`0e379d5`) labels the owner's "re-apply done" statement [O-ev]; it is [O-rep] |
| E10 | Workflow runs after 06:04 | munaxa-platform `list_workflow_runs` (latest 25) | - | to 13:29 | [V-gh] | API | Only `pull_request` and `push` CI or format checks ran; no dispatch and no Plan or Apply job | - |
| E11 | Project chat 09:30 to 10:15 | searched by the coordinator at the lead's request | - | - | negative search result | not independently re-checked | Nothing beyond E1 and E2 was posted there | - |
| E12 | `~/p6` in CloudShell | owner | - | first re-apply, about 05:15 | **excluded** | - | It is from the `46dfbd9` re-apply | **Not** evidence for this one |

**Time window [E].** `6b8997a` was merged at 08:51. PR #44, carrying the runbook, was open from 08:54 and merged at 09:33. Runbook line 119 (step 9, the simulation) downloads the script from main, so only the *simulation* must be after 09:33. The apply lies between 08:51 and the start of the simulation; the result was posted at 10:10. O-1 and O-2 would pin the time.

**Stale, contradictory or duplicate evidence:**
- **The brief's "19 additions"** is Phase 6, as explained in §1.
- **The `-allow` statement offsets** reported in E4 are 23 characters below the compact render of `744c67c`.
  - **One candidate explanation [E, unconfirmed].** 23 characters is exactly `"Version":"2012-10-17",`, and with `Version` after `Statement` the render gives 4806 and 4742. The inline offset (4573) matches with `Version` first.
  - **Why it is only a candidate.** Any 23-character shortening before that statement, in both environments, would fit just as exactly, including a content difference; if that held, it would weaken 6b. Both policies come from the same renderer, and no mechanism is known that would order the managed text differently from the inline text.
  - **What O-3 can settle.** Content equality. It may not settle the offset cause, because `GetPolicyVersion` text may not be the text the simulator counts columns in.
- **No duplicates.** E9 repeats E1 to E4; it is not new evidence.

## 3. Re-apply verification matrix

| # | Claim | Expected (runbook `phase7/08`) | Evidence | Verdict |
| --- | --- | --- | --- | --- |
| 1 | Exact Terraform plan | `Plan: 0 to add, 5 to change, 0 to destroy`, five `policy` updates (`deployer_allow[nonprod/prod]`, `workload_boundary[nonprod/prod]`, `deployer_session[nonprod]`), 0 moves, `ADDRESSES-OK` | none | **UNRECOVERABLE FROM CURRENT SOURCES** |
| 2 | Exact apply result | `Apply complete! Resources: 0 added, 5 changed, 0 destroyed.` | E1 only [O-rep] | **NOT VERIFIED** |
| 3 | Post-apply no-change plan | `No changes.`, exit 0 | none | **UNRECOVERABLE FROM CURRENT SOURCES** (can only be reproduced by a new plan, which the brief rules out) |
| 4 | Before and after state serial and lineage | after = before + 1 (or higher), same lineage | none locally; the S3 object versions still exist [E] | **NOT VERIFIED**. Recoverable with owner-approved AWS reads (§7 O-1) |
| 5 | Resource counts | unchanged (0 added, 0 destroyed) | none | **NOT VERIFIED**. Recoverable through §7 O-1 and O-2 |
| 6a | Policy attachments | as on 5 Nov (`-read`, `-allow`, `-allow-tagged`; inline `deployer`; session policies) | E2 + E3 [O-ev, indirect] | **PARTIALLY VERIFIED** [O-ev, indirect], presence only (the brief's four verdicts; reviewer F1 wording "evidenced" applies): the named policies were present at about 10:10. Extra attachments, the CI and publisher roles and the session CI role's managed policies are not covered. The 0/5/0 plan changes no attachment, so this says little about the apply |
| 6b | Policy contents | equal to `6b8997a` | E2 + E3 (Sid markers present); E4: `NoLogOrDatabaseData` decided B4/B5/B6/B8/B10 by elimination, at a column 23 characters off the render; `NeverTheOtherEnvironmentByName` at the rendered column | **PARTIALLY VERIFIED** [O-ev, indirect]: markers present; full documents not compared |
| - | **Overall** | | | **NOT VERIFIED** |

## 4. B2: status and what remains unknown

**Verdict:** `ROOT CAUSE UNRESOLVED — REMAINS BLOCKED` (`2026-11-05-next-diagnostic/01` §2: row 8 of the pre-established table is triggered by B2 alone).

**New evidence: none.** The only new analysis here is the `Version`-order candidate in §2. It may explain the column offsets, but it says nothing about why `NoLogOrDatabaseData` matched for `log-group:/munaxa/nonprod/identity` (B4) and not for `log-group:/aws/other` (B2).

**Still unknown:**
1. Whether the simulator fails to report a *lone* unconditioned Deny from an attached *managed* policy. No revision 3 case tests this. D30.1 is the log-stream form and is uninformative (`next-diagnostic/03` F4).
2. Whether `/aws/…` names are special.
3. Whether the behaviour is specific to GetLogEvents.

The 10-call follow-up test, `next-diagnostic/supporting/b2-followup-diagnostic.sh` (sha256 `83bdb7ac…f6d6`, interpretation in `01` §5, on main), separates the three. **It is not run, and it still needs the owner's approval.**

**Not claimed:**
- The simulator hypothesis is not confirmed.
- No expectation is changed.
- No workaround is proposed as validated.

## 5. Independent reviewer findings

**Reviewer:** a separate reviewer, working from primary sources (git at `origin/main` `6ab69d1`, GitHub REST for PRs #42 to #46 and runs 41977870108 and 41943924455, the diagnostic files and their `SHA256SUMS`). It did not read the project chat, so E1, E2 and E11 were not re-checked against the original messages. Full text: `01-INDEPENDENT-REVIEW.md`, unmodified.

**Verdict: AGREE WITH CHANGES.** It re-derived the headline: re-apply NOT VERIFIED; plan, apply and post-plan unrecoverable from current sources; B2 unresolved; the brief's 19/5/0 is wrong (Phase 6, not Phase 7).

| Finding | Severity | Handling in this report |
| --- | --- | --- |
| F1: 6a "VERIFIED" overclaims (owner-pasted, presence and names only, CI/publisher roles unchecked) | Medium-High | 6a relabelled PARTIALLY VERIFIED [O-ev, indirect], presence only (the brief allows only four verdicts); E3 wording narrowed |
| F2: 6b said "offsets the render predicts", contradicting §2 | Medium | 6b and E4 now say "by elimination", 23 characters off |
| F3: Version key-order explanation stated too strongly | Medium | Now "one candidate [E, unconfirmed]"; content difference not excluded; O-3 limit stated |
| F4: §1 "PARTIALLY VERIFIED" conflates end state with the act | Medium | §1 rewritten: re-apply NOT VERIFIED; markers are a separate end-state observation |
| F5: O-1 prefix also matches the lock file; no `Key` printed | Medium | O-1 prints `Key` and `DeleteMarkers`; lock timeline added to §6 |
| F6: O-1 counts include data sources; state files left in `/tmp` | Low-Medium | Managed-instance count added (compare with 68); state streamed, not saved; KMS access marked [E] |
| F7: O-2 event list incomplete; "substitutes" overclaims | Medium | O-2 now `ReadOnly=false`, us-east-1 primary plus eu-central-1; reworded to "corroborates" |
| F8: O-3 skips the documents that should not have changed | Low | Added `-allow-tagged`, `-read`, `-session-read`, inline `deployer`, and version create dates |
| F9: time-window reasoning | Low | §2 corrected: only the simulation must be after 09:33 |
| F10: results path supports E2 | Low | Added to E2 as [E] |
| F11: stale [O-ev] label in `second-bootstrap-reapply/00` line 39 | Low | Flagged in E9. Not corrected in the repo (no commits in this task) |
| F12: D30.1 wording | Low | §4 corrected |
| F13: next scheduled `aws-session.yml` run is a free post-apply check | Low | Added to §6 and §8 |
| F14: provenance details (ids, E11 label, Phase 6 label, header time) | Low | Applied; message ids kept shortened, the full messages are in this thread |

## 6. Missing evidence: is it recoverable?

| Missing item | Recoverable? | How |
| --- | --- | --- |
| Plan text and `plan.json` | **No**: the saved plan existed only in `/tmp/p7` | - |
| Apply output (`Apply complete!` line and counts) | **No** as text. **Corroboration only**: CloudTrail shows which write calls were made and that no others were | §7 O-2 |
| Post-apply plan result | **No** without a new Terraform plan (ruled out). That a post-apply plan *occurred* (not its result) may show in the lock-file timeline | §7 O-1 (lock versions and delete markers) |
| State serials, lineage and counts | **Yes**: S3 versioning keeps each state write | §7 O-1 |
| Full policy documents and version dates | **Yes** | §7 O-3 |
| Session trust path still works after the apply | **Yes, passively, no AWS call by us**: the next scheduled `aws-session.yml` run (crons 19:00 to 03:00 UTC) must assume both session roles without AccessDenied (runbook `phase7/08` line 132). Its log is GitHub evidence. Covers that path only | GitHub read after it runs |

## 7. Proposed read-only AWS operations (as proposed at 13:41 UTC; since performed, see §9)

**Status: done.** The owner approved these at 13:59 UTC and asked for them to be run through the AWS connector instead of CloudShell. The lead performed them, read-only, at 16:11 to 16:20 UTC. The results are in §9. The text below is kept as originally proposed, as a record.

All are read-only, account `229251310592`. As proposed, the owner would run them in CloudShell. They create, modify and delete nothing.

**O-1. State history: serials, lineage, counts, and the lock timeline.**

```bash
B=munaxa-shared-tfstate-229251310592
aws s3api list-object-versions --region eu-central-1 --bucket $B --prefix bootstrap/terraform.tfstate \
  --query '{v:Versions[?LastModified>=`2026-11-05T00:00:00Z`].[Key,VersionId,LastModified,Size,IsLatest],d:DeleteMarkers[?LastModified>=`2026-11-05T00:00:00Z`].[Key,VersionId,LastModified]}' --output json
# For Key == bootstrap/terraform.tfstate only: the newest version before 08:51, and each version from 08:51 to 10:15.
# Streamed to stdout, nothing saved to disk:
aws s3api get-object --region eu-central-1 --bucket $B --key bootstrap/terraform.tfstate --version-id <ID> /dev/stdout \
  | python3 -I -c "import json,sys;d=json.load(sys.stdin);r=d['resources'];print('serial',d['serial'],'lineage',d['lineage'],'managed_instances',sum(len(x['instances']) for x in r if x['mode']=='managed'),'all_resources',len(r))"
```

**Why:** claims 4 and 5. `managed_instances` is comparable with the runbook baseline of 68. The `.tflock` versions and delete markers show when each locking Terraform operation (plan, apply, post-apply plan) ran, and in what order, but not their results. The state is KMS-encrypted; that root can decrypt it is assumed [E] (root ran init and apply against this backend). Only the printed fields leave the command.

**O-2. CloudTrail management events: every write in the window.**

```bash
for r in us-east-1 eu-central-1; do
  echo "== $r"
  aws cloudtrail lookup-events --region $r --start-time 2026-11-05T08:45:00Z --end-time 2026-11-05T10:15:00Z \
    --lookup-attributes AttributeKey=ReadOnly,AttributeValue=false \
    --query 'Events[].[EventTime,EventSource,EventName,Username,join(`,`,Resources[].ResourceName||`[]`)]' --output text
done
```

**Why:** us-east-1 is the primary run: IAM (and Budgets) events are recorded there. eu-central-1 covers ECR, KMS and S3 bucket configuration, which the bootstrap also manages. Expected: in us-east-1, 4 × `CreatePolicyVersion` (two `-allow`, two boundaries), possibly `DeletePolicyVersion` if a version limit was hit, and 1 × `PutRolePolicy` (`session-deployer`); no other write in either Region apart from the owner's own non-bootstrap actions, which would need explaining. This **corroborates** which writes happened and that no others did. It cannot reproduce Terraform's `Apply complete!` line, and S3 state writes are data events that `LookupEvents` does not record. `LookupEvents` is free.

**O-3. Live documents and version dates, compared offline.**

```bash
A=arn:aws:iam::229251310592:policy
for p in munaxa-shared/bootstrap/munaxa-shared-deployer-nonprod-allow munaxa-shared/bootstrap/munaxa-shared-deployer-prod-allow \
         munaxa-shared/munaxa-shared-workload-boundary munaxa-shared/munaxa-shared-workload-boundary-prod; do
  aws iam list-policy-versions --policy-arn $A/$p --query 'Versions[].[VersionId,IsDefaultVersion,CreateDate]' --output text
  v=$(aws iam get-policy --policy-arn $A/$p --query Policy.DefaultVersionId --output text)
  aws iam get-policy-version --policy-arn $A/$p --version-id $v --query PolicyVersion.Document --output json > "live-$(basename $p).json"
done
# unchanged-by-design policies: UpdateDate should predate 08:51
#   -allow-tagged (both), -read, -session-read: aws iam get-policy --policy-arn <arn> --query Policy.UpdateDate
aws iam get-role-policy --role-name munaxa-shared-deployer-nonprod-session --policy-name session-deployer --query PolicyDocument --output json > live-session.json
# inline deployer policies on the nonprod and prod deployers: aws iam get-role-policy --role-name <role> --policy-name deployer
```

**Why:** settles claim 6b by a key-order-insensitive comparison against the `6b8997a` render, and dates the five policy changes. The lead would supply the comparison script, and the exact ARNs for the unchanged policies, before the run. It may not settle the column-offset cause (§2).

**Excluded by the brief:** a new `terraform plan`, for the bootstrap or the stack.

## 8. Final recommendation and explicit blockers

This section reflects the §9 evidence. It replaces the 13:41 UTC version, which recommended approving O-1 and O-2. Those reads have since been performed.

**Recommendation.**
1. **Accept the second re-apply as PARTIALLY VERIFIED** on the §9 evidence. The plan text and the post-apply plan result cannot be recovered. Whether the verified effect is enough, or whether a separately approved new no-change `terraform plan` is wanted, is the owner's decision. Nothing is proposed here.
2. **Decide on the B2 follow-up test** (`next-diagnostic/supporting/b2-followup-diagnostic.sh`, 10 read-only simulator calls). It needs its own approval.
3. **The lead reads tonight's scheduled `aws-session.yml` run log.** No approval is needed. It covers the session trust path only.
4. **Keep the pre-apply plan-review gate** for every future bootstrap apply: the owner pastes the plan to the lead before applying. The §9 process finding shows it was apparently skipped this time.

**Blockers (unchanged or added; none removed):**
- **The second re-apply is PARTIALLY VERIFIED, not VERIFIED.** The Terraform plan text and the post-apply plan result are unrecoverable from current sources. Attachments are verified for the 6 roles read only; the publisher roles and role trust policies were not read.
- **B2 is unresolved** (`ROOT CAUSE UNRESOLVED — REMAINS BLOCKED`). Neither the simulator-side nor the harness-side explanation is confirmed, and the follow-up test is unrun.
- **The session trust-path check is pending** (the next scheduled `aws-session.yml` run).
- **Not authorized and not claimed:**
  - G3 (last plan 64/0/0 at `decd1dc`, before `6b8997a`);
  - the backstop apply;
  - a Testing deployment;
  - image publication;
  - any secret, migration, DNS, Cloudflare or production change.

## 9. Addendum: results of the approved read-only reads (5 Nov 2026, 16:11 to 16:20 UTC)

**Approval.** At 13:59 UTC the owner approved the reads ("Approved"). At 14:00 UTC he told the lead to run them through the root-signed AWS connector ("Use root connector"). The connector's sign-in was renewed at 16:10 UTC.

**Calls made.** Read-only calls only, through the AWS MCP connector (identity: account `229251310592`, root):
- `sts:GetCallerIdentity`;
- `cloudtrail:LookupEvents`;
- `s3:ListObjectVersions` and `s3:GetObject`, on two state versions;
- `iam:GetPolicy`, `ListPolicyVersions`, `GetPolicyVersion`, `GetRolePolicy`, `ListAttachedRolePolicies` and `ListRolePolicies`;
- `s3:GetObject` implies a server-side `kms:Decrypt` of the state object; the object's encryption setting was not reported.

Nothing was created, changed or deleted. The connector logs each script as `aws-mcp CallReadWriteTool`; that is the tool's name, not a write. Only Sids, names, counts, timestamps and checksums left the sandbox. No state attribute value was printed except `attachment_count`, empty `tags` and policy ARNs. Labels: [V-aws] means AWS output read by the lead.

### O-2: CloudTrail write events (`ReadOnly=false`)

| Window (UTC) | us-east-1 (IAM) | eu-central-1 |
| --- | --- | --- |
| 08:45 to 10:15 | Exactly 5 writes, all at **09:55:28** by root: `CreatePolicyVersion` on `-deployer-nonprod-allow`, `-deployer-prod-allow`, `munaxa-shared-workload-boundary` and `-boundary-prod`; `PutRolePolicy` `session-deployer` on `munaxa-shared-deployer-nonprod-session` | CloudShell session events only (`CreateSession`, `PutCredentials`, `SendHeartBeat`, from 09:44). No other write |
| 05:14 to 08:45 (between the two re-applies) | none | none (CloudShell events only) |
| 10:15 to 16:12 | `ConsoleLogin` and `SubscribeToURP` by root at 16:08 (most likely the owner's console sign-in [E]), and the connector's own calls | none apart from CloudShell |

No `DeletePolicyVersion`, attach, detach, create, delete, trust, boundary or tag call happened in any window. CloudTrail does not record S3 state writes (those are data events) [V-aws]. The events' `userAgent` was not read, so that Terraform made these writes is inference [E].

**Coverage.** The investigator's own operations were read-only. CloudTrail was queried only for the three windows above, so the evidence says nothing about events outside them. Not queried: before 05:14 (including 05:13:03 to 05:14) and after 16:12. `LookupEvents` covers management events only; data events such as S3 object writes are not covered.

### O-1: state object history

**State versions:**

| Version (LastModified) | serial | lineage | managed instances | data instances |
| --- | --- | --- | --- | --- |
| `7IqoN…` (05:13:03, first re-apply) | 3 | `069c8480-…-04c808be2861` | 68 | 20 |
| `uGUXh…` (**09:55:30**, latest) | **4** | same | **68** | 20 |

Between serial 3 and 4, no managed address was added or removed.

**Changes to the `policy` attribute.** The `policy` attribute changed on exactly the five expected resources:
- `deployer_allow[nonprod|prod]`;
- `workload_boundary[nonprod|prod]`;
- `aws_iam_role_policy.deployer_session[nonprod]`.

**No replacement.** No address was added or removed, and CloudTrail shows no Create or Delete call. Ids, ARNs and create dates were not compared one by one.

**Other attribute differences.** These are the values that are read back from AWS at refresh [E: refresh-only]. The role `inline_policy` text in serial 3 is stale because `aws_iam_role_policy.deployer` was modified later in the first re-apply (`2026-11-05-bootstrap-reapply` run 1 evidence, lines 35 to 45). The `tags` and `attachment_count` differences appear only on objects created at 05:12:52. One offline check was not made: that serial 4's role inline text equals its `aws_iam_role_policy.deployer` policy:
- `attachment_count` went 0 → 1 or 3 on six policies;
- `tags` changed on several resources, from null to `{}` where values were printed;
- the roles' computed `managed_policy_arns` and `inline_policy` were refilled.

No other configuration attribute changed. In particular, `aws_iam_role_policy.deployer` is unchanged, and CloudTrail shows no `PutRolePolicy` on the deployer roles [V-aws].

**Lock-file timeline on 5 Nov** (`.tflock` versions and delete markers). Each pair is one locking Terraform operation:

| Lock held (UTC) | Operation [E, from the runbook order] |
| --- | --- |
| 09:52:44 to 09:52:54 | plan (runbook step 6) |
| 09:55:23 to 09:55:30 | apply; the state is written at 09:55:30 (step 7) |
| 09:56:33 to 09:56:42 | post-apply plan, no state write (step 8) |

[E] The three locking operations happened in the runbook's order. The lock files do not show their results or exit codes, and a post-apply plan that showed changes would leave the same trace.

**Runbook gate not evidenced.** The runbook's stage 1 gate (paste the plan to the lead before applying, `phase7/08` line 102) appears to have been skipped. The apply lock came about 2.5 minutes after the plan lock, and nothing was posted to the lead then. This is a process finding, not evidence of a wrong change.

### O-3: live documents and attachments

**All 14 documents read equal the `6b8997a` render** (the `744c67c` render; the bootstrap tree is identical), compared key-order-insensitively. How the comparison worked:
- **Exact canonical JSON length:** each document was serialised with sorted keys and no whitespace, and its length matched the render's exactly.
- **A 61-bit polynomial checksum:** the connector returned it as a JSON float. That keeps about **53 bits of effective precision**, and the checksum matched at that precision.
- **Non-cryptographic:** this is not a cryptographic hash. The sandbox blocks `hashlib`, so SHA-256 could not be used.
- **Independent recheck: 5 of the 14 documents, not all 14.** The independent reviewer re-checked `allow_nonprod`, `allow_prod`, `boundary_nonprod`, `boundary_prod` and `session_inline_nonprod`. The other 9 rest on the lead's comparison only.

The 14 documents:
- the managed policies `-allow` ×2, `-allow-tagged` ×2, `-read`, `-session-read` and the boundaries ×2;
- the inline policies `deployer` ×2, `session-deployer`, `assume-own-deployer-only` ×2 and `assume-own-session-deployer-only` [V-aws + L].

**Policy versions:**
- The four changed managed policies have a new default version created at 09:55:28. That is `v2` for each `-allow` and for the prod boundary, and `v3` for the nonprod boundary.
- The unchanged policies have a single version from 05:12:52 (the first re-apply).

**Attachments are exactly the expected sets on the 6 roles read** (not only present). The 4 publisher roles and the role trust policies were not read; CloudTrail shows no write to any role in the window except `PutRolePolicy` on the session deployer:
- the deployers: `-allow`, `-allow-tagged` and `-read`, plus inline `deployer`;
- the session deployer: `-session-read` and `-read`, plus inline `session-deployer`;
- the CI roles: inline policy only.

**Key order.** `GetPolicyVersion` returns every managed document with `Statement` before `Version`, and `GetRolePolicy` returns every inline document with `Version` first [V-aws]. This is direct support for the §2 key-order candidate for the 23-character offset. It still does not prove that the simulator counts columns in this text.

### Updated matrix

| # | Claim | Verdict now | Basis |
| --- | --- | --- | --- |
| 1 | Exact plan | **UNRECOVERABLE FROM CURRENT SOURCES**. What was applied is verified by 2 and 5; what the plan showed, and whether its stop checks passed, is not | a lock at 09:52 is consistent with a plan [E] |
| 2 | Apply result 0 added, 5 changed, 0 destroyed | **VERIFIED (effect only)**: the `Apply complete!` output is lost; that Terraform made the writes is [E] | O-2: exactly 5 writes, on the 5 expected resources; O-1: 68 → 68 instances, `policy` changed on the same 5 |
| 3 | Post-apply no-change plan | **UNRECOVERABLE FROM CURRENT SOURCES** | a lock at 09:56:33 to 09:56:42 with no state write is consistent with a plan [E]; exit code unknown |
| 4 | Serial and lineage | **VERIFIED** | 3 → 4, same lineage |
| 5 | Resource counts | **VERIFIED** | 68 managed before and after, none added or removed |
| 6a | Attachments | **VERIFIED for the 6 roles read** (exact sets); publisher roles not read | O-3 |
| 6b | Policy contents | **VERIFIED for the 14 documents read** (non-cryptographic checksum) | O-3 |
| - | **Overall** | **PARTIALLY VERIFIED** | Every material effect is verified. The plan text and the post-apply plan output remain unrecoverable |

**What this does not change.**
- **B2 stays `ROOT CAUSE UNRESOLVED — REMAINS BLOCKED`.** The live `-allow` documents equal the render, whose `NoLogOrDatabaseData` denies `logs:GetLogEvents` on `*` with no condition. CloudTrail shows no write from 10:15 to 16:12, so these are the documents the diagnostic ran against. The cause is therefore not a live-versus-render policy difference. It does not confirm any explanation, and two kinds remain open:
  - **Simulator-side:** the IAM policy simulator itself does not report the Deny for this request. For example, it may not report a lone managed-policy Deny, or it may treat `/aws/` group names or GetLogEvents specially.
  - **Harness-side:** the way the diagnostic script built the request or read the result. This covers the resource ARN form, the context entries, the caller ARN, and the parsing of `MatchedStatements`.

  The B2 follow-up test (still unrun, and needing its own approval) separates the three simulator-side cases. Its repeat cases C9 and C10 (B2 and B4 again) show only whether the result reproduces. They do not rule out a harness-side cause, because the follow-up uses the same harness. No harness-side cause has been identified.
- **G3, the backstop, Testing and every other blocker in §8 still apply.**

### Independent review of §9

Separate reviewer, `02-INDEPENDENT-REVIEW-ADDENDUM.md`, unmodified. **AGREE WITH CHANGES**: PARTIALLY VERIFIED overall is right, claims 4 and 5 are justified as VERIFIED, and no finding reverses a verdict. R1 to R10 are applied above: scope wording for 6a and 6b, the effect-only qualifier and the userAgent inference for claim 2, inference labels for the lock mapping, the skipped stage 1 gate, the refresh explanation and the missing offline check, the B2 wording, checksum precision, the query gaps and the implicit `kms:Decrypt`. The `aws-session.yml` trust-path check is still pending.

## Revision history

| When (UTC) | Change | Commit |
| --- | --- | --- |
| 13:41 | First draft, §1 to §8; project file only | - |
| about 14:00 | Independent review (`01`) applied; committed | in `d548533` (#47) |
| 16:20 | §9 added: results of the approved read-only reads; addendum review (`02`) applied | `d548533` (#47) |
| about 17:15 | Final corrections. Final verdict table in §1, with the pre-read text kept and labelled; §7 marked as performed; §8 rewritten for the §9 evidence; CloudTrail coverage and checksum-precision wording; B2 simulator-side and harness-side distinction. The final review is in `03-FINAL-REVIEW.md` | recorded in the PR and the index |

The original evidence in §2 to §7 and §9 is unchanged, apart from the wording corrections listed above.
