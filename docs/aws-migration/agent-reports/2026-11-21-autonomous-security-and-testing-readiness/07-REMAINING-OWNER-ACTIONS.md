# 07. Remaining owner actions

Only actions Claude is not authorised to take. None is needed for safety today: Testing is idle
and every image gate is fail-closed.

| # | Action | Why only the owner | When | Unblocks |
| --- | --- | --- | --- | --- |
| D-SSL | Nothing to decide now. Keep waiting for Alpine's fixed OpenSSL (3.5.10 due upstream 1 Dec). A time-bound Grype exception remains possible only by explicit owner approval; **not recommended** | exceptions need owner + expiry by rule | after 1 Dec, Claude checks and opens the bump PRs | every image, control#12, docs#181, docs#178 |
| Packages | GitHub Packages "Read" grant for identity, control, work on each `@munaxa/*` package | org/package settings | any time | drafts identity#19, control#9, work#32 (retire `PLATFORM_PACKAGES_TOKEN`) |
| O-8 | School ruleset (required checks) and CI on `main` pushes | branch protection changes are not authorised | any time | school merge safety |
| SC-06 | Decide what School's `render.yaml` staging blueprint should claim (it lists production domains) | may change a connected Render service | any time | School production readiness |
| R-RDS | Say yes to enabling the RDS restart stop: Claude prepares the bootstrap PR; then a root bootstrap apply and a stack apply | IAM, bootstrap and Terraform apply | any time before 28 Nov 10:45 UTC if wanted | bounds every auto-start to ≈ 2 h |
| O-4 / D-I1 | Publish Identity from `main` after D-SSL; approve the pin plan/apply | image publication, Terraform apply | after D-SSL | clean Identity image in Testing |
| A-5C, A-7, C-1, A-4C, C-2, A-9 | Control release, Cloudflare Access app, C-1 apply, Control bundles, C-2 apply, Control session and credential | publication, Cloudflare, secrets, apply, session | in that order (file 04 §1.4) | Control, then Docs licensing |
| A-3, A-5, A-4, A-6, D-1, Docs session | Docs bootstrap, release, bundles, Resend decision, pin apply, session | as above | file 04 §2.2 | Docs Testing |
| W-4 | Work tenant binding (`bootstrap-tenant`) in a Work session | session, data | after Work release | Work Testing |
| Budget | Raise or retire the legacy US$10 account budget (over; alerts only) | billing | any time | quieter alerts |
| 28 Nov | Nothing to do; Claude can run the read-only check in file 06 §2 if asked (the connector needs to be signed in) | AWS access | 22 Nov and after 22:00 UTC 28 Nov | rotation evidence |

## What Claude will do next without asking (repository only)

1. After 1 Dec: check Alpine for the fixed OpenSSL; when it exists, one pin-bump PR per product
   repository (file 02 §5), merge under the standing rule, then merge control#12, docs#181,
   docs#178.
2. W-3: the Work bundle custody script (the Docs and Control pattern) with offline tests.
3. Rebase the three package-token drafts once the grant exists.
