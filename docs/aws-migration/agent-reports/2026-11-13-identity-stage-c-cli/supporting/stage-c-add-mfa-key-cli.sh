#!/usr/bin/env bash
# Stage C of the Identity Testing runbook: add MFA_ENCRYPTION_KEYS to the munaxa-nonprod/identity
# bundle as ONE new secret version. Revision 2 (report 2026-11-13-identity-stage-c-cli): the same
# checks as revision 1 (report 2026-11-13-identity-stage-c), but every AWS call goes through the
# preinstalled AWS CLI v2, because CloudShell's /usr/bin/python3 has no boto3 in isolated mode.
#
# Run it ONLY as the owner, in AWS CloudShell, eu-central-1, account 229251310592, with:
#     /bin/bash -p ./stage-c-add-mfa-key-cli.sh
# Never `source` it, never paste its body, never run it in a Claude session, a CI runner or a laptop.
#
# Guarantees:
#   - Tooling first, before any AWS call: the AWS CLI is the root-owned v2 install outside the home
#     directory, and CloudShell's container credentials are present.
#   - Preflight, metadata only: account, region, the exact secret ARN, its KMS key, that the secret
#     has exactly one version, ad02f18e-..., labelled AWSCURRENT, and no rotation, deletion or
#     replication. Then it asks the operator to type CREATE. Anything else stops with nothing read.
#   - It reads the pinned version, checks the bundle is exactly the five keys Identity's stack expects
#     (infra/aws/stack/data.tf), all non-empty strings, no duplicate keys, no MFA_ENCRYPTION_KEYS.
#   - The key is 32 bytes from the operating system CSPRNG (Python `secrets`), base64url without
#     padding (43 characters), checked with the same rules as Identity's own parser
#     (munaxa-identity packages/config/src/mfa-keys.ts at 2db6ed9).
#   - Values never leave this Python process except to the AWS CLI: every request goes to the CLI as
#     its standard input (--cli-input-json file:///dev/stdin), an anonymous in-memory file (memfd)
#     with no path, and every response comes back on a pipe. No value is ever a command-line argument, an environment variable, a file, a
#     history entry or terminal output. The CLI runs with a fresh empty home directory, no config or
#     credentials file (so no CLI history, alias, plugin or profile), no pager and no debug output.
#   - It writes ONE new version with PutSecretValue and a ClientRequestToken generated once per run
#     (so a CLI retry within the run cannot create a second version; a re-run is guarded by the label
#     preflight), without VersionStages: AWSCURRENT moves to the new version and ad02f18e becomes
#     AWSPREVIOUS. Nothing is deleted or overwritten; versions are immutable.
#   - It verifies afterwards: the new version holds exactly the old five values plus the ring, and the
#     labels are exactly {new: AWSCURRENT, ad02f18e: AWSPREVIOUS}.
#   - It prints only non-secret lines: ids, ARNs, the kid, key NAMES, labels and check results.
#     An error prints `ABORT <reason>` with at most an AWS error code, never a message or a traceback.
#   - Running it again is safe: if stage C is already done it writes nothing, re-checks the existing
#     version (read only) and prints its id; any other unexpected state stops before reading a value.
if [[ "${BASH_SOURCE[0]}" != "$0" ]]; then
  echo "ABORT SOURCED (run it as: /bin/bash -p ./stage-c-add-mfa-key-cli.sh)"
  return 1
fi
set -euo pipefail
set +x
umask 077
ulimit -c 0  # no core file can ever hold a value
# Nothing from the persistent home directory or the inherited environment may redirect the process,
# its TLS trust, its proxy or its credentials: CloudShell's own container credentials are used.
unset TMPDIR PYTHONPATH PYTHONHOME PYTHONSTARTUP PYTHONINSPECT PYTHONWARNINGS AWS_PROFILE AWS_ENDPOINT_URL \
  AWS_ENDPOINT_URL_SECRETS_MANAGER AWS_ENDPOINT_URL_STS AWS_CA_BUNDLE AWS_ACCESS_KEY_ID \
  AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN LD_PRELOAD LD_LIBRARY_PATH OPENSSL_CONF SSL_CERT_FILE \
  SSL_CERT_DIR REQUESTS_CA_BUNDLE CURL_CA_BUNDLE HTTP_PROXY HTTPS_PROXY ALL_PROXY NO_PROXY http_proxy \
  https_proxy all_proxy no_proxy
export AWS_CONFIG_FILE=/dev/null AWS_SHARED_CREDENTIALS_FILE=/dev/null PATH=/usr/bin:/bin
export AWS_REGION=eu-central-1 AWS_DEFAULT_REGION=eu-central-1 AWS_PAGER=""
cd /

# Python starts with an empty environment plus an allowlist: CloudShell's container credential
# variables, nothing else (no LD_*, GCONV_PATH, MALLOC_*, locale or loader settings from the shell).
exec /usr/bin/env -i PATH=/usr/bin:/bin LANG=C.UTF-8 LC_ALL=C.UTF-8 \
  ${AWS_CONTAINER_CREDENTIALS_FULL_URI:+AWS_CONTAINER_CREDENTIALS_FULL_URI="$AWS_CONTAINER_CREDENTIALS_FULL_URI"} \
  ${AWS_CONTAINER_CREDENTIALS_RELATIVE_URI:+AWS_CONTAINER_CREDENTIALS_RELATIVE_URI="$AWS_CONTAINER_CREDENTIALS_RELATIVE_URI"} \
  ${AWS_CONTAINER_AUTHORIZATION_TOKEN:+AWS_CONTAINER_AUTHORIZATION_TOKEN="$AWS_CONTAINER_AUTHORIZATION_TOKEN"} \
  ${AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE:+AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE="$AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE"} \
  /usr/bin/python3 -I -W ignore - <<'PY'
import base64, binascii, ctypes, json, logging, os, re, secrets, shutil, stat, subprocess, sys, tempfile, uuid, warnings

warnings.simplefilter("ignore")  # e.g. a Python-version deprecation notice; warnings carry no values

logging.disable(logging.CRITICAL)

LIBC = ctypes.CDLL(None, use_errno=True)
try:
    LIBC.prctl(4, 0, 0, 0, 0)  # PR_SET_DUMPABLE 0: no core dump, no ptrace or /proc/<pid>/mem by the same user
except Exception:
    pass

ACCOUNT = "229251310592"
REGION = "eu-central-1"
NAME = "munaxa-nonprod/identity"
ARN = "arn:aws:secretsmanager:eu-central-1:229251310592:secret:munaxa-nonprod/identity-sn5umm"
KMS_KEY = "arn:aws:kms:eu-central-1:229251310592:key/45eda044-092a-4f31-9243-3f9548636e37"
PINNED = "ad02f18e-f3e7-41da-9959-f9b41e0b7e1a"
KID = "mfa-nonprod-2026-11"
EXPECTED_KEYS = ["DATABASE_URL", "IDENTITY_SIGNING_PRIVATE_KEY", "IDENTITY_SIGNING_SECRET", "REDIS_URL", "REDIS_PASSWORD"]
RING = "MFA_ENCRYPTION_KEYS"
# The AWS CLI v2: the official installer layout (/usr/local/bin/aws -> /usr/local/aws-cli/v2/...)
# or a distribution package at /usr/bin/aws. Never anything under a home directory.
AWS_CANDIDATES = ["/usr/local/bin/aws", "/usr/bin/aws"]
AWS_REAL_PREFIX = "/usr/local/aws-cli/v2/"
ENDPOINTS = {"sts": f"https://sts.{REGION}.amazonaws.com",
             "secretsmanager": f"https://secretsmanager.{REGION}.amazonaws.com"}
PHASE = "preflight"  # preflight -> read -> write-sent -> verify
CLI_HOME = None


def say(line):
    print(line, flush=True)


def cleanup():
    if CLI_HOME:
        shutil.rmtree(CLI_HOME, ignore_errors=True)


def stop(reason):
    say(f"ABORT {reason}")
    if PHASE in ("write-sent", "verify"):
        say("ABORT AFTER_WRITE_ATTEMPT: send these ABORT lines to Claude before doing anything else")
    else:
        say("NOTHING WRITTEN")
    cleanup()
    sys.exit(1)


def _quiet(kind, error, _tb):
    # Never a traceback or message text: a message could quote a request. Type only.
    try:
        stop(f"EXCEPTION {kind.__name__}")
    except SystemExit:
        pass


sys.excepthook = _quiet


# ---- Identity's rules (munaxa-identity 2db6ed9 packages/config/src/mfa-keys.ts) -----------------
def identity_decode(text):
    """decode(): base64 or base64url, optional padding; None when Identity would refuse it."""
    if not re.fullmatch(r"[A-Za-z0-9+/_-]+={0,2}", text):
        return None
    try:
        s = text.replace("-", "+").replace("_", "/").rstrip("=")
        return base64.b64decode(s + "=" * (-len(s) % 4))
    except (binascii.Error, ValueError):
        return None


def reuses(key_bytes, other):
    """reusesSecret(): the key is the other secret, its decoding, or appears inside it."""
    text = other.strip()
    if text == "":
        return False
    if key_bytes == text.encode("utf-8"):
        return True
    decoded = identity_decode(text)
    if decoded and key_bytes == decoded:
        return True
    std = base64.b64encode(key_bytes).decode("ascii").rstrip("=")
    url = base64.urlsafe_b64encode(key_bytes).decode("ascii").rstrip("=")
    return std in text or url in text


def ring_ok(ring, bundle):
    """parseMfaKeys() + mfaKeyIssues() for a one-entry ring named KID."""
    if ring.count(",") or "=" not in ring:
        return False
    kid, encoded = (part.strip() for part in ring.split("=", 1))
    raw = identity_decode(encoded)
    good = (kid == KID and raw is not None and len(raw) == 32 and len(set(raw)) > 1
            and not reuses(raw, bundle["IDENTITY_SIGNING_SECRET"])
            and not reuses(raw, bundle["IDENTITY_SIGNING_PRIVATE_KEY"]))
    del raw, encoded
    return good


def no_duplicates(pairs):
    seen = {}
    for k, v in pairs:
        if k in seen:
            raise ValueError("duplicate")
        seen[k] = v
    return seen


# ---- the AWS CLI, values only on pipes ----------------------------------------------------------
def find_cli():
    for path in AWS_CANDIDATES:
        if os.path.lexists(path):
            real = os.path.realpath(path)
            if not (real.startswith(AWS_REAL_PREFIX) or real == "/usr/bin/aws") or "/home/" in real:
                stop("AWS_CLI_UNEXPECTED_LOCATION")
            # Root-owned and not writable by group or others: the link, the binary, every parent
            # directory, and for the official installer every file of that CLI version.
            check = [path, real]
            parent = os.path.dirname(real)
            while parent not in ("", "/"):
                check.append(parent)
                parent = os.path.dirname(parent)
            if real.startswith(AWS_REAL_PREFIX):
                root = AWS_REAL_PREFIX + real[len(AWS_REAL_PREFIX):].split("/", 1)[0]
                def unreadable(_error):
                    stop("AWS_CLI_NOT_ROOT_OWNED")
                for top, dirs, files in os.walk(root, onerror=unreadable):
                    check.extend(os.path.join(top, n) for n in dirs + files)
            for p in check:
                st = os.lstat(p)
                if st.st_uid != 0 or (not stat.S_ISLNK(st.st_mode) and st.st_mode & 0o022):
                    stop("AWS_CLI_NOT_ROOT_OWNED")
            return path
    stop("AWS_CLI_MISSING")


def cli_env(home):
    env = {"PATH": "/usr/bin:/bin", "HOME": home, "LANG": "C.UTF-8", "LC_ALL": "C.UTF-8",
           "AWS_CONFIG_FILE": "/dev/null", "AWS_SHARED_CREDENTIALS_FILE": "/dev/null",
           "AWS_REGION": REGION, "AWS_DEFAULT_REGION": REGION, "AWS_PAGER": "", "AWS_CLI_AUTO_PROMPT": "off",
           "AWS_RETRY_MODE": "standard", "AWS_MAX_ATTEMPTS": "3", "AWS_EC2_METADATA_DISABLED": "true",
           "AWS_CLI_FILE_ENCODING": "UTF-8"}
    # CloudShell's own credentials: the container credential provider, nothing else.
    for name in ("AWS_CONTAINER_CREDENTIALS_FULL_URI", "AWS_CONTAINER_CREDENTIALS_RELATIVE_URI",
                 "AWS_CONTAINER_AUTHORIZATION_TOKEN", "AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE"):
        if os.environ.get(name):
            env[name] = os.environ[name]
    return env


def memfd():
    if hasattr(os, "memfd_create"):
        return os.memfd_create("stage-c-request", os.MFD_CLOEXEC)
    fd = LIBC.memfd_create(b"stage-c-request", 1)  # MFD_CLOEXEC
    if fd < 0:
        stop("NO_MEMFD")
    return fd


def aws(service, operation, params):
    """One AWS call. The request is the CLI's standard input, the response comes back on a pipe."""
    cmd = [AWS, service, operation, "--cli-input-json", "file:///dev/stdin", "--output", "json",
           "--region", REGION, "--endpoint-url", ENDPOINTS[service], "--no-cli-pager", "--no-cli-auto-prompt",
           "--cli-connect-timeout", "10", "--cli-read-timeout", "30"]
    # The CLI opens file:///dev/stdin twice, so a pipe would arrive empty the second time. The request
    # goes in an anonymous in-memory file (memfd: no path, no disk, gone when closed) given as stdin.
    request = memfd()
    try:
        os.write(request, json.dumps(params).encode("utf-8"))
        os.lseek(request, 0, os.SEEK_SET)
        proc = subprocess.run(cmd, stdin=request, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                              env=ENV, cwd=CLI_HOME, timeout=300, close_fds=True)
    finally:
        os.close(request)
    if proc.returncode != 0:
        # Only the error code, never the message: "An error occurred (Code) when calling ...".
        m = re.search(rb"An error occurred \(([A-Za-z0-9.]{1,64})\)", proc.stderr)
        code = m.group(1).decode("ascii") if m else f"cli_exit={proc.returncode}"
        del proc
        stop(f"AWS_ERROR {operation} {code}")
    try:
        out = json.loads(proc.stdout.decode("utf-8"))
    except ValueError:
        out = None
    del proc
    if not isinstance(out, dict):
        stop(f"AWS_OUTPUT_UNEXPECTED {operation}")
    return out


def read_bundle(version_id, stage):
    got = aws("secretsmanager", "get-secret-value", {"SecretId": ARN, "VersionId": version_id, "VersionStage": stage})
    if got.get("ARN") != ARN or got.get("VersionId") != version_id or stage not in got.get("VersionStages", []):
        stop("READ_RESPONSE_MISMATCH")
    if not isinstance(got.get("SecretString"), str) or "SecretBinary" in got:
        stop("BUNDLE_NOT_A_STRING")
    text = got["SecretString"]
    del got
    try:
        value = json.loads(text, object_pairs_hook=no_duplicates)
    except ValueError:
        stop("BUNDLE_NOT_VALID_JSON_OR_DUPLICATE_KEY")
    if not isinstance(value, dict):
        stop("BUNDLE_NOT_A_JSON_OBJECT")
    if not all(isinstance(v, str) and v.strip() for v in value.values()):
        stop("BUNDLE_VALUE_NOT_A_NON_EMPTY_STRING")
    return text, value


if not re.fullmatch(r"[A-Za-z0-9_-]{1,64}", KID) or len(KID) == 43:
    stop("KID_INVALID")
os.close(memfd())  # fails closed here, before any AWS call, if no memfd is available

# ---- tooling: no AWS call yet -------------------------------------------------------------------
AWS = find_cli()
if not (os.environ.get("AWS_CONTAINER_CREDENTIALS_FULL_URI") or os.environ.get("AWS_CONTAINER_CREDENTIALS_RELATIVE_URI")):
    stop("CLOUDSHELL_CREDENTIALS_MISSING")
CLI_HOME = tempfile.mkdtemp(prefix="stage-c-cli-")  # empty, mode 0700, removed at the end
ENV = cli_env(CLI_HOME)
ver = subprocess.run([AWS, "--version"], stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                     env=ENV, cwd=CLI_HOME, timeout=60, close_fds=True)
version = ver.stdout.decode("ascii", "replace").split(" ")[0].strip()
if ver.returncode != 0 or not re.fullmatch(r"aws-cli/2\.[0-9]+\.[0-9]+", version):
    stop("AWS_CLI_NOT_VERSION_2")
say(f"aws_cli         {AWS} {version}")
say(f"python          {sys.version_info[0]}.{sys.version_info[1]}.{sys.version_info[2]} isolated={bool(sys.flags.isolated)}")

# ---- preflight: metadata only ------------------------------------------------------------------
who = aws("sts", "get-caller-identity", {})
if who.get("Account") != ACCOUNT:
    stop("WRONG_ACCOUNT")
say(f"caller          {who.get('Arn')}")
say(f"account         {ACCOUNT}")
say(f"region          {REGION}")

meta = aws("secretsmanager", "describe-secret", {"SecretId": ARN})
if meta.get("ARN") != ARN or meta.get("Name") != NAME:
    stop("SECRET_ARN_OR_NAME_MISMATCH")
if meta.get("KmsKeyId") != KMS_KEY:
    stop("SECRET_KMS_KEY_MISMATCH")
if meta.get("DeletedDate") is not None:
    stop("SECRET_SCHEDULED_FOR_DELETION")
if meta.get("RotationEnabled"):
    stop("SECRET_HAS_ROTATION")
if meta.get("ReplicationStatus") or meta.get("PrimaryRegion") not in (None, REGION):
    stop("SECRET_IS_REPLICATED")
say(f"secret          {ARN}")
say(f"kms_key         {KMS_KEY}")

stages = meta.get("VersionIdsToStages", {})
if stages != {PINNED: ["AWSCURRENT"]}:
    others = [v for v in stages if v != PINNED]
    if len(stages) == 2 and stages.get(PINNED) == ["AWSPREVIOUS"] and stages.get(others[0]) == ["AWSCURRENT"]:
        # Stage C already happened (perhaps an earlier run whose screen was lost). Write nothing;
        # re-check the existing version, read only, and report its id.
        done = others[0]
        say(f"already_done    {done} is AWSCURRENT, {PINNED} is AWSPREVIOUS: checking it, read only")
        old_text, old = read_bundle(PINNED, "AWSPREVIOUS")
        new_text, new = read_bundle(done, "AWSCURRENT")
        ok = (sorted(old) == sorted(EXPECTED_KEYS) and sorted(new) == sorted(EXPECTED_KEYS + [RING])
              and all(new[k] == old[k] for k in EXPECTED_KEYS) and ring_ok(new[RING], new))
        del old_text, new_text, old, new
        if not ok:
            stop("EXISTING_VERSION_NOT_AS_EXPECTED (do not run again; send this line to Claude)")
        say("ALREADY DONE VERIFIED   nothing written by this run")
        say(f"new_version_id  {done}   (AWSCURRENT)")
        say(f"previous        {PINNED}   (AWSPREVIOUS)")
        say(f"kid             {KID}")
        say("SEND CLAUDE     the new_version_id and kid lines above, nothing else")
        cleanup()
        sys.exit(0)
    stop(f"UNEXPECTED_VERSIONS count={len(stages)}")
# VersionIdsToStages omits versions without a label; count every version, deprecated ones included.
listed = aws("secretsmanager", "list-secret-version-ids", {"SecretId": ARN, "IncludeDeprecated": True}).get("Versions", [])
if [v.get("VersionId") for v in listed] != [PINNED]:
    stop(f"UNEXPECTED_VERSIONS listed={len(listed)}")
say(f"current         {PINNED} (the only version)")
say("PREFLIGHT OK    nothing read or written yet")

try:
    with open("/dev/tty", "r") as tty:
        sys.stdout.write("Type CREATE and press Enter to add the MFA key ring (anything else stops): ")
        sys.stdout.flush()
        answer = tty.readline().strip()
except OSError:
    stop("NO_TERMINAL")
if answer != "CREATE":
    stop("NOT_CONFIRMED")

# ---- read the pinned version, inside this process only ------------------------------------------
PHASE = "read"
_text, bundle = read_bundle(PINNED, "AWSCURRENT")
del _text
if RING in bundle:
    stop("MFA_ENCRYPTION_KEYS_ALREADY_PRESENT")
if sorted(bundle) != sorted(EXPECTED_KEYS):
    missing = [k for k in EXPECTED_KEYS if k not in bundle]
    stop(f"BUNDLE_KEYS_UNEXPECTED missing={','.join(missing) or 'none'} extra_count={len(set(bundle) - set(EXPECTED_KEYS))}")
original = dict(bundle)

# ---- the key ----------------------------------------------------------------------------------
raw = secrets.token_bytes(32)
key = base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")
if len(raw) != 32 or len(key) != 43 or identity_decode(key) != raw or len(set(raw)) == 1:
    stop("KEY_SELF_CHECK_FAILED")
if reuses(raw, bundle["IDENTITY_SIGNING_SECRET"]) or reuses(raw, bundle["IDENTITY_SIGNING_PRIVATE_KEY"]):
    stop("KEY_COLLIDES_WITH_ANOTHER_SECRET")
bundle[RING] = f"{KID}={key}"
del raw, key
if not ring_ok(bundle[RING], bundle):
    stop("RING_SELF_CHECK_FAILED")
new_string = json.dumps(bundle, separators=(",", ":"), ensure_ascii=True)
check = json.loads(new_string)
if {k: v for k, v in check.items() if k != RING} != original or list(check)[:5] != list(original):
    stop("MERGE_SELF_CHECK_FAILED")
del check

# ---- write one new version ---------------------------------------------------------------------
# The preflight may be minutes old (the prompt): require the same labels right before the write.
if aws("secretsmanager", "describe-secret", {"SecretId": ARN}).get("VersionIdsToStages", {}) != {PINNED: ["AWSCURRENT"]}:
    stop("LABELS_CHANGED_SINCE_PREFLIGHT")
token = str(uuid.uuid4())
PHASE = "write-sent"
say(f"writing         new version {token}")
out = aws("secretsmanager", "put-secret-value", {"SecretId": ARN, "SecretString": new_string, "ClientRequestToken": token})
if out.get("ARN") != ARN or out.get("VersionId") != token or out.get("VersionStages") != ["AWSCURRENT"]:
    stop("WRITE_RESPONSE_UNEXPECTED")

# ---- verify: labels by metadata, content inside this process ------------------------------------
PHASE = "verify"
after = aws("secretsmanager", "describe-secret", {"SecretId": ARN}).get("VersionIdsToStages", {})
if after != {token: ["AWSCURRENT"], PINNED: ["AWSPREVIOUS"]}:
    stop(f"LABELS_UNEXPECTED versions={len(after)}")
back_text, _back = read_bundle(token, "AWSCURRENT")
same = back_text == new_string
del back_text, _back, new_string
if not same:
    stop("WRITTEN_VALUE_DIFFERS")
names = ",".join(sorted(bundle))
del bundle, original
cleanup()

say("CREATED VERIFIED")
say(f"secret          {NAME}")
say(f"new_version_id  {token}   (AWSCURRENT)")
say(f"previous        {PINNED}   (AWSPREVIOUS)")
say(f"kid             {KID}")
say(f"key_names       {names}")
say("SEND CLAUDE     the new_version_id and kid lines above, nothing else")
PY
