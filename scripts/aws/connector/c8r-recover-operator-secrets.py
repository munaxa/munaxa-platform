# C-8R  Recovery: the persistent secret exists, the bootstrap secret does not, NO account exists yet.
#
# Used only when C-8 stopped after creating munaxa-nonprod/identity-operator (CREATE_BOOTSTRAP_*,
# or a timeout after the first CreateSecret), or when C-16 removed the bootstrap secret before the
# bootstrap task created the account. The operator first confirms from the bootstrap task's
# allow-listed log that it has NOT printed "Created ... in organisation munaxa-group." (if it has,
# C-8R must not run: rotating the persistent value would leave nobody holding the live password).
# One call: generate in AWS, PutSecretValue on the persistent secret (the never-used value becomes
# AWSPREVIOUS), CreateSecret for the bootstrap secret. The persistent secret is never deleted.
#
# Revised for the connector sandbox (BE-8). NOT RUN. Returns names, ARNs, version ids, codes only.
# The call record of this script (its source holds the email) is never committed as evidence
# (owner review B-7); only the returned names, ARNs, version ids and codes are recorded.

OPERATOR_EMAIL = "<IDENTITY_OPERATOR_EMAIL>"  # INPUT: the confirmed Testing operator address (private)
NO_ACCOUNT_CONFIRMED = False  # INPUT: True only after the bootstrap log shows no "Created" line

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
SEQUENCES = ["0123456789", "abcdefghijklmnopqrstuvwxyz", "qwertyuiop", "asdfghjkl", "zxcvbnm"]
EMAIL_SHAPE = re.compile(r"^[A-Za-z0-9.!#$%&*+/=?^_{|}~-]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$")


def email_problem(email):
    if not isinstance(email, str) or email.startswith("<"):
        return "EMAIL_NOT_SET"
    if len(email) > 254 or not EMAIL_SHAPE.match(email):
        return "EMAIL_MALFORMED"
    domain = email.rsplit("@", 1)[1].lower()
    if domain.endswith((".invalid", ".example", ".test", ".localhost")) or domain in ("example.com", "example.org", "example.net"):
        return "EMAIL_RESERVED_DOMAIN"
    return ""


def acceptable(pw, email):
    low = pw.lower()
    if not 12 <= len(pw) <= 128:
        return False
    if len(set(low)) == 1:
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


async def c8r():
    problem = email_problem(OPERATOR_EMAIL)
    if problem:
        return {"result": "ABORT", "code": problem}
    if NO_ACCOUNT_CONFIRMED is not True:
        return {"result": "ABORT", "code": "NO_ACCOUNT_NOT_CONFIRMED"}
    problem = await this_account()
    if problem:
        return {"result": "ABORT", "code": problem}
    try:
        d = await aws("secretsmanager", "DescribeSecret", {"SecretId": PERSISTENT})
    except Exception as e:
        return {"result": "ABORT", "code": "PERSISTENT_" + code_of(e)}
    if d.get("Name") != PERSISTENT or "DeletedDate" in d or not str(d.get("ARN", "")).startswith(
            "arn:aws:secretsmanager:" + REGION + ":" + ACCOUNT + ":secret:" + PERSISTENT + "-"):
        return {"result": "ABORT", "code": "PERSISTENT_NOT_USABLE"}
    try:
        await aws("secretsmanager", "DescribeSecret", {"SecretId": BOOTSTRAP})
        return {"result": "ABORT", "code": "BOOTSTRAP_EXISTS"}
    except Exception as e:
        if code_of(e) != "AWS_ResourceNotFoundException":
            return {"result": "ABORT", "code": "PRECHECK_" + code_of(e)}

    pw = None
    for _ in range(3):
        try:
            r = await aws("secretsmanager", "GetRandomPassword", {
                "PasswordLength": 40, "ExcludeCharacters": "\"'`\\", "RequireEachIncludedType": True,
            })
            candidate = r["RandomPassword"]
            r = None
        except Exception as e:
            return {"result": "ABORT", "code": "GENERATE_" + code_of(e)}
        if isinstance(candidate, str) and acceptable(candidate, OPERATOR_EMAIL):
            pw = candidate
            break
        candidate = None
    if pw is None:
        return {"result": "ABORT", "code": "GENERATE_POLICY_RETRIES"}

    out = {"result": "FAIL"}
    # A fixed ClientRequestToken makes one retry after a timeout idempotent (same token, same value).
    token = str(uuid.uuid4())
    persistent = None
    for attempt in (1, 2):
        try:
            p = await aws("secretsmanager", "PutSecretValue", {
                "SecretId": d["ARN"], "ClientRequestToken": token,
                "SecretString": json.dumps({"IDENTITY_OWNER_EMAIL": OPERATOR_EMAIL, "IDENTITY_OWNER_PASSWORD": pw, "IDENTITY_ORGANISATION": ORG}),
            })
            persistent = {"name": p.get("Name"), "arn": p.get("ARN"), "version": p.get("VersionId")}
            break
        except Exception as e:
            code = code_of(e)
            if attempt == 1 and code in ("PY_TIMEOUT", "AWS_ThrottlingException", "AWS_InternalServiceError"):
                continue
            pw = None
            return {"result": "ABORT", "code": "ROTATE_PERSISTENT_" + code, "next": "C-8v"}
    out["persistent"] = persistent

    token = str(uuid.uuid4())
    for attempt in (1, 2):
        try:
            b = await aws("secretsmanager", "CreateSecret", {
                "Name": BOOTSTRAP, "KmsKeyId": KMS_KEY, "Tags": TAGS, "ClientRequestToken": token,
                "Description": "One-run Identity bootstrap secret. Deleted by C-16 (force, no recovery).",
                "SecretString": json.dumps({"IDENTITY_OWNER_EMAIL": OPERATOR_EMAIL, "IDENTITY_OWNER_PASSWORD": pw}),
            })
            out["bootstrap"] = {"name": b.get("Name"), "arn": b.get("ARN"), "version": b.get("VersionId")}
            break
        except Exception as e:
            code = code_of(e)
            if attempt == 1 and code in ("PY_TIMEOUT", "AWS_ThrottlingException", "AWS_InternalServiceError"):
                continue
            pw = None
            return {"result": "ABORT", "code": "CREATE_BOOTSTRAP_" + code, "persistent": persistent,
                    "persistent_kept": True, "next": "C-8v then C-8R"}
    pw = None
    out["result"] = "CREATED"
    return out


try:
    result = await c8r()
except Exception as e:  # fail closed with a code only, never a message or a traceback
    result = {"result": "FAIL", "code": "UNEXPECTED_" + code_of(e)}
result
