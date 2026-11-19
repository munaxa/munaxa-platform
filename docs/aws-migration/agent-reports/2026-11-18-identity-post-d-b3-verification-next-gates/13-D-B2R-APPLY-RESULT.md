# D-B2R apply: result (18 Nov 2026)

**Status: D-B2R APPLIED AND VERIFIED.**

The owner approved the apply by running it after the plan review in file 12. He ran it in root CloudShell, eu-central-1, from 13:35:47 to 13:37:18 UTC. The apply script came from commit `9458081`, and its SHA-256 `948053a7…f83a` was checked before it ran. The arguments were the pin `a976b1a…` and the reviewed plan SHA-256 `2b90ec35…d34e`.

## Owner log

| Step | Log | Review |
| --- | --- | --- |
| 1 | account, root, region, no lock; saved plan, `expected.json` and `norm.jq` checksums OK | the reviewed plan, unchanged |
| 3 | pin, provider 6.67.0, init without migration, 70 resources | as required |
| 4 | `aws_iam_policy.deployer_session_read["nonprod"]` modified in 1 s; `Apply complete! Resources: 0 added, 1 changed, 0 destroyed.` at 13:36:55 UTC | exactly the planned change |
| 5 | `No changes. Your infrastructure matches the configuration.`; 70 resources | no residual change |
| 6 | live boundary, session-read and session-cleanup policies equal the reviewed code | as required |
| 7 | no lock left; saved plan deleted; `D-B2R APPLIED AND VERIFIED 2026-11-18T13:37:18Z` | clean finish |

## Claude's independent read-only check (connector, about 13:39 UTC)

Policy `/munaxa-shared/bootstrap/munaxa-shared-deployer-nonprod-session-read`:

- default version `v3`, updated 13:36:54 UTC;
- 1,504 characters;
- `RefreshSessionCleanup` = `cloudwatch:ListTagsForResource`, `sns:GetTopicAttributes`, `sns:ListTagsForResource`, `states:DescribeStateMachine`, **`states:ListStateMachineVersions`**, `states:ListTagsForResource`.

These values match the code merged in PR #137. No secret was read and no write was made.

## Still to verify

- **Next scheduled Testing `down`:** "Plan the switches" must pass. This is NOT VERIFIED until that run exists.
- **Schedule R at 21:05 UTC:** this is the first real cleanup run. A success is needed for H-20, and the `not-run` alarm should then clear. NOT VERIFIED until then.
- **D-B5, D-B4 and Stage E** are unchanged: PREPARED or NOT AUTHORIZED.
