# AWS execution backlog and task ledger: Munaxa Testing

As of 30 Oct 2026, 14:10 UTC. Compiled by Agent 7 from owner reports and GitHub. Status values:
**done** (merged or verified), **open** (PR open), **todo** (no PR yet), **owner** (waits for
Tamer), **blocked**. Agent 1 filed no report, so its rows come from the reviewer's audit.

## Task ledger

| # | Task | Owner | Repo / PR | Status | Depends on |
| - | ---- | ----- | --------- | ------ | ---------- |
| T01 | Identity `TRUST_PROXY_HOPS` support | Agent 3 | identity#2 (`9aa4dc1`) | done | – |
| T02 | Set `TRUST_PROXY_HOPS=1` on the identity service | Agent 1 | platform | done (platform#26 `c4a1ad0`) | T01 |
| T03 | Work first-tenant runbook | Agent 5 | work#26 | done | – |
| T04 | Pin Work ECR actions by SHA (R-07) | Agent 5 | work#27 | done (verified) | – |
| T05 | Pin ECR actions by SHA in Identity, Control, School (R-07) | Agents 3, 2, 6 | identity#3, control#6, school#22 (verified on main) | done | – |
| T34 | Pin Docs publish actions by SHA (R-07b) | Agent 4 | docs | todo | – |
| T06 | School storage via task role, 503 in production | Agent 6 | school#21 (`c6ddd5a`) | done | – |
| T07 | School bucket, CORS, task role, `AWS_S3_BUCKET`, S3 endpoint admission | Agent 1 | platform | done (platform#26 `c4a1ad0`) | T06 |
| T08 | Control portal downloads carry Access token; offline pnpm in migrate | Agent 2 | control#6 (`739be21`) | done | – |
| T09 | Docs publish uses `PLATFORM_PACKAGES_TOKEN` | Agent 4 | docs#167 | open | – |
| T10 | Docs image and boundary model (R-01) | Agent 1 | platform#26 boundary `MunaxaDocsImagesPullOnly` | done (platform#26 `c4a1ad0`) | – |
| T11 | Docs Testing service set, bucket, bundles, `docs-db-admin` | Agent 1 | platform (`stack/docs.tf` per contract) | done (platform#26 `c4a1ad0`) | T10 |
| T12 | `prevent_destroy` on the licence KMS key (R-04) | Agent 1 | platform | done (platform#26 `c4a1ad0`) | – |
| T13 | `OPENAPI_ENABLED=false` on work-api (W3) | Agent 1 | platform | todo | – |
| T14 | Budget alert as second backstop to the evening session-down cron (R-09) | Agent 1 | platform | done (platform#26 `c4a1ad0`) | B2 decision |
| T15 | ALB forwards only the public Control surface; rule 21 refuses the rest (Control C4) | Agent 1 | platform#26 `875083a` | done (platform#26 `c4a1ad0`) | – |
| T16 | Remove stray empty root files (R-11) | Agent 3 | identity#3 | done | – |
| T17 | SVG branding uploads served as attachment (R-10), plus R-07 pins | Agent 6 | school#22 | done | – |
| T18 | Stale Dockerfile header on signing key (R-12) | Agent 2 | control | todo | – |
| T28 | Presigned PUT signs no SSE header (uploads failed) | Agent 6 | school#23 (`54cf3eb`) | done | platform#26 bucket default SSE-S3 |
| T29 | School mobile sets Content-Length on presigned uploads (R-15) | Agent 6 | – | todo, outside Testing | – |
| T19 | Write `SHARED-CONTRACT.md` | Agent 1 | shared folder | done (14:01 UTC) | – |
| T20 | Decide the scope of the US$50 target (B2) | Tamer | – | owner | – |
| T21 | G2 bootstrap as root | Tamer | – | owner | T10 |
| T22 | G3 persistent layer apply (`aws-nonprod`) | Tamer | – | owner | T21, T02, T07, T12 |
| T23 | G4 secret values | Tamer | – | owner | T22 |
| T24 | G5 images for all products | Tamer | – | owner | T21, T06, T08, T09 |
| T25 | G6 Cloudflare DNS and Access app | Tamer | – | owner | T22 |
| T26 | G7 first session, db-admin, migrations, smoke | Tamer | – | owner | T23 to T25 |
| T30 | Protect munaxa-control `main` | Tamer | GitHub settings | owner | – |
| T31 | Identity operator roles with `control:*` (seed script + runbook) | Agent 3 | identity#3 (`594003f`) | done (code); owner run in step 10 | – |
| T32 | Run the operator org and role steps; set org id and subjects by PR | Tamer | runbook | owner, after first migrate | T26, T31 |
| T33 | One-run secret for the bootstrap password (R-16) | Agent 1 | platform#26 `cfb01ee` identity-bootstrap task | done (platform#26 `c4a1ad0`) | – |
| T27 | Re-authenticate the AWS connector | Tamer | – | owner | – |

**G9 is closed:** Render, Supabase and the old Docs stack stay.

## Merged this phase (baseline, verified on main 10:51 UTC)

platform#24, #25; control#4, #5; identity#1, #2; work#24, #25, #26; school#18, #19, #20, #21;
docs#163 to #166.
