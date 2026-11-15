# C-24  CloudTrail custody check for the Option A secrets (separate call; after the session; read-only).
#
# Counts Secrets Manager management events since T_CREATE by event name, principal and secret, and
# evaluates the custody rules. Returns counts and booleans only: never requestParameters,
# responseElements, an email or a value. Expected after a normal session:
#   - GetRandomPassword 1-3, CreateSecret 2 (C-8), DeleteSecret 1 on identity-bootstrap: root;
#   - secret-value reads only by ECS execution roles (the bootstrap, probe or migrate tasks), never by
#     root, a deployer or the connector, and NEVER on identity-operator;
#   - no DeleteSecret on identity-operator by anyone.
# LookupEvents: MaxResults 50, NextToken loop, a 40 s guard (the connector stops a run at about
# 60 s); "complete" is False if the guard stopped it, and then the result is INCOMPLETE, never PASS.
# Revised for the connector sandbox (BE-8). NOT RUN.

T_CREATE = "<ISO-8601 UTC time just before C-8, e.g. 2026-11-20T12:00:00Z>"  # INPUT

# --- shared helpers v1 (identical in every connector script) ---
# Sandbox rules (sandbox_harness.py check_source): no import, no dunder name, no getattr/hasattr/type,
# no print; only the pre-imported names; the last statement is the bare expression `result`.
REGION = "eu-central-1"
ACCOUNT = "229251310592"


def code_of(e):
    """An error CODE only. Never str(e) or a message: AWS and botocore messages can echo values."""
    if isinstance(e, ClientError):
        try:
            return "AWS_" + str(e.response["Error"]["Code"])[:64]
        except Exception:
            return "AWS_UNKNOWN"
    if isinstance(e, asyncio.TimeoutError):
        return "PY_TIMEOUT"
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

OPERATOR = "munaxa-nonprod/identity-operator"
BOOTSTRAP = "munaxa-nonprod/identity-bootstrap"
VALUE_READERS = {
    "munaxa-nonprod-identity-bootstrap-execution", "munaxa-nonprod-identity-migrate-execution",
    "munaxa-nonprod-db-admin-execution", "munaxa-nonprod-identity-execution",
}
ISO = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")
SECRET_NAME = re.compile(r"^(?:arn:aws:secretsmanager:[a-z0-9-]+:\d{12}:secret:)?(munaxa-nonprod/[a-z0-9-]+?|rds!db-[0-9a-f-]+)(?:-[A-Za-z0-9]{6})?$")


def principal(ui):
    kind = str(ui.get("type", ""))
    if kind == "Root":
        return "root"
    if kind == "AssumedRole":
        issuer = ui.get("sessionContext", {}).get("sessionIssuer", {})
        return "role:" + str(issuer.get("userName", "?"))[:64]
    if kind == "AWSService":
        return "service:" + str(ui.get("invokedBy", "?"))[:64]
    return "other:" + kind[:32]


def secret_of(req):
    raw = str(req.get("secretId", req.get("name", "")))
    m = SECRET_NAME.match(raw)
    return m.group(1) if m else ("" if raw == "" else "other")


async def c24():
    if not ISO.match(T_CREATE):
        return {"result": "ABORT", "code": "T_CREATE_NOT_SET"}
    start = datetime.datetime.strptime(T_CREATE, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=datetime.timezone.utc)
    if start > datetime.datetime.now(datetime.timezone.utc):
        return {"result": "ABORT", "code": "T_CREATE_IN_FUTURE"}
    problem = await this_account()
    if problem:
        return {"result": "ABORT", "code": problem}
    began = time.monotonic()
    counts = collections.Counter()
    findings = []
    value_kept = {"GetRandomPassword_response_present": False, "CreateSecret_secretString_present": False,
                  "PutSecretValue_secretString_present": False}
    token, pages, complete = None, 0, False
    while time.monotonic() - began < 40:
        params = {"LookupAttributes": [{"AttributeKey": "EventSource", "AttributeValue": "secretsmanager.amazonaws.com"}],
                  "StartTime": start, "MaxResults": 50}
        if token:
            params["NextToken"] = token
        try:
            r = await aws("cloudtrail", "LookupEvents", params)
        except Exception as e:
            return {"result": "FAIL", "code": "LOOKUP_" + code_of(e), "pages": pages}
        pages += 1
        if not isinstance(r, dict) or not isinstance(r.get("Events", []), list):
            return {"result": "FAIL", "code": "LOOKUP_MALFORMED", "pages": pages}
        for ev in r.get("Events", []):
            try:
                ct = json.loads(ev.get("CloudTrailEvent", "{}"))
                if not isinstance(ct, dict) or not isinstance(ct.get("userIdentity", {}), dict):
                    raise ValueError("shape")
            except Exception:
                findings.append("unparseable-event")
                continue
            name = str(ct.get("eventName", ""))
            who = principal(ct.get("userIdentity", {}))
            req = ct.get("requestParameters") or {}
            if not isinstance(req, dict):
                findings.append("unparseable-event")
                continue
            target = secret_of(req)
            counts[name + " | " + who + " | " + target] += 1
            if name == "GetRandomPassword" and ct.get("responseElements"):
                value_kept["GetRandomPassword_response_present"] = True
            if name in ("CreateSecret", "PutSecretValue") and any(str(k).lower() == "secretstring" for k in req.keys()):
                value_kept[name + "_secretString_present"] = True
            if name == "BatchGetSecretValue":
                # No Munaxa task or script uses it; its secret list is not inspected, so any use fails.
                findings.append("batch-value-read")
            if name in ("GetSecretValue", "BatchGetSecretValue"):
                if target == OPERATOR:
                    findings.append("value-read-of-identity-operator")
                if not who.startswith("role:") or who[5:] not in VALUE_READERS:
                    findings.append("value-read-by-" + who)
            if name == "DeleteSecret" and target == OPERATOR:
                findings.append("delete-of-identity-operator")
        token = r.get("NextToken")
        if token is not None and not isinstance(token, str):
            return {"result": "FAIL", "code": "LOOKUP_MALFORMED", "pages": pages}
        if not token:
            complete = True
            break
    if any(value_kept.values()):
        findings.append("value-recorded-in-cloudtrail")
    status = "INCOMPLETE" if not complete else ("PASS" if not findings else "FAIL")
    return {"result": status, "complete": complete, "pages": pages, "counts": dict(sorted(counts.items())),
            "findings": sorted(set(findings)), "value_kept": value_kept}


try:
    result = await c24()
except Exception as e:  # fail closed with a code only, never a message or a traceback
    result = {"result": "FAIL", "code": "UNEXPECTED_" + code_of(e)}
result
