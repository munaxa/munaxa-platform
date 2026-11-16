# 02. Owner CloudShell procedure (plan only)

**Not run yet. Owner-operated. There is no apply in it.**

## 1. Before starting

- Sign in to the AWS console as root (MFA), region **Europe (Frankfurt) eu-central-1**, open
  CloudShell.
- Nothing else needs to be stopped or started. The plan reads AWS and the bootstrap state; it holds
  the state lock (S3 lock file) only while planning and releases it.

## 2. The one command (revision 2)

Revision 1 (commit `f005f84`, script SHA-256 `2712fd0a…062eef`) was run by the owner on 16 Nov
07:33 UTC. Step 1 passed (region, account, root caller, no lock, state object 2026-11-06 16:03:12,
aws:kms). It stopped at step 2 with `curl: (23) Failure writing output to destination`: CloudShell's
persistent home is 1 GB, too small for Terraform, the AWS provider and the clone. Nothing was
planned or applied. Revision 2 keeps every check and only moves the large files (Terraform, plugin
cache, `TF_DATA_DIR`, clone) to a private `mktemp -d /tmp/munaxa-d-b2.XXXXXX` directory on the
temporary disk, removes the partial download from the first run, and stops early when home has less
than 50 MB or the temporary disk less than 2 GB free (listing the largest items in home). The log,
saved plan, plan JSON and comparison files stay in `~/munaxa-d-b2`. Do not rerun revision 1.

```bash
mkdir -p ~/munaxa-d-b2 && curl -fsSLo ~/munaxa-d-b2/s.sh https://raw.githubusercontent.com/munaxa/munaxa-platform/3d0cdd121630d4f6bc80e8a741dce2d0d955ae58/docs/aws-migration/agent-reports/2026-11-15-identity-stage-e-d-b2-bootstrap/supporting/d-b2-plan-owner-cloudshell.sh && echo "67583797d469311c858d8b6a01faec951b7b0755cf04efd34145dd67bc4855e7  $HOME/munaxa-d-b2/s.sh" | sha256sum -c - && bash ~/munaxa-d-b2/s.sh 9752146f48f56972c72fd1808ce240300c2f1196
```

It takes a few minutes. The last line is either `D-B2 PLAN VERIFIED, NOT APPLIED <time>` or a line
starting with `STOP:`. Either way, paste `~/munaxa-d-b2/d-b2-plan.log` to the thread (it holds no
secret: addresses, actions, IAM statements, checksums). Keep `~/munaxa-d-b2`; the saved plan
`d-b2.tfplan` is in it.

## 3. What the script does, step by step (every check is a hard stop)

| Step | Action | Kind |
| --- | --- | --- |
| 0 | Refuses any pin other than `9752146…1196`; `umask 077`; working folder `~/munaxa-d-b2` (mode 700); full log | local |
| 1 | CloudShell region must be `eu-central-1`; `sts get-caller-identity`: account `229251310592`, ARN `arn:aws:iam::229251310592:root`; no `bootstrap/terraform.tfstate.tflock`; prints the state object's date, version and encryption | AWS read |
| 2 | Free-space checks; private temporary work directory for Terraform, provider cache, `TF_DATA_DIR` and clone; downloads Terraform 1.16.5, checks SHA-256 `2bc2fcff…aab5e4` (HashiCorp's published sum) | local |
| 3 | Clones `munaxa-platform`, checks out the pin detached, verifies HEAD; the bootstrap files changed since the last apply `9e45133` must be exactly the five of #130; provider lock hash and version 6.67.0 | local |
| 4 | `terraform init -reconfigure -lockfile=readonly` (stops on any migration prompt or lock-file change); `terraform test` (0 failed); 68 resources in state | AWS read (state) |
| 5 | Reads the live nonprod boundary and session-read policy documents; the cleanup policy must not exist; the nonprod deployer must have fewer than 10 managed policies | AWS read |
| 6 | Live policies must equal the reviewed code without the flag (normalized, statement by statement) | local |
| 7 | `terraform plan -var testing_session_cleanup=true -lock-timeout=60s -out=~/munaxa-d-b2/d-b2.tfplan`; summary exactly `Plan: 2 to add, 2 to change, 0 to destroy.`; no drift; `terraform show -json` | AWS read, saved plan |
| 8 | Exactly the four approved addresses and actions; no delete, no replace, no prod address | local |
| 9 | The two updates change only `policy` | local |
| 10 | Before and after policies equal the reviewed code; prints the added statements and the new policy; attachment on `munaxa-shared-deployer-nonprod`; every policy under 6,144 characters | local |
| 11 | SHA-256 of the saved plan and its JSON; no lock left | AWS read |

## 4. How the script was tested here (offline)

- `bash -n` clean; no `terraform apply` anywhere in the file.
- Steps 6 to 11 ran against a synthetic plan built from the offline renders of `9752146`: passes.
- Each of these mutations made it stop at the right check:
  - an extra prod policy update;
  - a replacement;
  - a `*:*` statement added to the boundary;
  - one extra action in `RefreshSessionCleanup`;
  - a policy name change;
  - `PassTheCleanupRole` widened to `*`;
  - the attachment on the prod deployer;
  - a changed "before" policy;
  - live drift.
- A pretty-printed live policy still passes, so formatting alone does not stop it.
- Steps 1 to 5 call AWS and could not run here; they follow the reviewed 6 Nov stage B2 script line for line where they overlap.

## 5. The apply (later, separate approval, not in this script)

After the owner approves the reviewed plan, Claude prepares a short apply script. It will:

- check that `d-b2.tfplan` still has the SHA-256 printed in step 11;
- run `terraform apply d-b2.tfplan`, the saved plan only, with no new plan and no `-auto-approve` on a fresh plan;
- then run `terraform plan -var testing_session_cleanup=true -detailed-exitcode`, which must exit 0.

Every later bootstrap plan or apply must also pass `-var testing_session_cleanup=true`. Without it, Terraform would remove these permissions.
