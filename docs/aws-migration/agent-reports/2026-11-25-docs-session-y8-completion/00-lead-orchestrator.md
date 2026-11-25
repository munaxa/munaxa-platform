# Docs session Y-8 completion: 25 Nov 2026

Runbook: `2026-11-22-testing-temporary-openssl-acceptance/05-DOCS-TESTING-RUNBOOK.md`, steps 19 to 25.
Follows [2026-11-24-control-session-y6](../2026-11-24-control-session-y6/00-lead-orchestrator.md) section 7.
Labels: **[V]** verified, **[O]** owner action, **[R]** recommendation.

## Verdict

- **Y-8 Docs Testing session: DONE [V].** The owner signed in to Docs, opened the workspace and
  uploaded a document. Control answered the Docs entitlements call with **200**, and the file is in
  the Docs bucket together with its generated rendition.
- **Y-7 credential: fixed [V].** The third credential, stored as docs-api `43690bf5…`, is accepted by
  Control. The 401 from 24 Nov is gone.
- **New finding F-10 [V]:** after the credential was fixed, Control answered **404**, because
  Control had no plan, customer, tenant link or subscription for the Docs tenant. The runbook did not
  include this step. The owner created them in the portal and the call turned 200 at 13:21 UTC.
- Everything is shut down and verified ([01-SHUTDOWN-VERIFICATION.md](01-SHUTDOWN-VERIFICATION.md)).

## 1. What ran (UTC)

| Time | Step | Evidence |
| --- | --- | --- |
| 12:07 | Owner: "lets start now" (approval to begin the session) | thread |
| 12:10 | Connector checked as root; account idle, database stopped. Today's two late GitHub scheduled `down` runs had already fired (03:03, 10:32), so neither could end this session | run 45595985016 |
| 12:11 | H-20 armed: P 16:00, S 16:30 | EventBridge Scheduler |
| 12:12 | `up` (Identity, Control API + portal, Docs api/web/scanner) | run 45611485893 |
| 12:2x | **[O]** Owner revoked `d32e02b4…`, issued a third credential, copied it by clicking the field and Ctrl+C, stored it with `replace-key CONTROL_PLANE_TOKEN`; sent only the version id `43690bf5-5c66-4e83-8b21-9263f523816c` | thread |
| 12:29 | `down` (success; verified 0 services, 0 tasks, 0 ALB, DB stopped) | run 45614202853 |
| 12:29-12:44 | Pin platform#184 (`2c8805e`): `secret_version_ids.docs-api` = `43690bf5…`, declaration 2 replacements; all checks green; merged while down | platform#184 |
| 12:45 | **[O]** Owner apply. Plan log: "0 to add, 0 to change, 2 to replace, 0 to destroy" and "The plan matches the declared changes exactly (2 resource action(s))"; owner approved | run 45616862677 |
| 12:47 | Verified: `munaxa-nonprod-docs-api:4` and `munaxa-nonprod-docs-provision:4` reference `43690bf5`, no longer `b313124e` | ECS DescribeTaskDefinition |
| 12:47 | `up` | run 45617213669 |
| 13:01 | All 5 target groups healthy | ELBv2 DescribeTargetHealth |
| 13:09 | **[O]** Owner DNS (4 CNAMEs). The browser kept the old address for a few minutes (0 ALB requests at 13:10) | CloudWatch RequestCount |
| 13:12 | Docs reached; "service unavailable". Control log: entitlements **404** (no more 401). Docs log: `SUBSCRIPTION_REQUIRED` | control-api, docs-api logs |
| 13:17 | Control DB read (db-admin task, metadata only): only `product_deployment` docs-nonprod `b1607a52…`; no plan, customer, tenant link or subscription | db-admin task 261b33a7 |
| 13:18-13:21 | **[O]** Owner in the portal: plan `docs/internal` with a published version (all 5 Docs features, `users` and `storage.bytes` unlimited), customer, tenant link `d75d9645…` (SaaS on docs-nonprod), subscription (paid term) | thread |
| 13:21 | Control entitlements **200**, and 200 on every call after | control-api log |
| 13:23 | Upload stored: `munaxa-internal/blobs/e1/0a/…` (26,051 bytes); rendition `munaxa-internal/derived/e2/3a/…` (11,849 bytes) at 13:25 | S3 ListObjectsV2 `munaxa-nonprod-docs-files-229251310592` |
| 13:28 | `down`, verified, H-20 P and S deleted | section 6 |

## 2. Repository changes

| PR | Merge | What |
| --- | --- | --- |
| platform#184 | `2c8805e` | docs-api credential pin 3 (`43690bf5…`) and its 2-replacement declaration |

Merged under the standing rule, while the session was down. Nothing deploys on merge.

## 3. Findings

| # | Finding | Severity | Recommendation [R] |
| --- | --- | --- | --- |
| F-10 | A new Docs tenant needs a Control plan, customer, tenant link and subscription, or Control answers 404 and Docs shows "service unavailable". The runbook had no step for it | Runbook | Add a step after provisioning: create the plan (with every Docs limit listed, since an unlisted limit is 0), customer, tenant link and subscription |
| F-11 | The Docs page for a missing subscription says "the server did not answer", which reads like an outage | Low | Docs follow-up: show a clear "no subscription" message for `SUBSCRIPTION_REQUIRED` |
| F-1 (24 Nov) | Confirmed fixed by procedure: clicking the field and pressing Ctrl+C copied all 43 characters | Closed for now | The copy button and the 43-character check from 24 Nov are still worth doing |
| F-9 (24 Nov) | Four CNAME edits each `up`, and a stale browser DNS cache after the edit | Operations | Owner asked about cost: a Cloudflare API token (DNS edit, munaxa.com only) as a GitHub secret lets `up` update the records at no cost. Not started |

## 4. Owner actions today [O]

Approval to start; credential revoke, issue and replace-key; apply approval; DNS (2 times);
5 portal forms (plan, version and publish, customer, tenant link, subscription); sign-in and upload.

## 5. Still open from earlier

- Rotate `control_owner` before Production (F-6, owner yes/no).
- Publish a Control migrate image that contains control#16.
- F-2: the scheduled `down` should skip while a future H-20 hard stop is armed.
- The D-SSL Testing exception expires 2026-12-01T00:00:00Z. After that, the Testing images must carry OpenSSL 3.5.10 before another session.

## 6. Shutdown verification

See [01-SHUTDOWN-VERIFICATION.md](01-SHUTDOWN-VERIFICATION.md).
