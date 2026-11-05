# Independent review: evidence recovery for the second bootstrap re-apply

- **Reviewed:** `EVIDENCE-RECOVERY-REPORT.md` (177 lines, file time 13:41:26 UTC, 5 Nov 2026), read in full.
- **Reviewer:** independent subagent. Review done 5 Nov 2026, from about 13:45 UTC.
- **Scope, read-only:** no AWS call or credential, no Terraform, no GitHub write. CanteenHub, Render and Supabase were not inspected or touched.
- **Sources I used:**
  - Local clone `/home/claude/munaxa-platform`. The local `main` branch is stale (at `7cd448d`), so I read `origin/main` at `6ab69d1`. The checked-out branch `claude/project-thread-22wpu4` (`6e0bbe9`) has no diff against `origin/main`.
  - GitHub REST through the MCP tools and `gh api`: runs 41977870108 and 41943924455, their jobs and artifacts, the 30 most recent runs, and PRs #42 to #46.
  - I did not read the project chat. I did not check E1, E2 or E11 against the chat messages themselves.

## Verdict

**AGREE WITH CHANGES.**

These headline verdicts are sound and I re-derived them from primary sources:
- second re-apply **NOT VERIFIED**;
- plan, apply text and post-apply plan **unrecoverable from current sources**;
- B2 **`ROOT CAUSE UNRESOLVED — REMAINS BLOCKED`**;
- the correction of the brief's "19/5/0".

What needs fixing:
- one verdict is overclaimed (6a "VERIFIED");
- the report contradicts itself on the `-allow` offsets;
- the 23-character explanation is stated more strongly than the evidence supports;
- the proposed AWS reads O-1 and O-2 have concrete gaps: the lock-file objects, an incomplete event list for claim 5, and "substitutes for claims 2 and 5".

## Findings

### F1 (Medium-High): 6a "VERIFIED" overclaims what the evidence supports

**Location:** §3 row 6a ("**VERIFIED** for the names preflight checks"), and E3 "Proves".

**What I checked:** `b2-owner-simulation.sh` lines 61 to 151 on `origin/main` (sha256 `12cd2ca7…6e22b`, confirmed, and identical at `f409459`), plus the owner's pasted `RESULT` line (`second-bootstrap-reapply/04` line 15).

The logic of the inference is correct. `complete=yes` is printed only at line 691, after the preflight. Any preflight failure exits 2 with `total=0 … preflight=failed` (lines 55 to 58). But the claim is narrower than "VERIFIED" suggests:

1. **The evidence is owner-supplied.** It is pasted text [O-ev] from a run nobody re-ran independently, and the TSV itself was never supplied. By the report's own labels, the strongest honest wording is "evidenced by owner-supplied output (indirect)", not VERIFIED.
2. **Presence only.** `expect_attached` and `expect_inline` (lines 71 to 92) use `grep -qx` for each expected name inside the returned list. Extra attached or inline policies would still pass. That does not establish "as on 5 Nov" (row 6a's Expected column), which implies the set is exactly the same.
3. **Names only.** `list-attached-role-policies` returns `PolicyName`, not the ARN or path, so a policy with the same name on a different path would also pass.
4. **Coverage is narrower than E3 says.** E3 says "the managed and inline attachments on the 3 deployers and the session CI role". For `munaxa-shared-ci-nonprod-session`, only the inline `assume-own-session-deployer-only` is checked (line 92); no managed policy on it is checked. The CI roles `munaxa-shared-ci-{nonprod,prod}` and the publisher role are not checked at all.
5. **It shows the state at simulation time** (about 10:10 UTC). It does not show what the apply did. The expected 0/5/0 plan changes no attachment anyway, so this item says little about the re-apply itself.

**Correction:**
- Change 6a to "**EVIDENCED [O-ev, indirect]**: the named attachments were present at about 10:10. Presence only, names only. Extra attachments, the CI and publisher roles, and the session CI role's managed policies are not covered."
- Fix the E3 wording ("inline policy on the session CI role", not "managed and inline").

### F2 (Medium): self-contradiction on the `-allow` offsets in 6b

**Location:** §3 row 6b: "E4 (two Sids evaluated, **at the offsets the render predicts**)". Compare §2: "The `-allow` statement offsets reported in E4 are 23 characters below the compact render".

**What I checked:**
- `summary.tsv`: B4, B5, B6 and B10 give `-allow@L1C4806`; B8 gives `-allow@L1C4742`; B10 gives the inline policy at `C4573`.
- `next-diagnostic/01` §1 lines 53 to 64, and `03` finding F2: the render predicts 4829 and 4765.
- All five files match `SHA256SUMS` (`sha256sum -c`: OK).

Only the inline `NeverTheOtherEnvironmentByName` lands at the rendered offset. `NoLogOrDatabaseData` is identified **by elimination, not by column** (`01` §1).

**Correction:**
- 6b should read: "E4: `NoLogOrDatabaseData` decided B4, B5, B6, B8 and B10 by elimination [O-ev + V-repo + L]. Its column is 23 characters off the render. `NeverTheOtherEnvironmentByName` is at the rendered column."
- The E4 "Proves" cell should also say "by elimination".

### F3 (Medium): the "Version key-order" explanation is labelled as inference but asserted too strongly

**Location:** §2 "Likely cause [L, E]. **The cause is now very likely found** … the render gives the reported offsets exactly". §4: "It **explains** the column offsets."

**What I checked:**
- `len('"Version":"2012-10-17",') = 23`. The arithmetic is right.
- `infra/aws/bootstrap`: both the managed `-allow` policies (`iam_allow.tf` line 474) and the inline `deployer` policy (`iam.tf` line 491) come from the same `data.aws_iam_policy_document … .json` renderer.

Why "very likely" is not supported:
- **The match is not discriminating.** Moving `Version` after `Statement` shifts every statement by exactly −23. So *any* 23-character shortening before `NoLogOrDatabaseData`, in both environments, fits "exactly", including a content difference.
- **There is no mechanism.** Both documents come from the same renderer, yet the hypothesis needs the managed text to have a different key order while the inline text does not. The report names no mechanism (IAM storage, provider normalisation, or simulator serialisation) that would treat managed and inline documents differently. Nothing in the repository or the owner output supports one.
- **The span check is narrow.** The span match (5154 − 4806 = 348, review `03` F2) supports only that statement's own length.

**Correction:**
- Replace "The cause is now very likely found" with "One candidate explanation [E, unconfirmed]".
- State that a 23-character content difference before the statement is not excluded, and that if it held, it would weaken 6b.
- In §4, change "It explains the column offsets" to "it may explain".
- Also note that O-3 shows the key order *as `GetPolicyVersion` returns it*. That may not be the text the simulator uses for its columns, so O-3 settles content equality but may not settle the offset cause by itself.

### F4 (Medium): §1 "PARTIALLY VERIFIED" wording conflates the end state with the act

**Location:** §1: "So the re-apply is **PARTIALLY VERIFIED** for 'the intended policy markers are live' only."

Sid markers present at 10:10 show an end state. They do not show that the `6b8997a` plan, and only that plan, was applied. The same markers would be present after a partial, manual or differently-pinned change, as long as it introduced those Sid strings. Calling the *re-apply* partially verified sits awkwardly next to the headline "NOT VERIFIED" and the matrix "Overall NOT VERIFIED". The evidence is also [O-ev] pasted text (see F1).

**Correction:** "The re-apply is NOT VERIFIED. Separately, owner-supplied output [O-ev, indirect] shows that the intended Sid markers and the named attachments were present at about 10:10 UTC."

### F5 (Medium): O-1 lists the lock-file objects without telling them apart, and misses evidence they hold

**Location:** §7 O-1.

**What I checked:** `infra/aws/bootstrap/backend.tf` has `use_lockfile = true` and key `bootstrap/terraform.tfstate`. The runbook (`phase7/08` line 139) names `bootstrap/terraform.tfstate.tflock`.

`--prefix bootstrap/terraform.tfstate` also matches `bootstrap/terraform.tfstate.tflock`. The query prints no `Key`, so lock-file versions show up mixed in with state versions and cannot be told apart. The `get-object --key bootstrap/terraform.tfstate --version-id <tflock-version>` step would then fail or confuse.

The lock-file versions and their **delete markers** are also useful evidence that the report does not use. Each locking Terraform operation (plan, apply, post-apply plan) creates and then deletes the lock object. Their times would corroborate that a plan, an apply and a post-apply plan *occurred*, and in what order. They would not show the results.

**Correction:**
- Add `Key` to the query and query `DeleteMarkers` as well. For example: `--query '{v:Versions[?LastModified>=`2026-11-05T00:00:00Z`].[Key,VersionId,LastModified,Size,IsLatest],d:DeleteMarkers[?LastModified>=`2026-11-05T00:00:00Z`].[Key,VersionId,LastModified]}'`.
- Fetch state only for `Key == bootstrap/terraform.tfstate`.
- Add the lock-object timeline to what §6 says is "partly recoverable" for claim 3 (occurrence only).

### F6 (Low-Medium): O-1 counts cannot be compared with the runbook baseline

**Location:** §7 O-1 Python one-liner, and §3 claim 5.

`len(d['resources'])` and the instance sum both include `mode == "data"` entries. The runbook baseline is "68" managed **instances** (`terraform state list | grep -vc '^data\.'`, `phase7/08` line 72, 49 + 19). The printed numbers will not equal 68, and could be misread as a change.

**Correction:**
- Also print `sum(len(r['instances']) for r in d['resources'] if r['mode']=='managed')`, and compare that with 68.
- Prefer streaming to stdout (`… /dev/stdout | python3 -I -c …`), or delete `/tmp/st-*.json` afterwards, so that whole state files are not left in CloudShell.
- "which root may use" for the state KMS key is an assumption [E]. It is consistent with root running the Terraform init and apply against this backend, but nothing has verified it.

### F7 (Medium): O-2 is not complete enough to support claim 5, and "substitutes for claims 2 and 5" overclaims

**Location:** §7 O-2, and "That substitutes for claims 2 and 5."

**What I checked:** the bootstrap resource types (`grep '^resource' infra/aws/bootstrap/*.tf`). Besides IAM, it manages `aws_budgets_budget` (2), `aws_ecr_repository` and its lifecycle policy, `aws_kms_key` and `aws_kms_alias`, and six `aws_s3_bucket*` resources. The runbook (`phase7/08` line 32) also rules out role trust, CI and publisher changes.

The event list misses changes that would break "nothing else changed":
- IAM: `UpdateAssumeRolePolicy`, `PutRolePermissionsBoundary`, `DeleteRolePermissionsBoundary`, `UpdateRole`, `TagRole`, `UntagRole`, `TagPolicy` and `UntagPolicy`;
- every non-IAM write (Budgets, ECR, KMS, S3 bucket configuration).

An event-name allow-list proves only that the listed calls were absent.

**Correction:**
- Use `--lookup-attributes AttributeKey=ReadOnly,AttributeValue=false` in **us-east-1** (IAM, and Budgets, whose events are also logged there) and in **eu-central-1** (ECR, KMS, S3 control plane). Print `EventTime`, `EventSource`, `EventName`, `Username` and the resource names.
- us-east-1 should be the primary IAM run, not "repeat". For IAM the eu-central-1 loop as written returns nothing useful.
- Optionally, filter `Username=root` with ReadOnly=true to see the read clusters of the plan and refresh (occurrence only).
- Reword "substitutes" as "independently corroborates which write calls were made, and that no others were". CloudTrail cannot reproduce Terraform's `Apply complete!` line or its counts, and S3 state writes are data events that `LookupEvents` does not record.

### F8 (Low): O-3 omits the documents that should not have changed

**Location:** §7 O-3.

To support "nothing else changed" for policies, also read:
- `get-policy` `UpdateDate` (or `list-policy-versions` `CreateDate`) for `-allow-tagged` ×2, `-read` and `-session-read`, which should all predate 08:51;
- `get-role-policy` for the inline `deployer` policies.

For the five changed documents, `list-policy-versions` `CreateDate` gives a cheap timestamp for the apply inside the 08:51 to 10:10 window. All of this remains read-only.

### F9 (Low): the time-window reasoning is weaker than stated

**Location:** §2 "Time window [E] … most likely after 09:33, because the runbook downloads the simulation script from main (runbook line 119)".

**What I checked:** line 119 is step 9, the simulation, which runs *after* the apply. PR #44, which carries the runbook, was open from 08:54:20 UTC (REST `pulls/44`). So only the *simulation* must be after 09:33. The apply could have been run from the PR's copy of the runbook between 08:54 and 09:33.

**Correction:** "the simulation ran after 09:33; the apply lies between 08:51 and the start of the simulation". O-1, O-2 and F5 would pin the time.

### F10 (Low): a supporting fact for E2 is missing, and E2's integrity note is incomplete

**Location:** E2 "the pasted run is not hash-bound".

The pasted `RESULT` line ends with `results=/tmp/p7/simulation-rev3.tsv`, which is exactly runbook step 9's invocation (`phase7/08` lines 119 to 122). That invocation runs the script only after `sha256sum -c` passes.

**Correction:**
- Add: "the results path matches the runbook's hash-gated invocation [E]; this also shows `/tmp/p7` existed at about 10:10 and was lost afterwards".
- It is still not proof that the hash check ran.

### F11 (Low): a stale mislabel in the repository is not flagged

**Location:** §2 "Stale, contradictory or duplicate evidence", and E9.

`2026-11-05-second-bootstrap-reapply/00-EXECUTIVE-RESULT.md` line 39 (merged in `0e379d5`) labels the owner's statement that the re-apply was done as **[O-ev]**. It is [O-rep], as this report and `next-diagnostic/02` correctly say.

**Correction:** list it as stale or contradicting labelling in E9 and §2, so that nobody cites that row as AWS output.

### F12 (Low): the D30.1 wording in §4 is misleading

**Location:** §4 "Still unknown" item 1: "No revision 3 case tests this except D30.1".

Review `03` F4 says that D30.1 is the **stream form and uninformative**, so the lone-managed-Deny hypothesis is **untested** by revision 3.

**Correction:** "No revision 3 case tests this. D30.1 is the stream form and is uninformative (`03` F4)."

### F13 (Low): passive evidence still to come is not mentioned

**Location:** §6 and §8.

Runbook `phase7/08` §4 line 132 makes the next scheduled `aws-session.yml` run a post-apply check: it must assume `munaxa-shared-ci-nonprod-session`, then `munaxa-shared-deployer-nonprod-session`, without AccessDenied.

The only scheduled session run on 5 Nov so far is 41943924455 at 00:47 UTC, before both re-applies. The session crons run 19:00 to 03:00 UTC. The next run's log will be GitHub evidence [V-gh] that needs no AWS call or approval. It covers the session trust and policy path only, not the counts.

**Correction:** add it to §6 and §8 as a pending, no-approval source.

### F14 (Low): provenance and metadata details

- **Truncated message ids.** E1 and E2 cite "cmsg …YNJCkaPjBg74ug7jpvkmsm" and "cmsg …2WFNk2owvewc1DnRvGcLGs". Give the full ids so they can be re-checked. I did not check them against the chat.
- **E11 label.** E11 is labelled [O-rep] with "checked for the lead". Say who checked and label it as a negative search result, not as an owner statement.
- **Phase 6 label.** §1's Phase 6 figures (19 added, 4 changed, about 05:15 UTC) carry no label. They are correct: `2026-11-05-bootstrap-reapply/00` lines 12 and 33, and `evidence/run1-cloudshell-apply-and-simulation.txt` line 56 [V-repo, from owner-pasted O-ev].
- **Header end time.** The header gives "13:40 to about 14:15 UTC", but the file was written at 13:41 UTC, so the end time is a projection.

## What I independently confirmed

**Commits.** All match the report.

| Commit | Committed (+03:00) | UTC | Notes |
| --- | --- | --- | --- |
| `6b8997a` | 11:51:42 | 08:51:42 | PR #43 merged 08:51:43; head `744c67c`. Bootstrap tree `b83d107…` at both. `46dfbd9..6b8997a` diff stat "4 files changed, 225 insertions(+), 67 deletions(-)". No bootstrap change since, up to `origin/main` |
| `f409459` | 12:33:09 | 09:33:09 | PR #44 merged 09:33:10; head `18f8c9a`, opened 08:54 |
| `0e379d5` | 13:41:30 | 10:41:30 | PR #45; head `2d0a337` |
| `6ab69d1` | 16:29:45 | 13:29:45 | PR #46; head `6e0bbe9` |
| `decd1dc` | | 05:50 | |
| `d734ae9` | | 21:49, 4 Nov | |
| `46dfbd9` | | 12:05, 4 Nov | |

PR #42: head `fb6f095`, opened 06:21:31 UTC, merged 06:32:02 UTC as `7cd448d`.

**Workflow runs.**
- **Run 41977870108:** AWS Terraform, `workflow_dispatch`, head `decd1dc`, 06:03:23 to 06:04:42 UTC, success, 0 artifacts. The plan was 64 creates (`bootstrap-reapply/04` line 28; the addresses file has 64 lines).
- **`aws-terraform.yml` line 17:** "Bootstrap (infra/aws/bootstrap) is never run here".
- **Run 41943924455:** AWS Testing session, `schedule`, head `d734ae9`, 00:47:25 UTC. Job 126971301674 "Testing down" succeeded, with init, plan, start, apply and stop skipped.
- **Runs after 06:04, to 13:29 UTC:** only `pull_request` and `push` CI and AWS Terraform runs. No dispatch and no schedule. In the AWS Terraform PR run checked (42010917998), the Plan and Apply jobs were skipped.

**Phase 6 versus Phase 7.**
- The runbook `phase7/08` line 18 and step 6 (line 80) expect `0 to add, 5 to change, 0 to destroy`, with the five `policy` addresses (same as `expected-reapply2-changes.txt`).
- Phase 6 at `46dfbd9` was 19 added, 4 changed, 0 destroyed, in `~/p6`. Its expectation was 19 add and 6 change, 4 of them real.
- The brief's "19/5/0" matches neither. The report keeps E12 (`~/p6`) correctly excluded.

**Hashes.**
- `b2-owner-simulation.sh`: `12cd2ca7…6e22b`.
- `b2-followup-diagnostic.sh`: `83bdb7ac…f6d6`.
- `reapply-evidence-print.sh`: `794a6c28…3eff`. Its `NO-EVIDENCE: $D does not exist` message is at line 9.
- `diagnostic-1-results/SHA256SUMS`: all five files OK.

**Owner-reported statements.** No owner-reported statement is called verified. E1 and claim 2 are correctly [O-rep] or NOT VERIFIED.

**B2.**
- `B2.json` has `EvalDecision: implicitDeny`, `MatchedStatements: []` and an empty `EvalDecisionDetails`. In the same run, B4, B5, B6, B8 and B10 matched `-allow`.
- Pre-established row 8 is triggered by B2 alone.
- Nothing in the repository or the owner files explains why the unconditioned `NoLogOrDatabaseData` Deny on `*` did not match.
- The report correctly states that B2 is unresolved and that no hypothesis is confirmed. The one exception is the offset wording in F3.

**The AWS reads.**
- O-1 to O-3 are read-only: `s3api list-object-versions` and `get-object`, `cloudtrail lookup-events`, `iam get-policy`, `get-policy-version` and `get-role-policy`, plus local Python.
- The bucket `munaxa-shared-tfstate-229251310592` and key `bootstrap/terraform.tfstate` match `backend.tf`.
- The policy ARNs (`policy/munaxa-shared/bootstrap/munaxa-shared-deployer-{env}-allow`, `policy/munaxa-shared/munaxa-shared-workload-boundary[-prod]`) and the role `munaxa-shared-deployer-nonprod-session` with inline `session-deployer` match `iam.tf`, `iam_allow.tf` and `iam_session.tf`.
- IAM events in us-east-1 is correct.

**Excluding a new `terraform plan`** is reasonable under the brief. It would be new evidence, not recovered evidence, and the report says so.
