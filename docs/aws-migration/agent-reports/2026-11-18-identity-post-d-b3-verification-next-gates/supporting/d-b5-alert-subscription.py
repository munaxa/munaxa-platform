# D-B5  Testing cleanup alerts: subscribe the approved address to the alarm topic (owner decision D-B5).
#
# Report: docs/aws-migration/agent-reports/2026-11-18-identity-post-d-b3-verification-next-gates/ (file 05).
# Run through the AWS connector (root, account 229251310592, eu-central-1) in this order, each only
# when the owner has approved that step in the thread:
#
#   MODE "precheck"   read-only. The caller's account; the topic exists with exactly the expected ARN,
#                     is owned by this account, and its policy still carries the TLS-only deny; lists
#                     its current subscriptions (protocol, endpoint, confirmed or pending). PASS only
#                     when no subscription for ADDRESS exists yet.
#   MODE "subscribe"  the precheck, then ONE sns:Subscribe (Protocol email, Endpoint ADDRESS,
#                     ReturnSubscriptionArn true). Refuses if any subscription for ADDRESS already
#                     exists (confirmed or pending), so running it twice never makes a second one.
#                     AWS then emails ADDRESS a confirmation link; the owner must click it.
#   MODE "verify"     read-only. CONFIRMED only when exactly one subscription for ADDRESS exists, it
#                     is an email subscription, and AWS reports it confirmed (PendingConfirmation
#                     "false"); otherwise PENDING, ABSENT or FAIL. Never claims a subscription that AWS
#                     has not confirmed.
#
# The subscription ARN is never returned in full (review M-1): a confirmed email subscription whose
# confirmation was not authenticated can be removed by an unsigned Unsubscribe that knows the ARN,
# and reports are public. Only its last 4 characters are returned, to tell two subscriptions apart.
#
# Never: sns:Publish (no test message), Unsubscribe, SetTopicAttributes, SetSubscriptionAttributes,
# ConfirmSubscription, any other topic or account. No secret, token or credential is read or
# returned: the subscription confirmation token exists only in the email. Codes only on errors.
# Checked by sandbox_harness.py and tested against a fake AWS (test_next_gate_connector_scripts.py). NOT RUN.

MODE = "precheck"  # INPUT: precheck | subscribe | verify
ADDRESS = "alert@munaxa.com"  # INPUT: fixed by D-B5 (bootstrap budget_alert_emails); do not change

# --- shared helpers v2 (identical in every connector script) ---
# Sandbox rules (sandbox_harness.py check_source): no import, no dunder name, no getattr/hasattr/type,
# no print; only the pre-imported names; the last statement is the bare expression `result`.
REGION = "eu-central-1"
ACCOUNT = "229251310592"


def code_of(e):
    """An error CODE only. Never str(e) or a message: AWS and botocore messages can echo values.
    The live sandbox has no `ClientError` name (observed 18 Nov 2026: NameError), so an AWS error is
    recognised by its botocore `.response`, never by isinstance(e, ClientError)."""
    if isinstance(e, asyncio.TimeoutError):
        return "PY_TIMEOUT"
    try:
        aws_code = e.response["Error"]["Code"]
    except Exception:
        aws_code = None
    if aws_code is not None:
        return "AWS_" + re.sub(r"[^A-Za-z0-9.]", "", str(aws_code))[:64]
    if isinstance(e, KeyError):
        return "PY_KEY"
    if isinstance(e, (TypeError, ValueError)):
        return "PY_VALUE"
    return "PY_OTHER"


async def aws(service, operation, params, timeout=20):
    """One AWS call with a client-side time limit (the connector itself stops a run at about 60 s)."""
    return await asyncio.wait_for(
        call_boto3(service_name=service, operation_name=operation, region_name=REGION, params=params),
        timeout=timeout,
    )


async def this_account():
    """Fail closed unless the connector is signed in to the Munaxa account."""
    try:
        who = await aws("sts", "GetCallerIdentity", {})
    except Exception as e:
        return "CALLER_" + code_of(e)
    if not isinstance(who, dict) or who.get("Account") != ACCOUNT:
        return "WRONG_ACCOUNT"
    return ""
# --- end shared helpers ---
TOPIC = "arn:aws:sns:" + REGION + ":" + ACCOUNT + ":munaxa-nonprod-session-cleanup-alerts"
APPROVED = "alert@munaxa.com"


async def subscriptions():
    """Every subscription on the topic: protocol, endpoint and whether it is still pending."""
    out, token = [], None
    for _ in range(10):
        params = {"TopicArn": TOPIC}
        if token:
            params["NextToken"] = token
        r = await aws("sns", "ListSubscriptionsByTopic", params)
        found = r.get("Subscriptions")
        if not isinstance(found, list):
            raise ValueError("shape")
        for s in found:
            if not isinstance(s, dict):
                raise ValueError("shape")
            arn = str(s.get("SubscriptionArn", ""))
            out.append({"protocol": str(s.get("Protocol", "")), "endpoint": str(s.get("Endpoint", "")),
                        "arn": arn, "pending": not arn.startswith(TOPIC + ":")})
        token = r.get("NextToken")
        if not token:
            return out
    raise ValueError("too-many-pages")


async def precheck():
    checks = {}
    try:
        a = (await aws("sns", "GetTopicAttributes", {"TopicArn": TOPIC})).get("Attributes") or {}
    except Exception as e:
        return False, {"topic_error": code_of(e)}
    checks["topic_arn"] = a.get("TopicArn") == TOPIC
    checks["topic_owner"] = a.get("Owner") == ACCOUNT
    try:
        policy = json.loads(a.get("Policy") or "{}")
        tls = [s for s in policy.get("Statement", []) if isinstance(s, dict) and s.get("Sid") == "TlsOnly" and s.get("Effect") == "Deny"]
        checks["tls_only_deny"] = len(tls) == 1
    except Exception:
        checks["tls_only_deny"] = False
    checks["counts"] = {k: a.get(k) for k in ("SubscriptionsConfirmed", "SubscriptionsPending", "SubscriptionsDeleted")}
    try:
        subs = await subscriptions()
    except Exception as e:
        checks["subscriptions_error"] = code_of(e)
        return False, checks
    checks["subscriptions"] = [{"protocol": s["protocol"], "endpoint": s["endpoint"], "pending": s["pending"]} for s in subs]
    checks["address_not_yet_subscribed"] = not [s for s in subs if s["endpoint"].lower() == ADDRESS.lower()]
    # D-B5 expects a topic nobody subscribed to yet (review L-7): any other subscription is a stop.
    checks["topic_has_no_subscription"] = not subs and all(str(v) == "0" for v in checks["counts"].values())
    ok = checks["topic_arn"] and checks["topic_owner"] and checks["tls_only_deny"]
    return ok, checks


async def verify():
    subs = await subscriptions()
    mine = [s for s in subs if s["endpoint"].lower() == ADDRESS.lower()]
    if not mine:
        return {"result": "ABSENT", "subscriptions": len(subs)}
    if len(mine) > 1:
        return {"result": "FAIL", "code": "MORE_THAN_ONE_SUBSCRIPTION", "count": len(mine)}
    if mine[0]["protocol"] != "email":
        return {"result": "FAIL", "code": "NOT_AN_EMAIL_SUBSCRIPTION", "protocol": mine[0]["protocol"]}
    if mine[0]["pending"]:
        return {"result": "PENDING", "note": "AWS still waits for the owner to click Confirm subscription in the email"}
    a = (await aws("sns", "GetSubscriptionAttributes", {"SubscriptionArn": mine[0]["arn"]})).get("Attributes") or {}
    if a.get("PendingConfirmation") != "false" or a.get("TopicArn") != TOPIC or a.get("Protocol") != "email":
        return {"result": "PENDING", "code": "NOT_CONFIRMED_BY_AWS"}
    return {"result": "CONFIRMED", "subscription_arn_suffix": mine[0]["arn"][-4:], "confirmation_was_authenticated": a.get("ConfirmationWasAuthenticated")}


async def d_b5():
    if MODE not in ("precheck", "subscribe", "verify"):
        return {"result": "ABORT", "code": "UNKNOWN_MODE"}
    if ADDRESS != APPROVED:
        return {"result": "ABORT", "code": "ADDRESS_NOT_THE_APPROVED_ONE"}
    problem = await this_account()
    if problem:
        return {"result": "ABORT", "code": problem}
    if MODE == "verify":
        return await verify()
    ok, checks = await precheck()
    if MODE == "precheck":
        return {"result": "PASS" if ok and checks.get("address_not_yet_subscribed") and checks.get("topic_has_no_subscription") else "FAIL", "checks": checks}
    if not ok:
        return {"result": "ABORT", "code": "PRECHECK_FAILED", "checks": checks}
    if not checks.get("address_not_yet_subscribed"):
        return {"result": "ABORT", "code": "ALREADY_SUBSCRIBED_OR_PENDING", "next": "run verify; never subscribe twice", "checks": checks}
    if not checks.get("topic_has_no_subscription"):
        return {"result": "ABORT", "code": "TOPIC_HAS_ANOTHER_SUBSCRIPTION", "checks": checks}
    try:
        r = await aws("sns", "Subscribe", {"TopicArn": TOPIC, "Protocol": "email", "Endpoint": ADDRESS, "ReturnSubscriptionArn": True})
    except Exception as e:
        return {"result": "FAIL", "code": "SUBSCRIBE_" + code_of(e), "next": "run precheck before any retry"}
    return {"result": "SUBSCRIBED_PENDING_CONFIRMATION", "subscription_arn_suffix": str(r.get("SubscriptionArn", ""))[-4:],
            "next": "the owner clicks Confirm subscription in the AWS email to " + ADDRESS + "; then run verify"}


try:
    result = await d_b5()
except Exception as e:  # fail closed with a code only
    result = {"result": "FAIL", "code": "UNEXPECTED_" + code_of(e)}
result
