# 09. Remaining blockers, in priority order

| # | Blocker | Blocks | Owner of next step | Evidence / next action |
| --- | --- | --- | --- | --- |
| B-1 | **D-SSL**: no OpenSSL 3.5.10 in any Alpine branch (checked 21 Nov 16:16 to 16:40 UTC); 5 HIGH on 3.5.9-r1 in every product image | Every image publication, therefore every Testing deployment | Alpine upstream, then Claude | File 05. Claude re-checks pkgs.alpinelinux.org v3.24/main and edge; then file 05 §4 |
| B-2 | control#14, control#12, docs#181, docs#178 fail only the required image scan | Control images (need #14), Docs runbook correction | Claude after B-1 | File 06 |
| B-3 | IAM Identity Center not set up | Engineering-based custody runs (root still works as the approved interim method) | Owner (file 08 items 1, 2) | `infra/aws/identity-center/README.md` |
| B-4 | Docs bootstrap (`munaxa-docs/migrate` repository) not applied | Docs migrate image push (Session 2 step 5) | Owner, root (file 08 item 3, 3a) | File 04; corrected declaration 2/3/0 |
| B-5 | Control and Docs bundles empty | Apply 2 (needs their version ids) | Owner (items 4, 5) | File 03 |
| B-6 | `OPERATOR_CIDRS` unset | Control operator console in the Control session | Owner, at Session 2 step 8 | File 07 |
| B-7 | Docs Control credential not issued | Docs licensing (Session 2 step 10, 11) | Owner, during the Control session | File 07 |
| B-8 | AWS connector sign-in expired | Claude's read-only checks only (none was needed for this task) | Owner: re-sign it in, ideally as `MunaxaReadOnly` after item 1 (O-IAM-6) | Connector refused at ~16:27 UTC before any AWS call |
| B-9 | Production separation in one account (ACCESS-POLICY F-6) | Any **Production** deployment (not Testing) | Owner decision later (member accounts or a reviewed Production permission set) | File 01 §1 |
| B-10 | School `SCHOOL_LOCAL_AUTH` decision (school#29), GitHub Packages grant | Work/School later; not this deployment | Owner | Sprint report |

Not blockers any more: the Cloudflare Access application (optional since platform#154), the
Docs bootstrap's private `terraform.tfvars` (the plan script reads the budget addresses itself), the
operator-access pack's "Docs bootstrap as Engineering" (corrected to root).

Risks to watch:
- The Docs bootstrap live state could differ from a04723a (the script stops; Claude investigates).
- The v3.24 package pages showed inconsistent revisions for `libssl3`/`libcrypto3`; when 3.5.10
  appears, the bump PR's CI build is the authority (exact pins fail if either package is missing).
- RDS automatic restart about 28 Nov 10:45 UTC: the 21:00 UTC backstop and scheduled `down` stop it
  the same evening (cost of a few hours of RDS).
