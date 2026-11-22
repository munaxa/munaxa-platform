# 06. Owner actions, in order, and the approvals still required

Plain steps. Nothing here sends a secret to anyone. If anything looks different from "Expected",
stop and tell Claude what you see (no passwords, codes or keys).

## A. Now (no approval needed from Claude's side; about 15 minutes)

**A1. Switch the Claude AWS connector to read-only (O-IAM-6).**
1. claude.ai → Settings → Connectors → **AWS** → Disconnect, then Connect again.
2. When AWS asks how to sign in, use the access portal `https://d-9967b3db9b.awsapps.com/start`
   (your own Identity Center user and MFA), then choose account **229251310592** and role **MunaxaReadOnly**.
   [U] The connector's screens may word this differently; the only thing that matters is account
   229251310592 and **MunaxaReadOnly** (never Administrator, never root).
3. Tell Claude "connector switched". Claude then checks, read-only: the caller is
   `AWSReservedSSO_MunaxaReadOnly_…`; listing ECS clusters works; reading a secret value and reading
   log contents are **refused**. Expected: all four as stated (this is README §5 part A).

**A2. Check Administrator works (O-IAM-5, part 1).** Access portal → 229251310592 →
**MunaxaAdministrator** → "Management console". Expected: the AWS console opens and the top-right
corner shows `MunaxaAdministrator/…`. Close the tab; change nothing.

**A3. Check Engineering is narrow (O-IAM-5, part 2).** Access portal → 229251310592 →
**MunaxaEngineering** → "Management console" → Region **Europe (Frankfurt)** → CloudShell icon
(top bar). Paste this block and press Enter, then copy everything it prints to Claude (it prints
names and "AccessDenied" lines only, never a value):

```bash
aws sts get-caller-identity --query Arn --output text
aws secretsmanager describe-secret --secret-id munaxa-nonprod/control-api --query Name --output text
aws secretsmanager get-secret-value --secret-id munaxa-nonprod/identity-operator --query Name --output text
aws secretsmanager describe-secret --region us-east-1 --secret-id munaxa-nonprod/control-api --query Name --output text
curl -fsSLo control-testing-secrets.sh https://raw.githubusercontent.com/munaxa/munaxa-platform/main/scripts/aws/owner/control-testing-secrets.sh
sha256sum control-testing-secrets.sh
/bin/bash -p ./control-testing-secrets.sh status
```

Expected, line by line: `…AWSReservedSSO_MunaxaEngineering_…`; `munaxa-nonprod/control-api`;
AccessDenied; AccessDenied; `1989bca366a5b748ad32d9448d3c2e69839997c2a3fe1d0b850c0652b1d59f95`;
`STATUS OK`. (These are the existing README §5 part B commands; nothing broader.)

## B. Yes/no approvals Claude will ask for, one at a time

| # | Question | When | What a yes allows |
| --- | --- | --- | --- |
| Y-1 | Publish the Identity, Control and Docs Testing images at the three named commits, under the D-SSL exception? | After file 03's merges and green `main` image jobs | You create three `image/<sha>` pre-release tags (Claude sends the exact links and SHAs) and approve `image-release` three times. Nothing runs yet |
| Y-2 | Run the Apply 1 **plan**? | After Y-1 digests are pinned in a merged PR | You start the plan in Actions; Claude checks 33 create + 4 replacements |
| Y-3 | **Apply** that Apply 1 plan? | After Claude confirms Y-2 | Licence key, Control task definitions, Identity revisions. Nothing starts |
| Y-4 | Run the Apply 2 **plan**? | After the Apply 2 PR merges | Expect 42 create + 3 replacements |
| Y-5 | **Apply** that Apply 2 plan? | After Claude confirms Y-4 | Docs task definitions, provision role. Nothing starts |
| Y-6 | Start the Control session (`up`), same day, hard stop before 21:00 UTC? | You set `OPERATOR_CIDRS` first | Identity + Control run; you then do DNS, MFA and issue the Docs credential |
| Y-7 | Pin the Docs credential (plan, then apply)? | After you store it and send the version id | 2 task-definition replacements |
| Y-8 | Start the Docs session, migrate, provision, verify, then shut down? | Same day | Full Docs Testing check, then `down` and verification |

Each yes covers only its row. Production is never touched by any of them.
