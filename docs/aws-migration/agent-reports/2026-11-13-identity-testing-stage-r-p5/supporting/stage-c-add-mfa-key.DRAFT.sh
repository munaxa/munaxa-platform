#!/usr/bin/env bash
# DRAFT, NOT RUN. Stage C of the Identity Testing runbook: add MFA_ENCRYPTION_KEYS to the
# munaxa-nonprod/identity bundle as a NEW secret version. Report 2026-11-13-identity-testing-stage-r-p5/04.
#
# Where it runs: AWS CloudShell in eu-central-1, signed in to account 229251310592 (route M-1 in 04),
# only after the owner's explicit stage C approval. It is NOT for a Claude session, a CI runner or a
# laptop shell.
#
# What it guarantees:
#   - the key is 32 bytes from the operating system CSPRNG (Python `secrets`), created in this process
#     and handed to Secrets Manager in the same process; it is never printed, never written to a file,
#     never put in an environment variable or a command-line argument, and never enters shell history;
#   - the other bundle values are read and written back inside the same Python process only; nothing
#     of them is printed;
#   - it refuses to run if the account or region is wrong, if the bundle already has
#     MFA_ENCRYPTION_KEYS, if a required key is missing, or if AWSCURRENT is not the version the stack
#     pins today (ad02f18e-...), so it cannot silently build on an unknown version;
#   - it prints only: the new version id, the previous version id, the kid, and the sorted key NAMES.
#
# What it does not do: it does not change the version the ECS task definitions pin (they keep
# ad02f18e until the P-5 PR is updated and applied), rotate anything, touch any other secret, or print
# a value. Moving AWSCURRENT to the new version is safe: no task definition reads AWSCURRENT of this
# bundle (every reference carries a version id, infra/aws/stack/services.tf).
#
# Paste as is: the body runs in a CHILD shell (bash <<'SH'), so an abort or set -e never closes the
# interactive CloudShell session and the ABORT line stays on screen (review round 2, finding 1).
set +o history
bash <<'SH'
set -euo pipefail
umask 077
export AWS_REGION=eu-central-1 AWS_DEFAULT_REGION=eu-central-1 AWS_PAGER=""

python3 -I - <<'PY'
import base64, json, secrets, sys, uuid
try:
    import boto3
    from botocore.exceptions import ClientError
except ImportError:
    print("ABORT BOTO3_MISSING (run: pip3 install --user boto3, then paste again)")
    sys.exit(1)

# Any unexpected error (AccessDenied, KMS, network) prints its type and AWS error code only: no
# traceback, no message text, so nothing of a request or a value can reach the screen.
def _quiet(kind, error, _tb):
    code = error.response.get("Error", {}).get("Code", "") if isinstance(error, ClientError) else ""
    print(f"ABORT EXCEPTION {kind.__name__} {code}".rstrip())
sys.excepthook = _quiet

ACCOUNT = "229251310592"
NAME = "munaxa-nonprod/identity"
KID = "mfa-nonprod-2026-11"
EXPECTED_CURRENT = "ad02f18e-f3e7-41da-9959-f9b41e0b7e1a"
REQUIRED = {"DATABASE_URL", "IDENTITY_SIGNING_PRIVATE_KEY", "IDENTITY_SIGNING_SECRET", "REDIS_URL", "REDIS_PASSWORD"}

def stop(code):
    print(f"ABORT {code}")
    sys.exit(1)

if boto3.client("sts").get_caller_identity()["Account"] != ACCOUNT:
    stop("WRONG_ACCOUNT")
sm = boto3.client("secretsmanager", region_name="eu-central-1")

meta = sm.describe_secret(SecretId=NAME)
current = [v for v, stages in meta.get("VersionIdsToStages", {}).items() if "AWSCURRENT" in stages]
if current != [EXPECTED_CURRENT]:
    stop("AWSCURRENT_IS_NOT_THE_PINNED_VERSION")

got = sm.get_secret_value(SecretId=NAME, VersionId=EXPECTED_CURRENT)
bundle = json.loads(got["SecretString"])
del got
if not isinstance(bundle, dict):
    stop("BUNDLE_NOT_A_JSON_OBJECT")
if not REQUIRED.issubset(bundle):
    stop("REQUIRED_KEY_MISSING")
if not all(isinstance(bundle[k], str) and bundle[k].strip() for k in REQUIRED):
    stop("REQUIRED_VALUE_NOT_A_NON_EMPTY_STRING")
if "MFA_ENCRYPTION_KEYS" in bundle:
    stop("MFA_ENCRYPTION_KEYS_ALREADY_PRESENT")

raw = secrets.token_bytes(32)
if len(set(raw)) == 1:
    stop("DEGENERATE_KEY")
key = base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")  # 43 characters
# Identity refuses a key equal to IDENTITY_SIGNING_SECRET or found in the signing key; check first.
for other in (bundle["IDENTITY_SIGNING_SECRET"], bundle["IDENTITY_SIGNING_PRIVATE_KEY"]):
    if key in other or base64.b64encode(raw).decode().rstrip("=") in other:
        stop("KEY_COLLIDES_WITH_ANOTHER_SECRET")
bundle["MFA_ENCRYPTION_KEYS"] = f"{KID}={key}"
del raw, key

out = sm.put_secret_value(
    SecretId=NAME,
    SecretString=json.dumps(bundle, separators=(",", ":")),
    ClientRequestToken=str(uuid.uuid4()),
)
names = sorted(bundle)
del bundle

# Verify after the write: Secrets Manager has no conditional write, so this also catches a concurrent
# write between the read and the write (review round 2, finding 3).
after = sm.describe_secret(SecretId=NAME).get("VersionIdsToStages", {})
if "AWSCURRENT" not in after.get(out["VersionId"], []) or "AWSPREVIOUS" not in after.get(EXPECTED_CURRENT, []):
    print(f"WRITTEN_BUT_UNEXPECTED_STAGES new_version_id {out['VersionId']} (stop, report this line, write nothing more)")
    sys.exit(1)

print("CREATED VERIFIED")
print(f"secret          {NAME}")
print(f"new_version_id  {out['VersionId']}")
print(f"previous        {EXPECTED_CURRENT}")
print(f"kid             {KID}")
print(f"key_names       {','.join(names)}")
PY
SH
