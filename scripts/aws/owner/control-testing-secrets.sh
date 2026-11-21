#!/usr/bin/env bash
# Munaxa Control in Testing (nonprod): fill the Control database bundles INSIDE AWS, so neither
# database credential ever passes through Claude, a chat, a repository, a CI runner or a laptop.
# Report: docs/aws-migration/agent-reports/2026-11-20-docs-first-next-readiness/ (Control C-0).
# Infrastructure: infra/aws/stack/data.tf (bundle keys), ops.tf and scripts/db-bootstrap.sh (the
# db-admin task creates the control database and its two roles from these two URLs).
#
# Run it ONLY as the owner, in AWS CloudShell, eu-central-1, account 229251310592:
#     /bin/bash -p ./control-testing-secrets.sh <mode>
# Never `source` it, never paste its body, never run it in a Claude session or a CI runner.
#
# Modes (bundles needs the operator to type FILL):
#   bundles   First fill of munaxa-nonprod/control-migrate (DATABASE_MIGRATION_URL, control_owner)
#             and munaxa-nonprod/control-api (DATABASE_URL, control_app), in that order. Generates
#             both passwords here (Python `secrets`, 32 random bytes, hex as db-bootstrap.sh
#             requires) and writes ONE version per bundle. Resumable: a bundle already written is
#             read back and checked, never rewritten.
#   status    Metadata only: versions and labels. Reads no value.
#
# Guarantees: the same custody rules as docs-testing-secrets.sh and the Identity stage C script
# (values only on the AWS CLI's stdin and pipes, never argv, environment, files or output; ABORT
# lines carry at most an AWS error code; one PutSecretValue per bundle with a fresh
# ClientRequestToken, then a read-back of the value and the labels; one run at a time through
# /tmp/control-testing-secrets.lock). Nothing is ever deleted.
if [[ "${BASH_SOURCE[0]}" != "$0" ]]; then
  echo "ABORT SOURCED (run it as: /bin/bash -p ./control-testing-secrets.sh <mode>)"
  return 1
fi
set -euo pipefail
set +x
umask 077
ulimit -c 0 # no core file can ever hold a value
MODE=${1:-}
KEY_ARG=${2:-}
case "$MODE" in
  bundles | status) [[ $# -eq 1 ]] || { echo "ABORT USAGE"; exit 2; } ;;
  *) echo "ABORT USAGE bundles|status"; exit 2 ;;
esac
unset TMPDIR PYTHONPATH PYTHONHOME PYTHONSTARTUP PYTHONINSPECT PYTHONWARNINGS AWS_PROFILE AWS_ENDPOINT_URL \
  AWS_ENDPOINT_URL_SECRETS_MANAGER AWS_ENDPOINT_URL_STS AWS_ENDPOINT_URL_RDS AWS_CA_BUNDLE AWS_ACCESS_KEY_ID \
  AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN LD_PRELOAD LD_LIBRARY_PATH OPENSSL_CONF SSL_CERT_FILE \
  SSL_CERT_DIR REQUESTS_CA_BUNDLE CURL_CA_BUNDLE HTTP_PROXY HTTPS_PROXY ALL_PROXY NO_PROXY http_proxy \
  https_proxy all_proxy no_proxy
export AWS_CONFIG_FILE=/dev/null AWS_SHARED_CREDENTIALS_FILE=/dev/null PATH=/usr/bin:/bin
export AWS_REGION=eu-central-1 AWS_DEFAULT_REGION=eu-central-1 AWS_PAGER=""
cd /

exec /usr/bin/env -i PATH=/usr/bin:/bin LANG=C.UTF-8 LC_ALL=C.UTF-8 MODE="$MODE" KEY_ARG="$KEY_ARG" \
  ${AWS_CONTAINER_CREDENTIALS_FULL_URI:+AWS_CONTAINER_CREDENTIALS_FULL_URI="$AWS_CONTAINER_CREDENTIALS_FULL_URI"} \
  ${AWS_CONTAINER_CREDENTIALS_RELATIVE_URI:+AWS_CONTAINER_CREDENTIALS_RELATIVE_URI="$AWS_CONTAINER_CREDENTIALS_RELATIVE_URI"} \
  ${AWS_CONTAINER_AUTHORIZATION_TOKEN:+AWS_CONTAINER_AUTHORIZATION_TOKEN="$AWS_CONTAINER_AUTHORIZATION_TOKEN"} \
  ${AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE:+AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE="$AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE"} \
  /usr/bin/python3 -I -W ignore - <<'PY'
import ctypes, fcntl, getpass, json, logging, os, re, secrets, shutil, stat, subprocess, sys, tempfile, uuid, warnings
from urllib.parse import urlsplit

warnings.simplefilter("ignore")
logging.disable(logging.CRITICAL)
LIBC = ctypes.CDLL(None, use_errno=True)
try:
    LIBC.prctl(4, 0, 0, 0, 0)  # PR_SET_DUMPABLE 0
except Exception:
    pass

MODE = os.environ.get("MODE", "")
KEY_ARG = os.environ.get("KEY_ARG", "")
ACCOUNT = "229251310592"
REGION = "eu-central-1"
PREFIX = "munaxa-nonprod"
KMS_KEY = "arn:aws:kms:eu-central-1:229251310592:key/45eda044-092a-4f31-9243-3f9548636e37"
DB_INSTANCE = "munaxa-nonprod-pg"
# infra/aws/CONTRACT.md section 6: Control's database and roles, as Control's migrations grant them.
DATABASE, OWNER_ROLE, APP_ROLE = "control", "control_owner", "control_app"
API, MIGRATE = f"{PREFIX}/control-api", f"{PREFIX}/control-migrate"
API_KEYS = ["DATABASE_URL"]  # data.tf secret_keys["control-api"]
MIGRATE_KEYS = ["DATABASE_MIGRATION_URL"]  # data.tf secret_keys["control-migrate"]
AWS_CANDIDATES = ["/usr/local/bin/aws", "/usr/bin/aws"]
AWS_REAL_PREFIX = "/usr/local/aws-cli/v2/"
ENDPOINTS = {"sts": f"https://sts.{REGION}.amazonaws.com",
             "secretsmanager": f"https://secretsmanager.{REGION}.amazonaws.com",
             "rds": f"https://rds.{REGION}.amazonaws.com"}
PHASE = "preflight"
CLI_HOME = None
WRITTEN = []  # secrets this run has written (named in an ABORT after a successful earlier write)


def say(line):
    print(line, flush=True)


def cleanup():
    if CLI_HOME:
        shutil.rmtree(CLI_HOME, ignore_errors=True)


def stop(reason):
    say(f"ABORT {reason}")
    if WRITTEN:
        say("ABORT WRITTEN_EARLIER_IN_THIS_RUN " + " ".join(n.split("/")[-1] for n in WRITTEN))
    if PHASE == "write-sent" or WRITTEN:
        say("ABORT AFTER_WRITE_ATTEMPT: send these ABORT lines to Claude before doing anything else")
    else:
        say("NOTHING WRITTEN BY THIS STEP")
    cleanup()
    sys.exit(1)


def _quiet(kind, _error, _tb):
    try:
        stop(f"EXCEPTION {kind.__name__}")
    except SystemExit:
        pass


sys.excepthook = _quiet


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
    for name in ("AWS_CONTAINER_CREDENTIALS_FULL_URI", "AWS_CONTAINER_CREDENTIALS_RELATIVE_URI",
                 "AWS_CONTAINER_AUTHORIZATION_TOKEN", "AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE"):
        if os.environ.get(name):
            env[name] = os.environ[name]
    return env


def memfd():
    if hasattr(os, "memfd_create"):
        return os.memfd_create("control-secrets-request", os.MFD_CLOEXEC)
    fd = LIBC.memfd_create(b"control-secrets-request", 1)
    if fd < 0:
        stop("NO_MEMFD")
    return fd


def aws(service, operation, params, allow=()):
    """One AWS call. Returns (response, None), or (None, code) for an error code listed in allow."""
    cmd = [AWS, service, operation, "--cli-input-json", "file:///dev/stdin", "--output", "json",
           "--region", REGION, "--endpoint-url", ENDPOINTS[service], "--no-cli-pager", "--no-cli-auto-prompt",
           "--cli-connect-timeout", "10", "--cli-read-timeout", "30"]
    request = memfd()
    try:
        os.write(request, json.dumps(params).encode("utf-8"))
        os.lseek(request, 0, os.SEEK_SET)
        proc = subprocess.run(cmd, stdin=request, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                              env=ENV, cwd=CLI_HOME, timeout=300, close_fds=True)
    finally:
        os.close(request)
    if proc.returncode != 0:
        m = re.search(rb"An error occurred \(([A-Za-z0-9.]{1,64})\)", proc.stderr)
        code = m.group(1).decode("ascii") if m else f"cli_exit={proc.returncode}"
        del proc
        if code in allow:
            return None, code
        stop(f"AWS_ERROR {operation} {code}")
    try:
        out = json.loads(proc.stdout.decode("utf-8"))
    except ValueError:
        out = None
    del proc
    if not isinstance(out, dict):
        stop(f"AWS_OUTPUT_UNEXPECTED {operation}")
    return out, None


def call(service, operation, params):
    return aws(service, operation, params)[0]


# ---- value rules (db-bootstrap.sh and CONTRACT.md section 6) --------------------------------------
HEX64 = re.compile(r"[0-9a-f]{64}")


def pg_url(role, password, host):
    return f"postgresql://{role}:{password}@{host}:5432/{DATABASE}?sslmode=require"


def pg_url_ok(url, role, host):
    """One host (the instance endpoint), Control's database, hex password, no override."""
    try:
        u = urlsplit(url)
        return (u.scheme == "postgresql" and u.username == role and u.password is not None
                and HEX64.fullmatch(u.password) is not None and u.hostname == host and u.port == 5432
                and u.path == f"/{DATABASE}" and u.query == "sslmode=require" and u.fragment == ""
                and url.count("@") == 1)
    except ValueError:
        return False


# ---- Secrets Manager helpers --------------------------------------------------------------------
def describe(name, must_exist=True):
    meta, code = aws("secretsmanager", "describe-secret", {"SecretId": name}, allow=("ResourceNotFoundException",))
    if meta is None:
        if must_exist:
            stop(f"SECRET_MISSING {name}")
        return None
    if meta.get("Name") != name or not meta.get("ARN", "").startswith(f"arn:aws:secretsmanager:{REGION}:{ACCOUNT}:secret:{name}-"):
        stop(f"SECRET_ARN_OR_NAME_MISMATCH {name}")
    if meta.get("KmsKeyId") != KMS_KEY:
        stop(f"SECRET_KMS_KEY_MISMATCH {name}")
    if meta.get("DeletedDate") is not None:
        stop(f"SECRET_SCHEDULED_FOR_DELETION {name}")
    if meta.get("RotationEnabled"):
        stop(f"SECRET_HAS_ROTATION {name}")
    if meta.get("ReplicationStatus") or meta.get("PrimaryRegion") not in (None, REGION):
        stop(f"SECRET_IS_REPLICATED {name}")
    return meta


def versions(name):
    listed = call("secretsmanager", "list-secret-version-ids", {"SecretId": name, "IncludeDeprecated": True}).get("Versions", [])
    return {v.get("VersionId"): sorted(v.get("VersionStages", [])) for v in listed}


def state_of(name):
    """'empty' (no version), 'one' (exactly one version, AWSCURRENT), or 'many' (AWSCURRENT + others)."""
    vs = versions(name)
    if not vs:
        return "empty", None
    current = [v for v, s in vs.items() if "AWSCURRENT" in s]
    if len(current) != 1 or any("AWSPENDING" in s for s in vs.values()):
        stop(f"UNEXPECTED_LABELS {name}")
    return ("one" if len(vs) == 1 else "many"), current[0]


def read(name, version_id, keys):
    got = call("secretsmanager", "get-secret-value", {"SecretId": name, "VersionId": version_id})
    if got.get("Name") != name or got.get("VersionId") != version_id or "AWSCURRENT" not in got.get("VersionStages", []):
        stop(f"READ_RESPONSE_MISMATCH {name}")
    if not isinstance(got.get("SecretString"), str) or "SecretBinary" in got:
        stop(f"NOT_A_STRING {name}")
    text = got["SecretString"]
    del got
    try:
        value = json.loads(text, object_pairs_hook=no_duplicates)
    except ValueError:
        stop(f"NOT_VALID_JSON_OR_DUPLICATE_KEY {name}")
    if not isinstance(value, dict) or sorted(value) != sorted(keys) or not all(isinstance(v, str) and v for v in value.values()):
        stop(f"KEYS_UNEXPECTED {name}")
    return text, value


def write(name, value, expected_previous):
    """One new version; afterwards AWSCURRENT is exactly this value, the old current is AWSPREVIOUS."""
    global PHASE
    text = json.dumps(value, separators=(",", ":"), ensure_ascii=True)
    labels = state_of(name)
    if labels[1] != expected_previous:
        stop(f"LABELS_CHANGED_SINCE_PREFLIGHT {name}")
    token = str(uuid.uuid4())
    PHASE = "write-sent"
    say(f"writing         {name} new version {token}")
    out = call("secretsmanager", "put-secret-value", {"SecretId": name, "SecretString": text, "ClientRequestToken": token})
    if out.get("Name") != name or out.get("VersionId") != token or out.get("VersionStages") != ["AWSCURRENT"]:
        stop(f"WRITE_RESPONSE_UNEXPECTED {name}")
    back, _ = read(name, token, list(value))
    same = back == text
    del back, _, text
    if not same:
        stop(f"WRITTEN_VALUE_DIFFERS {name}")
    vs = versions(name)
    want = {token: ["AWSCURRENT"]}
    if expected_previous:
        want[expected_previous] = ["AWSPREVIOUS"]
    if {v: s for v, s in vs.items() if s} != want:
        stop(f"LABELS_UNEXPECTED_AFTER_WRITE {name}")
    WRITTEN.append(name)
    PHASE = "verified"
    return token


def ask(prompt, secret=False):
    """One line from the operator's terminal; hidden input for a secret. (Offline tests replace this.)"""
    try:
        if secret:
            with open("/dev/tty", "w") as out:
                return getpass.getpass(prompt, stream=out)
        with open("/dev/tty", "r") as tty:
            sys.stdout.write(prompt)
            sys.stdout.flush()
            return tty.readline().rstrip("\n")
    except (OSError, EOFError):
        stop("NO_TERMINAL")


def confirm(word, what):
    if ask(f"Type {word} and press Enter to {what} (anything else stops): ").strip() != word:
        stop("NOT_CONFIRMED")


def hidden(prompt):
    return ask(prompt, secret=True)


def visible(prompt):
    return ask(prompt).strip()


def db_host():
    db = call("rds", "describe-db-instances", {"DBInstanceIdentifier": DB_INSTANCE}).get("DBInstances", [])
    if len(db) != 1:
        stop("DB_INSTANCE_NOT_FOUND")
    host = (db[0].get("Endpoint") or {}).get("Address", "")
    if not re.fullmatch(rf"{DB_INSTANCE}\.[a-z0-9]+\.{REGION}\.rds\.amazonaws\.com", host) or (db[0].get("Endpoint") or {}).get("Port") != 5432:
        stop("DB_ENDPOINT_UNEXPECTED")
    return host


# ---- tooling: no AWS call yet -------------------------------------------------------------------
LOCK_PATH = "/tmp/control-testing-secrets.lock"
try:
    _lock = os.open(LOCK_PATH, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW | os.O_CLOEXEC, 0o600)
    fcntl.flock(_lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
except BlockingIOError:
    stop("ANOTHER_RUN_IN_PROGRESS (one run at a time; wait for the other tab to finish)")
except OSError:
    stop("LOCK_UNAVAILABLE")
os.close(memfd())
AWS = find_cli()
if not (os.environ.get("AWS_CONTAINER_CREDENTIALS_FULL_URI") or os.environ.get("AWS_CONTAINER_CREDENTIALS_RELATIVE_URI")):
    stop("CLOUDSHELL_CREDENTIALS_MISSING")
CLI_HOME = tempfile.mkdtemp(prefix="control-secrets-cli-")
ENV = cli_env(CLI_HOME)
ver = subprocess.run([AWS, "--version"], stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                     env=ENV, cwd=CLI_HOME, timeout=60, close_fds=True)
version = ver.stdout.decode("ascii", "replace").split(" ")[0].strip()
if ver.returncode != 0 or not re.fullmatch(r"aws-cli/2\.[0-9]+\.[0-9]+", version):
    stop("AWS_CLI_NOT_VERSION_2")
say(f"mode            {MODE}{(' ' + KEY_ARG) if KEY_ARG else ''}")
say(f"aws_cli         {AWS} {version}")
who = call("sts", "get-caller-identity", {})
if who.get("Account") != ACCOUNT:
    stop("WRONG_ACCOUNT")
# Expected identity (report 2026-11-21-testing-readiness, file 03): root (the approved interim method
# until IAM Identity Center exists) or an IAM Identity Center session of the MunaxaEngineering
# permission set. Anything else (MunaxaReadOnly, MunaxaAdministrator, an IAM user, a GitHub OIDC
# role, another account's role) stops here, before any secret call. The session name (the Identity
# Center user name, possibly an e-mail address) is never printed.
CALLER = who.get("Arn", "")
if CALLER == f"arn:aws:iam::{ACCOUNT}:root":
    caller_shown = CALLER
else:
    m_sso = re.fullmatch(rf"arn:aws:sts::{ACCOUNT}:assumed-role/(AWSReservedSSO_MunaxaEngineering_[0-9a-f]{{16}})/[A-Za-z0-9+=,.@_-]{{1,64}}", CALLER)
    if not m_sso:
        stop("CALLER_NOT_ALLOWED (run as MunaxaEngineering through IAM Identity Center, or root)")
    caller_shown = f"arn:aws:sts::{ACCOUNT}:assumed-role/{m_sso.group(1)}/<session name not shown>"
say(f"caller          {caller_shown}")
say(f"account         {ACCOUNT}   region {REGION}")

for name in (API, MIGRATE):
    describe(name)
states = {name: state_of(name) for name in (API, MIGRATE)}
for name in (MIGRATE, API):
    say(f"bundle          {name}: {states[name][0]}{(' current ' + states[name][1]) if states[name][1] else ''}")

# ---- status ------------------------------------------------------------------------------------
if MODE == "status":
    say("STATUS OK       nothing read or written")
    cleanup()
    sys.exit(0)

# ---- bundles: first fill, resumable -------------------------------------------------------------
if MODE == "bundles":
    if any(s == "many" for s, _ in states.values()):
        stop("A_BUNDLE_ALREADY_HAS_SEVERAL_VERSIONS (use status; this mode only fills empty bundles)")
    order = [states[MIGRATE][0], states[API][0]]
    if order not in (["empty", "empty"], ["one", "empty"], ["one", "one"]):
        stop("UNEXPECTED_FILL_ORDER (the script writes migrate, then api)")
    host = db_host()
    say(f"db_host         {host}")
    if order == ["one", "one"]:
        say("already_done    both bundles have one version: checking them, read only")
    else:
        say("PREFLIGHT OK    nothing read or written yet")
        confirm("FILL", "generate and write the Control Testing bundles")
    PHASE = "read"
    vids = {}
    if states[MIGRATE][0] == "one":
        _t, mig = read(MIGRATE, states[MIGRATE][1], MIGRATE_KEYS)
        del _t
        vids[MIGRATE] = states[MIGRATE][1]
    else:
        mig = {"DATABASE_MIGRATION_URL": pg_url(OWNER_ROLE, secrets.token_hex(32), host)}
    if not pg_url_ok(mig["DATABASE_MIGRATION_URL"], OWNER_ROLE, host):
        stop("MIGRATION_URL_UNEXPECTED")
    if states[API][0] == "one":
        _t, api = read(API, states[API][1], API_KEYS)
        del _t
        vids[API] = states[API][1]
    else:
        api = {"DATABASE_URL": pg_url(APP_ROLE, secrets.token_hex(32), host)}
    if not pg_url_ok(api["DATABASE_URL"], APP_ROLE, host):
        stop("DATABASE_URL_UNEXPECTED")
    if urlsplit(api["DATABASE_URL"]).password == urlsplit(mig["DATABASE_MIGRATION_URL"]).password:
        stop("PASSWORD_REUSED")
    for name, value in ((MIGRATE, mig), (API, api)):
        if name not in vids:
            vids[name] = write(name, value, None)
    del mig, api
    cleanup()
    say("BUNDLES VERIFIED")
    for name in (MIGRATE, API):
        say(f"version_id      {name.split('/')[-1]} {vids[name]}")
    say("SEND CLAUDE     the two version_id lines above, nothing else")
    sys.exit(0)

stop("MODE")
PY
