# 04. Apply boundary, post-apply verification and the next owner authorization

**Terraform apply is NOT AUTHORIZED in this task. No apply was performed.**

## 1. Apply boundary

- Claude does not apply, does not use `-auto-approve`, does not run a workflow that applies, and does not change live IAM any other way.
- The apply may later use **only the saved plan** `~/munaxa-h20-iam/h20-iam.tfplan`, and only after:
  1. Claude has verified it (file 03 §4);
  2. the owner has given a **separate** yes that names its SHA-256.
- A fresh plan is never applied in its place. If the saved plan is lost, or Terraform calls it stale, the plan step is repeated and reviewed again.

## 2. Apply script (prepared, not authorized, not run)

`supporting/h20-iam-apply-owner-cloudshell.sh`, SHA-256 `23f0a6735d295f6a64b24415262f34f8043748d7fd2b8e25c75157931012a3bd`. Run as root in the same CloudShell:

```bash
bash h20-iam-apply-owner-cloudshell.sh 0f06836c06b2c76ab62699489e67e040a867b360 <reviewed saved-plan SHA-256>
```

**Before it applies, it checks:**
- that the last plan run in `h20-iam-plan.log` ended `PLAN VERIFIED` at that `PIN`, with no `STOP`;
- identity, region and lock;
- that the saved plan's SHA-256 equals the reviewed one;
- that `expected.json` and `norm.jq` are the plan script's;
- that the pinned clone has the four reviewed blobs and provider 6.67.0;
- that init runs without migration, and the state holds 70 resources.

**Then it runs** `terraform apply` on that saved plan file only. There is no `-auto-approve`, because a saved plan applies without a prompt and that plan is the reviewed one. There is no `-target`.

## 3. Post-apply verification (run by the apply script, then by Claude)

**By the apply script:**
1. The apply prints exactly `Apply complete! Resources: 0 added, 1 changed, 0 destroyed.`
2. A new plan with `-var testing_session_cleanup=true -detailed-exitcode` exits 0, meaning **no changes**, and the state still holds 70 resources.
3. The live boundary, session-read and session-cleanup policies equal the reviewed code after normalization. Session-read must contain `GateSessionCleanup` with exactly the two read actions on the two nonprod ARNs.
4. No lock is left behind; the saved plan is deleted. The last line is `H-20 IAM APPLIED AND VERIFIED`.

**Then by Claude, read-only through the connector:**

5. The session-read policy's default version is v4, with the same content. Prod policies are unchanged: `munaxa-shared-deployer-prod-*` are read and their default versions compared with today's.
6. CloudTrail shows only `CreatePolicyVersion` (and `DeletePolicyVersion` only if 5 versions existed; there are 3 today) on the nonprod session-read policy during the apply window.
7. The H-20 gate (connector, read-only) PASSes after a real R success. Tonight's R at 21:05 UTC clears `last_success_was_real`.
8. Optional, and only if the owner wants it: the workflow gate can be proven without a session through a dispatched `up`, but that is a session dispatch and needs its own owner decision. It is **not** part of this step.

## 4. The exact next owner authorization requests

**Now (this task):**

> Run the plan-only script in CloudShell (file 03 §2) and paste `~/munaxa-h20-iam/h20-iam-plan.log` to the thread.

**After Claude's verdict is PLAN VERIFIED** (a separate message, to be sent by the owner only then):

> Yes, apply the reviewed H-20 IAM saved plan `~/munaxa-h20-iam/h20-iam.tfplan` with SHA-256 `<the reviewed value>`, using `h20-iam-apply-owner-cloudshell.sh` at `0f06836`. Nothing else.

**Still separate after that, and not requested here:**
- arming P and S for a session;
- a Testing `up` dispatch;
- C-8G;
- Stage E.
