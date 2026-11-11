# Identity preflight run review (11 Nov 2026)

Scope: review of the owner's read-only preflight run of 11 Nov 2026, 05:43 to 05:45 UTC, in
CloudShell as root with `ALLOW_ROOT_READONLY=yes` (mode B). The script is the hardened one from
PR #80 (`main` `d9ecb2f`).

This review used the pasted output, the repository and GitHub Actions run metadata only:

- no AWS connector and no AWS API call;
- no Terraform, no workflow dispatch;
- no IAM, KMS, Secrets Manager, ECS, RDS, networking, DNS, Cloudflare or GitHub settings change;
- no merge.

Evidence: [`evidence/preflight-20261111T0543Z.txt`](evidence/preflight-20261111T0543Z.txt), the
full output as pasted.

Labels: **[V]** verified here, **[O]** owner action or decision required.

---

## 1. Verdict

**PREFLIGHT REVIEWED: 13 OF 14 CHECKS PASS. THE P-12 FAIL IS THE KNOWN, HARMLESS S3 TAG-READ
DENIAL. OWNER ACCEPTANCE REQUIRED.**

- 13 of 14 checks PASS, with no ERROR, so every check was read completely. The live state matches
  the code at `d9ecb2f` for everything P-1 to P-11b and P-13 cover.
- P-12 FAILs on 10 CloudTrail denials. All 10 are the same implicit `s3:ListTagsForResource` deny
  that Terraform's AWS provider tolerates on read. It was first recorded on 5 Nov (section 4). Every
  run that produced one succeeded.
- The script did what it should: it reported these denials and did not hide them. Accepting them is
  your decision, not the script's.

This is not an AWS-readiness verdict. G-4 must still be verified, and the Identity session requires
separate explicit owner approval.

## 2. Run integrity [V]

| Item         | Value                                                                     | Result                  |
| ------------ | ------------------------------------------------------------------------- | ----------------------- |
| Script       | SHA256 `21ae3205aa867df610bb27ee59f08325bf1adca1e8dabef5f147b8c21c159f7c` | equals PR #80 / `main`  |
| Download     | single file from `main`                                                   | as in §13.8             |
| Caller       | `arn:aws:iam::229251310592:root`, accepted only by `ALLOW_ROOT_READONLY=yes` | mode B, your decision of 10 Nov 11:33 UTC |
| Account      | `229251310592`, region `eu-central-1`                                     | PASS                    |
| Run time     | 2026-11-11 05:43:46 to 05:45:03 UTC                                       |                         |
| Result line  | `OVERALL: FAIL (1 check(s) failed)`, no ERROR                              | every check was read    |

Under root, IAM is bypassed. The PASS lines show resource state and policy documents, not what the
deployer roles are allowed to do (P-11b INFO line).

## 3. Checks that pass [V]

| Check | What the output shows                                                                                                                                                                                                                             |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P-2   | Database stopped, `db.t4g.micro`, not public, deletion protection on, single AZ, encrypted, parameter group `munaxa-nonprod-pg16` in sync, master secret active, VPC `vpc-0824ebbff902d2980`. Engine 16.13 (INFO)                                  |
| P-3   | Cluster ACTIVE with 0 running, 0 pending, 0 services; exactly the 4 Config A1 families, one ACTIVE revision each (`:1`); image digests as expected (Identity API `71d01fdf` in `identity` and `identity-bootstrap`, Valkey `757b7e55`, migrate `d175ef37`, PostgreSQL client `5983db9a`) |
| P-4   | Identity: 6 references pinned to `ad02f18e…`; migrate: `DATABASE_MIGRATION_URL` only, pinned to `a3cc6622…`; bootstrap: `DIRECT_DATABASE_URL` pinned to `a3cc6622…` plus the two owner references; db-admin: master secret and both pins                     |
| P-5   | Data key Enabled; both bundles not deleted, encrypted with the data key, pinned versions are `AWSCURRENT`                                                                                                                                          |
| P-6   | No leftover `munaxa-nonprod/identity-bootstrap` secret, including ones scheduled for deletion                                                                                                                                                       |
| P-7   | Nothing running and nothing billable: 0 services, tasks, load balancers, target groups, NAT gateways, Elastic IPs, instances, public ENIs                                                                                                          |
| P-8   | 11 of 11 backstop schedules enabled; the database stop runs at 21:00 UTC on `munaxa-nonprod-pg`                                                                                                                                                   |
| P-9   | Certificate ISSUED, covers `*.test.munaxa.com` and `operator-test.munaxa.com`, not in use, valid to 22 May 2027. The two identical `SANs =` lines are two separate checks, one per name, printing the same list                                     |
| P-10  | API and migrate digests are tagged `5277d71`, the release SHA                                                                                                                                                                                      |
| P-11  | Both service-linked roles exist (the session deployer cannot create them)                                                                                                                                                                         |
| P-11b | Both session roles: path, ARN, 3600 s, no boundary, trust, exact inline and attached sets; all 30 + 1 + 4 + 2 statements equal the code; the state key alias matches                                                                               |
| P-13  | VPC, 5 subnets, internet gateway attached, S3 endpoint on the public table only, 3 route tables with exact associations, active default route to `igw-01c51c4963afa87fb`, exact Config A1 security groups, default group without rules            |
| P-12 us-east-1 | 322 events, 0 denials                                                                                                                                                                                                                    |

## 4. P-12: the 10 eu-central-1 denials [V]

All 10 are `s3.amazonaws.com ListTagsForResource AccessDenied`, two per run, from five GitHub
Actions runs in `munaxa/munaxa-platform`:

| Run           | Time (UTC)     | Workflow              | Trigger            | Role                                       | Conclusion |
| ------------- | -------------- | --------------------- | ------------------ | ------------------------------------------ | ---------- |
| `42766116306` | 10 Nov 06:05   | AWS Terraform         | your dispatch      | `munaxa-shared-deployer-nonprod`           | success (A1 plan, 22/0/0/0) |
| `42766582624` | 10 Nov 06:09   | AWS Terraform         | your dispatch      | `munaxa-shared-deployer-nonprod`           | success (A1 apply)          |
| `42766964719` | 10 Nov 06:13   | AWS Terraform         | your dispatch      | `munaxa-shared-deployer-nonprod`           | success (post-apply plan, no changes) |
| `42785877006` | 10 Nov 08:51   | AWS Testing session   | nightly schedule   | `munaxa-shared-deployer-nonprod-session`   | success     |
| `42928482147` | 11 Nov 00:05   | AWS Testing session   | nightly schedule   | `munaxa-shared-deployer-nonprod-session`   | success     |

- The first three are the Config A1 plan, apply and post-apply runs recorded in
  `2026-11-10-identity-config-a1-continuation/01-REAL-PLAN-AND-APPLY.md`.
- The last two are the scheduled evening `down` runs of `aws-session.yml` (crons `17 19 * * *`
  and `47 1 * * *`, started late by GitHub, as the workflow comment notes). They run Terraform to
  keep the session resources down. P-7 confirms nothing is running.
- **Cause.** When Terraform's AWS provider (6.67) reads the stack's S3 buckets
  (`stack/storage.tf:41`, two buckets in this environment), it calls S3 `ListTagsForResource`.
  Neither deployer policy allows `s3:ListTagsForResource` (`bootstrap/iam_allow.tf:462-466`,
  `bootstrap/iam_session.tf:273-274`), so it is an implicit deny. The provider tolerates it and
  continues; the bucket tags are readable through `s3:GetBucket*`, which both policies allow. Two
  denials per run matches the two buckets. That the provider falls back to the older tag read is
  inferred from the observed behaviour (every run succeeded, and on 5 Nov the buckets reached state
  with their tags), not from the provider source.
- **Already known.** The same denial was recorded in the G3 recovery on 5 Nov
  (`2026-11-05-g3-failed-apply-recovery/00-G3-FAILED-APPLY-RECOVERY.md:103`: "tolerated by the
  provider on read; buckets reached state"). The phase 5 independent review
  (`2026-11-04-phase5/06-INDEPENDENT-REVIEW.md:578`) noted it is missing for the full deployer too,
  so it is not a session regression.
- **No other denial.** No other service, action or caller appears. Root made no denied call.

**Why the script reports FAIL.** P-12 counts every denial, by design, and has no list of accepted
ones. That is correct: accepting a denial is an owner decision, and the script has no way to know
which ones are harmless.

**What it means for the session.** The session's `up` and `down` runs will produce the same two
denials per run, and step 23's after-session CloudTrail check will list them again. Any other
denial, or this one from a different caller or for a different action, is still a stop condition.

## 5. Decision required [O]

**D-1. Accept the `s3:ListTagsForResource` denials as known and harmless.** If you accept:

- this P-12 result counts as a PASS for this run only for the 10 events listed in section 4;
- the same denial, two per run, from the two deployer roles, in later runs and in step 23, is
  read the same way;
- nothing is changed: no IAM policy, no script.

If you do not accept it, the preflight stays FAIL and the session should not start.

> **Decided 11 Nov 2026, 05:54 UTC: accepted.** The owner chose "Accept as known" on the decision card
> in the project thread. P-12 counts as passed for this run for the 10 events in section 4. No IAM or
> script change follows. Any other denial remains a stop condition.

## 6. Owner actions still open [O]

1. ~~**D-1** above.~~ Done: accepted 11 Nov 05:54 UTC.
2. **G-4:** verify the GitHub environment protection in the GitHub UI (Claude cannot read it).
3. **Session approval:** the Identity session needs your separate explicit approval.

## 7. No AWS changes

This review made no AWS call and did not use the AWS connector. It read GitHub Actions run metadata
only. It did not run Terraform, dispatch a workflow, change any AWS, DNS, Cloudflare or GitHub
setting, or merge anything. The only changes are this report, its evidence file and the README
index line.
