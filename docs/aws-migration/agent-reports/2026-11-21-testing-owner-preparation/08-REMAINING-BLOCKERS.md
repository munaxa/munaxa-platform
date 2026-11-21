# 08. Remaining blockers, risks and rollback

| # | Blocker | Blocks | Next step owner | Status / next action |
| --- | --- | --- | --- | --- |
| B-1 | **D-SSL**: no OpenSSL 3.5.10 in Alpine v3.24 or edge (19:09 UTC, 21 Nov); 5 HIGH on 3.5.9-r1 | every image publication, so every Testing deployment | Alpine upstream, then Claude | file 04 §3 |
| B-2 | control#14, control#12, docs#181, docs#178 fail only the required image scan | Control images (need #14); Docs runbook fix | Claude after B-1 | file 05 |
| B-3 | IAM Identity Center not set up | Engineering custody runs (root still works) | Owner (file 07 items 1-2) | README |
| B-4 | Docs bootstrap not applied (`munaxa-docs/migrate` missing) | Docs migrate image push | Owner, root (items 3, 3a) | file 02 |
| B-5 | Control and Docs bundles empty | Apply 2 version ids | Owner (items 4, 5) | file 03 |
| B-6 | `OPERATOR_CIDRS` unset | operator console | Owner, Stage 4 | file 06 |
| B-7 | Docs Control credential not issued | Docs licensing | Owner, Stage 5g | file 03 |
| B-8 | AWS connector signed out | Claude's read-only checks (none needed so far) | Owner (O-IAM-6, ideally MunaxaReadOnly) | |
| B-9 | Production not fully separated in one account (ACCESS-POLICY F-6) | any Production deployment (not Testing) | Owner decision later | file 01 |
| B-10 | School `SCHOOL_LOCAL_AUTH`, Packages grant | Work/School later | Owner | not this deployment |

## Risks

| # | Risk | Effect | Mitigation |
| --- | --- | --- | --- |
| R-B1 | Live Docs bootstrap applied with non-default variables | owner plan stops before anything is applied | Claude reads the log and corrects the declaration; nothing lost |
| R-2 | OpenSSL 3.5.10 ships as `-r1` or later, or only in one package at first | exact pins fail to build | the bump PR's CI is the authority; pins adjusted only to the verified version |
| R-3 | A new HIGH elsewhere when 3.5.10 lands | images still blocked | same rule: no suppression, new remediation |
| R-4 | Mocked plans show replacements as changes | a real plan summary reads differently | declarations use per-address actions (file 06 §1); the intent check compares those |
| R-5 | RDS automatic restart about 28 Nov 10:45 UTC | a few hours of RDS cost | 21:00 UTC backstop and the scheduled `down` stop it the same evening |
| R-6 | Identity Center enabled in the wrong Region | permission sets work but the instance lives elsewhere | README: Frankfurt selector before "Enable"; rollback deletes the configuration |

## Rollback summary

Identity Center: README §6. Docs bootstrap: re-apply `a04723a`. Bundles: unused until a session;
delete-version procedure in each script header (root). Applies, pins, sessions and `OPERATOR_CIDRS`:
file 06 §5. Nothing in this report changed AWS, so there is nothing to roll back today.
