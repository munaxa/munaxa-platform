# C-16  Delete the one-run bootstrap secret only (separate call; after the bootstrap runs and the probe,
# and on any stop before `down`).
#
# Exact-name guard: munaxa-nonprod/identity-operator shares the prefix and is NEVER deleted. The
# delete goes to the ARN DescribeSecret returned, after an exact Name check and an ARN shape check.
# Idempotent: an already absent secret is success. Confirms with DescribeSecret (not found) and
# ListSecrets with IncludePlannedDeletion (exact-name count 0), and that the persistent secret is
# still present. Revised for the connector sandbox (BE-8). NOT RUN.

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

BOOTSTRAP = "munaxa-nonprod/identity-bootstrap"
PERSISTENT = "munaxa-nonprod/identity-operator"
ARN_PREFIX = "arn:aws:secretsmanager:" + REGION + ":" + ACCOUNT + ":secret:" + BOOTSTRAP + "-"
SUFFIX = re.compile(r"^[A-Za-z0-9]{6}$")


async def c16():
    problem = await this_account()
    if problem:
        return {"result": "ABORT", "code": problem}
    out = {"deleted": False, "already_absent": False}
    try:
        d = await aws("secretsmanager", "DescribeSecret", {"SecretId": BOOTSTRAP})
    except Exception as e:
        if code_of(e) != "AWS_ResourceNotFoundException":
            return {"result": "FAIL", "code": "DESCRIBE_" + code_of(e)}
        d = None
        out["already_absent"] = True
    if d is not None:
        arn = str(d.get("ARN", ""))
        if d.get("Name") != BOOTSTRAP or not arn.startswith(ARN_PREFIX) or not SUFFIX.match(arn[len(ARN_PREFIX):]):
            return {"result": "ABORT", "code": "NAME_MISMATCH"}
        for attempt in (1, 2, 3):
            try:
                await aws("secretsmanager", "DeleteSecret", {"SecretId": arn, "ForceDeleteWithoutRecovery": True})
                out["deleted"] = True
                break
            except Exception as e:
                code = code_of(e)
                if code == "AWS_ResourceNotFoundException":
                    out["already_absent"] = True
                    break
                if attempt < 3 and code in ("PY_TIMEOUT", "AWS_ThrottlingException", "AWS_InternalServiceError"):
                    await asyncio.sleep(2)
                    continue
                return {"result": "FAIL", "code": "DELETE_" + code}

    gone = False
    for _ in range(6):
        try:
            await aws("secretsmanager", "DescribeSecret", {"SecretId": BOOTSTRAP})
        except Exception as e:
            if code_of(e) == "AWS_ResourceNotFoundException":
                gone = True
                break
        await asyncio.sleep(5)
    out["describe_not_found"] = gone
    try:
        ls = await aws("secretsmanager", "ListSecrets", {
            "IncludePlannedDeletion": True, "Filters": [{"Key": "name", "Values": [BOOTSTRAP]}]})
        # The name filter is a prefix match: count exact names only.
        out["list_count_exact"] = sum(1 for s in ls.get("SecretList", []) if s.get("Name") == BOOTSTRAP)
    except Exception as e:
        out["list_count_exact"] = -1
        out["list_error"] = code_of(e)
    try:
        p = await aws("secretsmanager", "DescribeSecret", {"SecretId": PERSISTENT})
        out["persistent_present"] = p.get("Name") == PERSISTENT and "DeletedDate" not in p
    except Exception as e:
        out["persistent_present"] = False
        out["persistent_error"] = code_of(e)
    out["result"] = "PASS" if gone and out["list_count_exact"] == 0 and out["persistent_present"] else "FAIL"
    return out


try:
    result = await c16()
except Exception as e:  # fail closed with a code only, never a message or a traceback
    result = {"result": "FAIL", "code": "UNEXPECTED_" + code_of(e)}
result
