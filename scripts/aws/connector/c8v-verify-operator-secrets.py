# C-8v  Metadata check after C-8 or C-8R (separate call, read-only, no value).
#
# Expected: both names present; the data key; no rotation; not scheduled for deletion; the four tags;
# identity-operator has exactly 1 version after C-8 (2 after C-8R, the older AWSPREVIOUS) and
# identity-bootstrap exactly 1, each with AWSCURRENT. Returns metadata only (DescribeSecret and
# ListSecretVersionIds never return a value). Revised for the connector sandbox (BE-8). NOT RUN.

EXPECTED_OPERATOR_VERSIONS = 1  # INPUT: 1 after C-8, 2 after C-8R

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

NAMES = ("munaxa-nonprod/identity-operator", "munaxa-nonprod/identity-bootstrap")
EXPECTED_TAGS = ["Environment=nonprod", "ManagedBy=manual/identity-operator-option-a", "Project=munaxa", "Stack=shared"]
DATA_KEY_ID = "45eda044-092a-4f31-9243-3f9548636e37"


async def describe(name, expected_versions):
    try:
        d = await aws("secretsmanager", "DescribeSecret", {"SecretId": name})
        v = await aws("secretsmanager", "ListSecretVersionIds", {"SecretId": name})
    except Exception as e:
        return {"ok": False, "error": code_of(e)}
    versions = v.get("Versions", [])
    stages = sorted(s for x in versions for s in x.get("VersionStages", []))
    tags = sorted(str(t.get("Key")) + "=" + str(t.get("Value")) for t in d.get("Tags", []))
    kms = str(d.get("KmsKeyId", ""))
    out = {
        "arn": d.get("ARN"),
        "kms_is_data_key": kms.endswith(DATA_KEY_ID) or kms == "alias/munaxa-nonprod-data",
        "rotation_enabled": bool(d.get("RotationEnabled", False)),
        "deleted": "DeletedDate" in d,
        "tags_ok": tags == EXPECTED_TAGS,
        "versions": len(versions),
        "stages": stages,
    }
    out["ok"] = (d.get("Name") == name and out["kms_is_data_key"] and not out["rotation_enabled"]
                 and not out["deleted"] and out["tags_ok"] and len(versions) == expected_versions
                 and "AWSCURRENT" in stages)
    return out


async def c8v():
    if EXPECTED_OPERATOR_VERSIONS not in (1, 2):
        return {"result": "ABORT", "code": "BAD_EXPECTED_VERSIONS"}
    problem = await this_account()
    if problem:
        return {"result": "ABORT", "code": problem}
    out = {
        NAMES[0]: await describe(NAMES[0], EXPECTED_OPERATOR_VERSIONS),
        NAMES[1]: await describe(NAMES[1], 1),
    }
    out["result"] = "PASS" if out[NAMES[0]]["ok"] and out[NAMES[1]]["ok"] else "FAIL"
    return out


try:
    result = await c8v()
except Exception as e:  # fail closed with a code only, never a message or a traceback
    result = {"result": "FAIL", "code": "UNEXPECTED_" + code_of(e)}
result
