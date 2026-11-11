# DRAFT - NOT RUN. Workstream 5 review artefact, 11 Nov 2026.
#
# Three connector scripts for Option A (password generated in AWS, persistent copy kept).
# Each block is one separate `run_script` call through the AWS connector (root, eu-central-1).
#
# NONE OF THESE MAY RUN until:
#   - the owner has supplied the Testing operator email (pending input O-2), and
#   - the owner has given the separate, written deployment authorization.
#
# Rules every block follows (report section D):
#   - the password exists only inside script C-8, in one variable, and is never returned,
#     printed, formatted into a string, or put in an exception message;
#   - every call that sees the password is wrapped in `except Exception`, and only an error
#     CODE (never a message, never `str(e)`) is returned, because AWS validation messages and
#     botocore parameter errors can echo parameter values;
#   - no GetSecretValue, BatchGetSecretValue or Secrets Manager Agent call anywhere;
#   - the return value holds names, ARNs, version ids, counts and booleans only. The operator
#     email is personal data and is never returned either.
#
# The placeholder below is the only value the operator edits. It must be replaced with the
# owner-supplied address in the session, never committed.

# =================================================================================================
# C-8  Create the persistent operator secret and the temporary bootstrap secret (ONE call)
# =================================================================================================
# Both secrets must be created in the same call. Once this call returns, the password can only be
# read back with GetSecretValue, which Claude must never call. A second call could not create the
# bootstrap secret from the persistent one.

OPERATOR_EMAIL = "<OWNER-SUPPLIED-TESTING-EMAIL>"  # O-2, pending. Do not invent.
REGION = "eu-central-1"
KMS_KEY = "alias/munaxa-nonprod-data"
PERSISTENT = "munaxa-nonprod/identity-operator"
BOOTSTRAP = "munaxa-nonprod/identity-bootstrap"
ORG = "munaxa-group"
TAGS = [
    {"Key": "Project", "Value": "munaxa"},
    {"Key": "Stack", "Value": "shared"},
    {"Key": "Environment", "Value": "nonprod"},
    {"Key": "ManagedBy", "Value": "manual/identity-operator-option-a"},
]
# Same list as @munaxa/auth password-policy.ts isTrivial(); a random 40-character password almost
# never hits it, but a hit would make bootstrap-account.mjs refuse the password after the secrets
# exist, so the script regenerates instead.
SEQUENCES = ["0123456789", "abcdefghijklmnopqrstuvwxyz", "qwertyuiop", "asdfghjkl", "zxcvbnm"]


def _code(e):
    try:
        return "AWS_" + str(e.response["Error"]["Code"])[:64]
    except Exception:
        return "PY_" + type(e).__name__[:64]


def _acceptable(pw, email):
    low = pw.lower()
    if not 12 <= len(pw) <= 128:
        return False
    for seq in SEQUENCES:
        for i in range(len(seq) - 5):
            run = seq[i:i + 6]
            if run in low or run[::-1] in low:
                return False
    for unit in range(1, 5):
        if len(low) >= unit * 3 and len(low) % unit == 0 and low[:unit] * (len(low) // unit) == low:
            return False
    local = email.lower().split("@")[0]
    if len(local) >= 4 and local in low:
        return False
    return True


async def sm(op, params):
    return await call_boto3(service_name="secretsmanager", operation_name=op,
                            region_name=REGION, params=params)


async def c8():
    if "@" not in OPERATOR_EMAIL or OPERATOR_EMAIL.startswith("<"):
        return {"result": "ABORT", "code": "EMAIL_NOT_SET"}

    # Preconditions, metadata only: neither name may exist (also not scheduled for deletion).
    for name in (PERSISTENT, BOOTSTRAP):
        try:
            await sm("DescribeSecret", {"SecretId": name})
            return {"result": "ABORT", "code": "NAME_EXISTS", "name": name}
        except Exception as e:
            if _code(e) != "AWS_ResourceNotFoundException":
                return {"result": "ABORT", "code": "PRECHECK_" + _code(e), "name": name}

    pw = None
    for _ in range(3):
        try:
            r = await sm("GetRandomPassword", {
                "PasswordLength": 40,
                "ExcludeCharacters": "\"'`\\",
                "RequireEachIncludedType": True,
            })
            candidate = r["RandomPassword"]
            r = None
        except Exception as e:
            return {"result": "ABORT", "code": "GENERATE_" + _code(e)}
        if _acceptable(candidate, OPERATOR_EMAIL):
            pw = candidate
            break
        candidate = None
    if pw is None:
        return {"result": "ABORT", "code": "GENERATE_POLICY_RETRIES"}

    out = {"result": "FAIL"}
    try:
        p = await sm("CreateSecret", {
            "Name": PERSISTENT,
            "Description": "Identity nonprod operator credential (Option A). Value never leaves AWS.",
            "KmsKeyId": KMS_KEY,
            "SecretString": json.dumps({
                "IDENTITY_OWNER_EMAIL": OPERATOR_EMAIL,
                "IDENTITY_OWNER_PASSWORD": pw,
                "IDENTITY_ORGANISATION": ORG,
            }),
            "Tags": TAGS,
        })
        out["persistent"] = {"name": p.get("Name"), "arn": p.get("ARN"), "version": p.get("VersionId")}
    except Exception as e:
        pw = None
        return {"result": "ABORT", "code": "CREATE_PERSISTENT_" + _code(e)}

    try:
        b = await sm("CreateSecret", {
            "Name": BOOTSTRAP,
            "Description": "One-run Identity bootstrap secret. Delete after the probe (force, no recovery).",
            "KmsKeyId": KMS_KEY,
            "SecretString": json.dumps({
                "IDENTITY_OWNER_EMAIL": OPERATOR_EMAIL,
                "IDENTITY_OWNER_PASSWORD": pw,
            }),
            "Tags": TAGS,
        })
        out["bootstrap"] = {"name": b.get("Name"), "arn": b.get("ARN"), "version": b.get("VersionId")}
    except Exception as e:
        pw = None
        # Roll back: no account exists yet, so the persistent copy has no use and cannot be
        # paired with a later bootstrap secret without GetSecretValue.
        try:
            await sm("DeleteSecret", {"SecretId": PERSISTENT, "ForceDeleteWithoutRecovery": True})
            rolled = True
        except Exception:
            rolled = False
        return {"result": "ABORT", "code": "CREATE_BOOTSTRAP_" + _code(e), "persistent_rolled_back": rolled}

    pw = None
    out["result"] = "CREATED"
    return out


result = await c8()
result

# =================================================================================================
# C-8v  Metadata check after C-8 (separate call; no value)
# =================================================================================================
# Expected: both names present; KmsKeyId is the data key (alias resolves to key 45eda044...);
# exactly 1 version each, staged AWSCURRENT; no rotation; no DeletedDate; the four tags.

REGION = "eu-central-1"


async def c8v():
    out = {}
    for name in ("munaxa-nonprod/identity-operator", "munaxa-nonprod/identity-bootstrap"):
        try:
            d = await call_boto3(service_name="secretsmanager", operation_name="DescribeSecret",
                                 region_name=REGION, params={"SecretId": name})
            v = await call_boto3(service_name="secretsmanager", operation_name="ListSecretVersionIds",
                                 region_name=REGION, params={"SecretId": name})
            out[name] = {
                "arn": d.get("ARN"),
                "kms_key_id": d.get("KmsKeyId"),
                "rotation_enabled": d.get("RotationEnabled", False),
                "deleted": "DeletedDate" in d,
                "tags": sorted(t["Key"] + "=" + t["Value"] for t in d.get("Tags", [])),
                "versions": len(v.get("Versions", [])),
                "stages": sorted(s for x in v.get("Versions", []) for s in x.get("VersionStages", [])),
            }
        except Exception as e:
            out[name] = {"error": getattr(e, "response", {}).get("Error", {}).get("Code", type(e).__name__)}
    return out


result = await c8v()
result

# =================================================================================================
# C-16  Delete the temporary bootstrap secret only (separate call; after the probe)
# =================================================================================================
# Exact-name guard: the persistent secret shares the prefix and must never be force-deleted.
# ListSecrets hides secrets scheduled for deletion unless IncludePlannedDeletion is set, so the
# check uses DescribeSecret (ResourceNotFound) plus ListSecrets with IncludePlannedDeletion.

REGION = "eu-central-1"
BOOTSTRAP = "munaxa-nonprod/identity-bootstrap"
PERSISTENT = "munaxa-nonprod/identity-operator"


async def c16():
    out = {"deleted": False}
    try:
        d = await call_boto3(service_name="secretsmanager", operation_name="DescribeSecret",
                             region_name=REGION, params={"SecretId": BOOTSTRAP})
        if d.get("Name") != BOOTSTRAP:
            return {"result": "ABORT", "code": "NAME_MISMATCH"}
        await call_boto3(service_name="secretsmanager", operation_name="DeleteSecret",
                         region_name=REGION,
                         params={"SecretId": d["ARN"], "ForceDeleteWithoutRecovery": True})
        out["deleted"] = True
    except Exception as e:
        code = e.response["Error"]["Code"] if hasattr(e, "response") else type(e).__name__
        if code != "ResourceNotFoundException":
            return {"result": "FAIL", "code": code}
        out["already_absent"] = True

    gone = False
    for _ in range(6):
        try:
            await call_boto3(service_name="secretsmanager", operation_name="DescribeSecret",
                             region_name=REGION, params={"SecretId": BOOTSTRAP})
            await asyncio.sleep(5)
        except Exception as e:
            if getattr(e, "response", {}).get("Error", {}).get("Code") == "ResourceNotFoundException":
                gone = True
                break
            await asyncio.sleep(5)
    ls = await call_boto3(service_name="secretsmanager", operation_name="ListSecrets",
                          region_name=REGION,
                          params={"IncludePlannedDeletion": True,
                                  "Filters": [{"Key": "name", "Values": [BOOTSTRAP]}]})
    out["describe_not_found"] = gone
    # The name filter is a prefix match: count exact names only.
    out["list_count_exact"] = sum(1 for s in ls.get("SecretList", []) if s.get("Name") == BOOTSTRAP)
    p = await call_boto3(service_name="secretsmanager", operation_name="DescribeSecret",
                         region_name=REGION, params={"SecretId": PERSISTENT})
    out["persistent_present"] = p.get("Name") == PERSISTENT and "DeletedDate" not in p
    out["result"] = "PASS" if gone and out["list_count_exact"] == 0 and out["persistent_present"] else "FAIL"
    return out


result = await c16()
result

# =================================================================================================
# C-24  CloudTrail custody check (separate call; after the session; read-only)
# =================================================================================================
# Counts Secrets Manager events since T_CREATE by event name, principal and secret, and reports
# whether CloudTrail kept a response or request value for the two value-bearing calls. It returns
# booleans only, never responseElements or requestParameters themselves. Expected:
#   - GetRandomPassword 1-3 by root; CreateSecret 2 by root; DeleteSecret 1 by root;
#   - GetSecretValue only by the bootstrap execution role (assumed-role session), only on
#     identity-bootstrap and identity-migrate; ZERO GetSecretValue on identity-operator.
# LookupEvents: MaxResults 50, NextToken loop, 45 s guard (connector times out at 60 s).

REGION = "eu-central-1"
T_CREATE = "<ISO-8601 time just before C-8>"


async def c24():
    start = datetime.datetime.fromisoformat(T_CREATE.replace("Z", "+00:00"))
    began = time.monotonic()
    counts = collections.Counter()
    value_kept = {"GetRandomPassword_response_present": False, "CreateSecret_secretString_present": False}
    token, pages, complete = None, 0, False
    while time.monotonic() - began < 45:
        params = {"LookupAttributes": [{"AttributeKey": "EventSource", "AttributeValue": "secretsmanager.amazonaws.com"}],
                  "StartTime": start, "MaxResults": 50}
        if token:
            params["NextToken"] = token
        r = await call_boto3(service_name="cloudtrail", operation_name="LookupEvents",
                             region_name=REGION, params=params)
        pages += 1
        for ev in r.get("Events", []):
            ct = json.loads(ev.get("CloudTrailEvent", "{}"))
            name = ct.get("eventName", "")
            ui = ct.get("userIdentity", {})
            who = ui.get("type", "") + ":" + (ui.get("sessionContext", {}).get("sessionIssuer", {}).get("userName", "") or ui.get("arn", "")[-12:])
            req = ct.get("requestParameters") or {}
            target = str(req.get("secretId", req.get("name", "")))
            target = target.split(":secret:")[-1][:60]
            counts[name + " | " + who + " | " + target] += 1
            if name == "GetRandomPassword" and ct.get("responseElements"):
                value_kept["GetRandomPassword_response_present"] = True
            if name == "CreateSecret" and any(k.lower() == "secretstring" for k in req.keys()):
                value_kept["CreateSecret_secretString_present"] = True
        token = r.get("NextToken")
        if not token:
            complete = True
            break
    return {"complete": complete, "pages": pages, "counts": dict(counts), "value_kept": value_kept}


result = await c24()
result
