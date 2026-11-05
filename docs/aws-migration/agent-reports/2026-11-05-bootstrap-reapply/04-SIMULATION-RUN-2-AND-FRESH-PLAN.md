# Simulation run 2 and fresh nonprod G3 plan (5 Nov 2026)

Lead orchestrator. Labels: [V-aws] owner CloudShell output, [V-gh] GitHub workflow evidence.

## 1. Owner simulation, revision 2, run at 06:01 UTC [V-aws]

- **Script:** `evidence/b2-owner-simulation.sh`, fetched from main. Its sha256 check printed `OK` before it ran.
- **Account and key:** caller `arn:aws:iam::229251310592:root`, state key `679d1b6b-cb6a-491b-a585-cb630b3fbce5`.
- **Boundary split:** each boundary went in as 2 documents.
  - nonprod: 14 statements, 1,463 + 1,210 characters;
  - prod: 14 statements, 1,448 + 1,201 characters.
- **Result:** **`RESULT total=332 expected_match=332 unexpected_mismatch=0 expected_total=332 complete=yes`**, **exit 0**, with no `FAIL` line. The full output was pasted into the project thread.
- **First AWS evidence for these cases:**
  - every nonprod and prod boundary case (B01 to B14, BP01 to BP07, B07b, B08b, B08c), which covers H-1 in AWS;
  - D14.1, the default-VPC group protection;
  - the adoption of default security groups (D13.1, N75.1, N78.1, N79b.1);
  - N71.1 and N74.1 as explicit denies.

**Gate 4 (owner simulation, zero unexpected mismatches): MET.**

## 2. Fresh nonprod plan, run 41977870108 [V-gh]

- **What ran:** `aws-terraform.yml` was dispatched by the lead at 06:03 UTC on `main`, at `decd1dcff538bc1a884eaa019f13db609c25a2d2`, with environment nonprod and action plan. The owner approved it in `aws-nonprod`. Job 127080867999 succeeded at 06:04:40 UTC.
- **Role chain:**
  - OIDC to the CI role succeeded;
  - the job assumed `TF_VAR_deployer_role_arn = …/role/munaxa-shared/bootstrap/munaxa-shared-deployer-nonprod` with its path;
  - init and plan ran under the **narrowed #38 deployer**.
- **Plan:** **`64 to add, 0 to change, 0 to replace, 0 to destroy`**, and "No resource is updated or replaced".
- **Addresses:** the 64 addresses (`evidence/fresh-plan-run-41977870108-addresses.txt`) are **identical** to `2026-11-04-phase5/supporting/g3-expected-addresses.txt`. A sorted `diff` printed nothing.
- **Expected warning:** "plan does not match envs/nonprod.expected-changes.json (report only)". The declaration is not committed yet; committing it is the G3 approval PR.
- **No apply:** the step "Keep the saved plan" and the apply job were skipped. Nothing was applied, and no value was printed.
- **Caveat [E]:** a plan proves the deployer can read state and plan. It does not prove it may create each resource. The simulation covers those create permissions as policy decisions, and the G3 apply is the final proof.

**Gate 6 (fresh plan after the re-apply): MET. Gate 7 (matches the reconciled list): MET. Gate 12 (no production or destructive change): MET.**

## 3. Gates still open before G3 apply

| # | Gate | Status |
| --- | --- | --- |
| 5 | Residuals R1 to R20 fixed or accepted | Not met: owner decision D-2 |
| 8 | G6 DNS within 72 h | Not met: needs approval together with G3 |
| 10 | Testing shutdown safeguards | Not met: P1 and P2 are not merged (D-3, D-4). The next nightly run also gives the first real test of the session role variables |
| 11 | Product prerequisites | Partly met (`2026-11-04-phase6/05`) |
| - | G3 declaration PR and the separate G3 apply approval | Not started |

Met so far: gates 1, 2, 3, 4, 6, 7, 9 and 12. **G3 apply is not authorized.**
