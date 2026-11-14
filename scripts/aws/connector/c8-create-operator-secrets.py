# C-8  Create the persistent operator secret and the one-run bootstrap secret, in ONE connector call.
#
# Option A custody (owner decision 11 Nov 2026): the operator password is generated inside AWS
# (secretsmanager:GetRandomPassword), stored in munaxa-nonprod/identity-operator (kept) and
# munaxa-nonprod/identity-bootstrap (deleted by C-16 after the bootstrap runs and the probe), and
# never returned, printed, logged, formatted into a message, or read back. After this call returns
# the password can only be read with GetSecretValue, which no connector script ever calls.
#
# Revised for the connector sandbox (Stage E blocker BE-8, report 2026-11-14-identity-stage-e-blockers-
# remediation, file 05): no import, no __name__, no getattr/hasattr/type; checked by
# sandbox_harness.py and tested against a fake AWS only (test_connector_scripts.py). NOT RUN.
#
# The operator edits only the INPUT line, in the session copy, never in this repository:
# IDENTITY_OPERATOR_EMAIL is private runtime input (it is recorded in the account's own CloudTrail
# with the script source, never in a public place). An unedited copy aborts with EMAIL_NOT_SET.
#
# Returns names, ARNs, version ids and codes only. Never the email, never the password.

OPERATOR_EMAIL = "<IDENTITY_OPERATOR_EMAIL>"  # INPUT: the confirmed Testing operator address (private)

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
# @munaxa/auth password-policy.ts isTrivial(): a 40-character random password almost never hits it,
# but a hit would make bootstrap-account.mjs refuse the password after the secrets exist.
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


async def absent(name):
    """'' if the name does not exist (also not scheduled for deletion), else an abort code."""
    try:
        await aws("secretsmanager", "DescribeSecret", {"SecretId": name})
        return "NAME_EXISTS"
    except Exception as e:
        if code_of(e) == "AWS_ResourceNotFoundException":
            return ""
        return "PRECHECK_" + code_of(e)


async def create(name, description, payload, token):
    """CreateSecret with a fixed ClientRequestToken: one retry on a timeout or throttling is then
    idempotent (same token, same value: AWS returns the same version and creates nothing new)."""
    params = {"Name": name, "Description": description, "KmsKeyId": KMS_KEY, "SecretString": payload,
              "Tags": TAGS, "ClientRequestToken": token}
    for attempt in (1, 2):
        try:
            r = await aws("secretsmanager", "CreateSecret", params)
            return {"name": r.get("Name"), "arn": r.get("ARN"), "version": r.get("VersionId")}, ""
        except Exception as e:
            code = code_of(e)
            if attempt == 1 and code in ("PY_TIMEOUT", "AWS_ThrottlingException", "AWS_InternalServiceError"):
                continue
            return None, code
    return None, "RETRIES"


async def c8():
    problem = email_problem(OPERATOR_EMAIL)
    if problem:
        return {"result": "ABORT", "code": problem}
    problem = await this_account()
    if problem:
        return {"result": "ABORT", "code": problem}
    for name in (PERSISTENT, BOOTSTRAP):
        problem = await absent(name)
        if problem:
            return {"result": "ABORT", "code": problem, "name": name}

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
    persistent, code = await create(
        PERSISTENT, "Identity nonprod operator credential (Option A). Value never leaves AWS.",
        json.dumps({"IDENTITY_OWNER_EMAIL": OPERATOR_EMAIL, "IDENTITY_OWNER_PASSWORD": pw, "IDENTITY_ORGANISATION": ORG}),
        str(uuid.uuid4()))
    if persistent is None:
        pw = None
        # A timeout may still have created it: C-8v tells; the next C-8 aborts with NAME_EXISTS.
        return {"result": "ABORT", "code": "CREATE_PERSISTENT_" + code, "next": "C-8v"}
    out["persistent"] = persistent

    bootstrap, code = await create(
        BOOTSTRAP, "One-run Identity bootstrap secret. Deleted by C-16 (force, no recovery).",
        json.dumps({"IDENTITY_OWNER_EMAIL": OPERATOR_EMAIL, "IDENTITY_OWNER_PASSWORD": pw}),
        str(uuid.uuid4()))
    pw = None
    if bootstrap is None:
        # No roll-back delete: the persistent secret is never force-deleted (owner rule). No account
        # exists yet, so its value is unused; recovery is C-8R (rotate it in place and create the
        # bootstrap secret in one call).
        return {"result": "ABORT", "code": "CREATE_BOOTSTRAP_" + code, "persistent": persistent,
                "persistent_kept": True, "next": "C-8v then C-8R"}
    out["bootstrap"] = bootstrap
    out["result"] = "CREATED"
    return out


try:
    result = await c8()
except Exception as e:  # fail closed with a code only, never a message or a traceback
    result = {"result": "FAIL", "code": "UNEXPECTED_" + code_of(e)}
result
