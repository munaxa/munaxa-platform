# 05. D-B5: alert e-mail subscription to the cleanup topic

**Status: PREPARED, OWNER ACTION REQUIRED, NOT RUN.** No subscription exists that this task knows
of. The live state was not read (file 03 §5). It must not be described as subscribed until AWS
reports it confirmed.

## 1. What is fixed

| Item | Value | Source |
| --- | --- | --- |
| Account, region | `229251310592`, `eu-central-1` | CLAUDE.md, every report |
| Topic | `arn:aws:sns:eu-central-1:229251310592:munaxa-nonprod-session-cleanup-alerts` | `infra/aws/stack/session-cleanup.tf` (`${prefix}-session-cleanup-alerts`, prefix `munaxa-nonprod`), created by the D-B3 apply |
| Topic policy | `CloudWatchAlarmsOfThisAccount` (only this account's `munaxa-nonprod-session-cleanup-*` alarms may publish) and `TlsOnly` (deny Publish and Subscribe without TLS) | same file |
| Recipient | `alert@munaxa.com` | Owner decision D-B5, 15 Nov. It is already the approved address in `infra/aws/bootstrap/variables.tf` `budget_alert_emails`, and no new address is introduced |
| Who subscribes | Claude, through the AWS connector as root, after the owner's yes | The deployer roles have no `sns:Subscribe`, and Terraform does not hold the subscription by design |
| Alarms that will mail | `munaxa-nonprod-session-cleanup-failed` (any FAILED, TIMED_OUT or ABORTED execution) and `munaxa-nonprod-session-cleanup-not-run` (no SUCCEEDED execution in 26 h) | `session-cleanup.tf` |

## 2. Script

The script is `supporting/d-b5-alert-subscription.py`, with SHA-256 `1938dfd0…c170` in this
commit. It follows the connector sandbox rules (`sandbox_harness.check_source`: no import, no
reflection, literal operations only) and uses the shared helpers verbatim.

| Mode | Calls | Writes |
| --- | --- | --- |
| `precheck` | `sts:GetCallerIdentity`, `sns:GetTopicAttributes`, `sns:ListSubscriptionsByTopic` | none |
| `subscribe` | the precheck, then **one** `sns:Subscribe` (`Protocol=email`, `Endpoint=alert@munaxa.com`, `ReturnSubscriptionArn=true`) | one subscription in "pending confirmation" |
| `verify` | `ListSubscriptionsByTopic`, then `GetSubscriptionAttributes` for the one matching subscription | none |

**Safeguards:**

- **Account and topic.** It aborts unless the caller's account is 229251310592. The topic ARN must match exactly, and the topic's `Owner` must be that account.
- **Topic policy.** The precheck requires the `TlsOnly` deny to still be present.
- **Address.** It refuses any address other than the approved one, before any AWS call.
- **No duplicate.** It refuses to subscribe if any subscription for the address already exists, confirmed or pending, so a second run can never create a second subscription.
- **Empty topic only.** The precheck and `subscribe` both require the topic to have no subscription at all and the counts confirmed, pending and deleted to be 0/0/0. Any other subscription is a stop (`TOPIC_HAS_ANOTHER_SUBSCRIPTION`).
- **ARN suffix only.** The script returns only the last 4 characters of the subscription ARN. The full ARN would allow an unauthenticated unsubscribe, so it is never printed and never committed. `verify` fails with `NOT_AN_EMAIL_SUBSCRIPTION` if the address is subscribed with any other protocol.
- **No other write.** It never calls `Publish` (no test message), `Unsubscribe`, `ConfirmSubscription`, `SetTopicAttributes` or `SetSubscriptionAttributes`. The tests check this.
- **Codes only.** Errors are returned as codes, never as messages. No credential or token is read, and the confirmation token exists only in the e-mail.
- **Confirmed means confirmed by AWS.** `verify` says CONFIRMED only when AWS reports `PendingConfirmation = "false"` for exactly one email subscription to the address. Otherwise it says PENDING or ABSENT.

**Offline tests:** `supporting/test_next_gate_connector_scripts.py`, 11 D-B5 tests against a fake
AWS, all pass (file 09).

## 3. Procedure

1. **Owner yes/no (D-B5 execution).** This is the only approval needed for steps 2 to 4.
2. **Claude runs `precheck`.** Expected: `PASS`, `address_not_yet_subscribed: true` and `topic_has_no_subscription: true` (counts 0/0/0, enforced). Any other result: stop and report.
3. **Claude runs `subscribe`.** Expected: `SUBSCRIBED_PENDING_CONFIRMATION`. AWS sends one e-mail, "AWS Notification - Subscription Confirmation", to `alert@munaxa.com`.
4. **Owner action:** open that e-mail and click "Confirm subscription". The link expires after 3 days. If it expires, the pending subscription disappears and step 3 may be repeated after a new precheck.
5. **Claude runs `verify`.** Expected: `CONFIRMED`, with the last 4 characters of the subscription ARN (the full ARN is not recorded anywhere). Until then the status is reported as PENDING, never as subscribed.

**Read-only verification at any time:** `verify`, or `precheck`, which lists the topic's
subscriptions with endpoint and pending flag.

**Not part of D-B5:** a test notification. Proving that an alarm actually reaches the inbox would
need an `sns:Publish` or a forced alarm state (`cloudwatch:SetAlarmState`). Both are writes that
send mail, and they need a separate approval if wanted.

**Note on timing.** The `not-run` alarm treats missing data as breaching over 26 hourly periods.
Right after the 08:34 UTC apply it may already be in ALARM, until the first SUCCEEDED execution,
which is R at 21:05 UTC. If the subscription is confirmed while the alarm is in ALARM, no mail is
sent for that alarm: SNS mails only on a state change. Its current state is NOT VERIFIED.
