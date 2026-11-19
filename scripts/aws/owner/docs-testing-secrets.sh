#!/usr/bin/env bash
# Munaxa Docs in Testing (nonprod): fill and maintain the Docs secret bundles INSIDE AWS, so no
# Docs credential ever passes through Claude, a chat, a repository, a CI runner or a laptop.
# Report: docs/aws-migration/agent-reports/2026-11-19-docs-first-testing-deployment-program/
# (file 04 section 6 and file 10). Infrastructure: infra/aws/stack/docs.tf and data.tf.
#
# Run it ONLY as the owner, in AWS CloudShell, eu-central-1, account 229251310592:
#     /bin/bash -p ./docs-testing-secrets.sh <mode>
# Never `source` it, never paste its body, never run it in a Claude session or a CI runner.
#
# Modes (each one needs the operator to type the confirmation word it names):
#   bundles             First fill of munaxa-nonprod/docs-operator, docs-migrate and docs-api.
#                       Generates every credential here (Python `secrets`, the OS CSPRNG), derives the
#                       URLs and the tenant catalogue from them, and writes ONE version per bundle.
#                       Asks for the Resend API key (hidden input); an empty answer stores a marked
#                       placeholder, so Docs starts but cannot send mail until replace-key.
#                       CONTROL_PLANE_TOKEN is always a marked placeholder here: Control issues the
#                       real credential later (replace-key). Resumable: bundles already written are
#                       read back and reused, so a run that stopped half way never splits a password.
#   replace-key KEY     One new docs-api version where only KEY changes; KEY is CONTROL_PLANE_TOKEN
#                       (the mxc_ credential Control issued for the Docs deployment) or
#                       MAIL_RESEND_API_KEY (a Resend key with sending access only). Hidden input.
#   provision-create    Creates the one-run secret munaxa-nonprod/docs-provision/munaxa-internal for
#                       the docs-provision task: TENANT_ID (from the catalogue), ADMIN_EMAIL, ADMIN_NAME
#                       (typed), ADMIN_PASSWORD (hidden, typed twice, 16 to 256 characters).
#   provision-delete    Deletes that one-run secret immediately (no recovery window), after the run.
#   status              Metadata only: versions, labels, tenant id. Reads no value except the catalogue's
#                       tenant id, inside this process.
#
# Guarantees (the same custody rules as the Identity stage C script, report 2026-11-13-identity-stage-c-cli):
#   - Tooling first, before any AWS call: the AWS CLI v2 is the root-owned install outside any home
#     directory, and CloudShell's container credentials are present.
#   - Values never leave this Python process except to the AWS CLI: each request is the CLI's
#     standard input (an anonymous in-memory file), each response comes back on a pipe. No value is
#     ever a command-line argument, an environment variable, a file, a history entry or terminal
#     output. The CLI runs with a fresh empty home, no config or credentials file, no pager.
#   - Prints only non-secret lines: names, ARNs, version ids, key NAMES, the tenant id, check results.
#     An error prints `ABORT <reason>` with at most an AWS error code, never a message or traceback.
#   - Every write is one PutSecretValue (or CreateSecret) with a ClientRequestToken made once per run,
#     followed by a read-back check of the exact value and the labels.
#   - Nothing is ever deleted except the one-run provision secret, and only in provision-delete.
if [[ "${BASH_SOURCE[0]}" != "$0" ]]; then
  echo "ABORT SOURCED (run it as: /bin/bash -p ./docs-testing-secrets.sh <mode>)"
  return 1
fi
set -euo pipefail
set +x
umask 077
ulimit -c 0 # no core file can ever hold a value
MODE=${1:-}
KEY_ARG=${2:-}
case "$MODE" in
  bundles | provision-create | provision-delete | status) [[ $# -eq 1 ]] || { echo "ABORT USAGE"; exit 2; } ;;
  replace-key) [[ $# -eq 2 && ($KEY_ARG == CONTROL_PLANE_TOKEN || $KEY_ARG == MAIL_RESEND_API_KEY) ]] || { echo "ABORT USAGE replace-key CONTROL_PLANE_TOKEN|MAIL_RESEND_API_KEY"; exit 2; } ;;
  *) echo "ABORT USAGE bundles|replace-key KEY|provision-create|provision-delete|status"; exit 2 ;;
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
import ctypes, getpass, json, logging, os, re, secrets, shutil, stat, subprocess, sys, tempfile, uuid, warnings
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
BUCKET = "munaxa-nonprod-docs-files-229251310592"
# var.docs_tenant (infra/aws/stack/variables.tf): the one Docs tenant of Testing.
SLUG, TENANT_NAME, TENANT_DB = "munaxa-internal", "Munaxa Internal", "edms_munaxa_internal"
API, OPERATOR, MIGRATE = f"{PREFIX}/docs-api", f"{PREFIX}/docs-operator", f"{PREFIX}/docs-migrate"
PROVISION = f"{PREFIX}/docs-provision/{SLUG}"
# The exact keys infra/aws/stack/docs.tf injects (docs_app_keys, docs_operator_keys, docs_migrate_keys,
# docs_provision_keys). ECS refuses to start a task whose bundle lacks one.
API_KEYS = ["DATABASE_URL", "TENANT_CATALOGUE", "REDIS_URL", "REDIS_PASSWORD", "JWT_ACCESS_SECRET",
            "SIGNATURE_WITNESS_SECRET", "AUDIT_CHECKPOINT_SECRET", "MFA_TOTP_SEALING_KEY",
            "METRICS_SCRAPE_TOKEN", "MAIL_RESEND_API_KEY", "CONTROL_PLANE_TOKEN"]
OPERATOR_KEYS = ["EDMS_APP_PASSWORD", "EDMS_BACKUP_PASSWORD"]
MIGRATE_KEYS = ["DATABASE_MIGRATION_URL"]
PROVISION_KEYS = ["TENANT_ID", "ADMIN_EMAIL", "ADMIN_NAME", "ADMIN_PASSWORD"]
# Marked placeholders: long enough for Docs' >= 32 rule, never accepted by Resend or Control, and
# recognisable by `status` and by the acceptance checklist (file 04 section 9).
CONTROL_PLACEHOLDER = "pending-control-credential-"
RESEND_PLACEHOLDER = "pending-resend-key-"
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
        return os.memfd_create("docs-secrets-request", os.MFD_CLOEXEC)
    fd = LIBC.memfd_create(b"docs-secrets-request", 1)
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


# ---- value rules (the Docs configuration schema and docs-owner-password.sql) ---------------------
HEX64 = re.compile(r"[0-9a-f]{64}")
URLSAFE = re.compile(r"[A-Za-z0-9_-]{64}")


def pg_url(role, password, host):
    return f"postgresql://{role}:{password}@{host}:5432/{TENANT_DB}?sslmode=require"


def pg_url_ok(url, role, host):
    """The shape docs-owner-password.sql and Prisma accept: one host, the tenant database, no override."""
    try:
        u = urlsplit(url)
        return (u.scheme == "postgresql" and u.username == role and u.password is not None
                and HEX64.fullmatch(u.password) is not None and u.hostname == host and u.port == 5432
                and u.path == f"/{TENANT_DB}" and u.query == "sslmode=require" and u.fragment == ""
                and url.count("@") == 1)
    except ValueError:
        return False


def catalogue(tenant_id, database_url):
    return json.dumps({
        "defaults": {"storage": {"driver": "S3", "container": BUCKET, "region": REGION, "prefixTemplate": "{slug}"},
                     "search": {"indexTemplate": "{slug}"}},
        "tenants": [{"id": tenant_id, "slug": SLUG, "name": TENANT_NAME, "database": {"url": database_url}}],
    }, separators=(",", ":"))


def tenant_of(cat_text):
    try:
        cat = json.loads(cat_text, object_pairs_hook=no_duplicates)
        tenants = cat["tenants"]
        if len(tenants) != 1 or tenants[0].get("slug") != SLUG:
            return None
        tid = tenants[0]["id"]
        return tid if re.fullmatch(r"[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}", tid) else None
    except (ValueError, KeyError, TypeError, AttributeError):
        return None


def resend_ok(v):
    return re.fullmatch(r"re_[A-Za-z0-9_]{16,128}", v) is not None


def control_ok(v):
    # Control's service credential (munaxa-control apps/api/src/auth/service-credentials.ts):
    # mxc_<credential uuid>_<secret, base64url, at least 32>.
    return re.fullmatch(r"mxc_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_[A-Za-z0-9_-]{32,128}", v) is not None


def placeholder_ok(v, prefix):
    return v.startswith(prefix) and HEX64.fullmatch(v[len(prefix):]) is not None


def api_ok(b, host, app_pw):
    """Every docs-api value is well formed and consistent with the operator and the tenant database."""
    if sorted(b) != sorted(API_KEYS) or not all(isinstance(v, str) and v for v in b.values()):
        return "KEYS"
    if not pg_url_ok(b["DATABASE_URL"], "edms_app", host) or urlsplit(b["DATABASE_URL"]).password != app_pw:
        return "DATABASE_URL"
    tid = tenant_of(b["TENANT_CATALOGUE"])
    if tid is None or b["TENANT_CATALOGUE"] != catalogue(tid, b["DATABASE_URL"]):
        return "TENANT_CATALOGUE"
    if not HEX64.fullmatch(b["REDIS_PASSWORD"]) or b["REDIS_URL"] != f"redis://:{b['REDIS_PASSWORD']}@127.0.0.1:6379":
        return "REDIS"
    for k in ("JWT_ACCESS_SECRET", "SIGNATURE_WITNESS_SECRET", "AUDIT_CHECKPOINT_SECRET", "MFA_TOTP_SEALING_KEY"):
        if not URLSAFE.fullmatch(b[k]):
            return k
    if len({b[k] for k in ("JWT_ACCESS_SECRET", "SIGNATURE_WITNESS_SECRET", "AUDIT_CHECKPOINT_SECRET", "MFA_TOTP_SEALING_KEY")}) != 4:
        return "SECRETS_NOT_DISTINCT"
    if not HEX64.fullmatch(b["METRICS_SCRAPE_TOKEN"]):
        return "METRICS_SCRAPE_TOKEN"
    if not (resend_ok(b["MAIL_RESEND_API_KEY"]) or placeholder_ok(b["MAIL_RESEND_API_KEY"], RESEND_PLACEHOLDER)):
        return "MAIL_RESEND_API_KEY"
    if not (control_ok(b["CONTROL_PLANE_TOKEN"]) or placeholder_ok(b["CONTROL_PLANE_TOKEN"], CONTROL_PLACEHOLDER)):
        return "CONTROL_PLANE_TOKEN"
    return None


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
os.close(memfd())
AWS = find_cli()
if not (os.environ.get("AWS_CONTAINER_CREDENTIALS_FULL_URI") or os.environ.get("AWS_CONTAINER_CREDENTIALS_RELATIVE_URI")):
    stop("CLOUDSHELL_CREDENTIALS_MISSING")
CLI_HOME = tempfile.mkdtemp(prefix="docs-secrets-cli-")
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
say(f"caller          {who.get('Arn')}")
say(f"account         {ACCOUNT}   region {REGION}")

for name in (API, OPERATOR, MIGRATE):
    describe(name)
states = {name: state_of(name) for name in (API, OPERATOR, MIGRATE)}
for name in (OPERATOR, MIGRATE, API):
    say(f"bundle          {name}: {states[name][0]}{(' current ' + states[name][1]) if states[name][1] else ''}")

# ---- status ------------------------------------------------------------------------------------
if MODE == "status":
    if states[API][1]:
        _t, b = read(API, states[API][1], API_KEYS)
        tid = tenant_of(b["TENANT_CATALOGUE"])
        mail = "resend" if resend_ok(b["MAIL_RESEND_API_KEY"]) else ("placeholder" if placeholder_ok(b["MAIL_RESEND_API_KEY"], RESEND_PLACEHOLDER) else "INVALID")
        ctl = "mxc" if control_ok(b["CONTROL_PLANE_TOKEN"]) else ("placeholder" if placeholder_ok(b["CONTROL_PLANE_TOKEN"], CONTROL_PLACEHOLDER) else "INVALID")
        del _t, b
        say(f"tenant_id       {tid}")
        say(f"mail_key        {mail}")
        say(f"control_token   {ctl}")
    prov = describe(PROVISION, must_exist=False)
    say(f"provision       {PROVISION}: {'exists ' + prov['ARN'] if prov else 'absent'}")
    say("STATUS OK       nothing written")
    cleanup()
    sys.exit(0)

# ---- bundles: first fill, resumable -------------------------------------------------------------
if MODE == "bundles":
    if any(s == "many" for s, _ in states.values()):
        stop("A_BUNDLE_ALREADY_HAS_SEVERAL_VERSIONS (use status; this mode only fills empty bundles)")
    order = [states[OPERATOR][0], states[MIGRATE][0], states[API][0]]
    if order not in (["empty"] * 3, ["one", "empty", "empty"], ["one", "one", "empty"], ["one"] * 3):
        stop("UNEXPECTED_FILL_ORDER (the script writes operator, then migrate, then api)")
    host = db_host()
    say(f"db_host         {host}")
    if order == ["one"] * 3:
        say("already_done    all three bundles have one version: checking them, read only")
    else:
        say("PREFLIGHT OK    nothing read or written yet")
        confirm("FILL", "generate and write the Docs Testing bundles")
    PHASE = "read"
    vids = {}
    if states[OPERATOR][0] == "one":
        _t, op = read(OPERATOR, states[OPERATOR][1], OPERATOR_KEYS)
        del _t
        vids[OPERATOR] = states[OPERATOR][1]
    else:
        op = {"EDMS_APP_PASSWORD": secrets.token_hex(32), "EDMS_BACKUP_PASSWORD": secrets.token_hex(32)}
    if not all(HEX64.fullmatch(v) for v in op.values()) or op["EDMS_APP_PASSWORD"] == op["EDMS_BACKUP_PASSWORD"]:
        stop("OPERATOR_VALUES_UNEXPECTED")
    if states[MIGRATE][0] == "one":
        _t, mig = read(MIGRATE, states[MIGRATE][1], MIGRATE_KEYS)
        del _t
        vids[MIGRATE] = states[MIGRATE][1]
    else:
        mig = {"DATABASE_MIGRATION_URL": pg_url("edms_owner", secrets.token_hex(32), host)}
    if not pg_url_ok(mig["DATABASE_MIGRATION_URL"], "edms_owner", host):
        stop("MIGRATION_URL_UNEXPECTED")
    owner_pw = urlsplit(mig["DATABASE_MIGRATION_URL"]).password
    if owner_pw in op.values():
        stop("OWNER_PASSWORD_REUSED")
    del owner_pw
    if states[API][0] == "one":
        _t, api = read(API, states[API][1], API_KEYS)
        del _t
        vids[API] = states[API][1]
    else:
        key = hidden("Resend API key with sending access only (hidden; press Enter for a placeholder): ").strip()
        if key == "":
            key = RESEND_PLACEHOLDER + secrets.token_hex(32)
        elif not resend_ok(key):
            stop("RESEND_KEY_FORMAT (expected re_...)")
        redis_pw = secrets.token_hex(32)
        database_url = pg_url("edms_app", op["EDMS_APP_PASSWORD"], host)
        api = {
            "DATABASE_URL": database_url,
            "TENANT_CATALOGUE": catalogue(str(uuid.uuid4()), database_url),
            "REDIS_URL": f"redis://:{redis_pw}@127.0.0.1:6379",
            "REDIS_PASSWORD": redis_pw,
            "JWT_ACCESS_SECRET": secrets.token_urlsafe(48),
            "SIGNATURE_WITNESS_SECRET": secrets.token_urlsafe(48),
            "AUDIT_CHECKPOINT_SECRET": secrets.token_urlsafe(48),
            "MFA_TOTP_SEALING_KEY": secrets.token_urlsafe(48),
            "METRICS_SCRAPE_TOKEN": secrets.token_hex(32),
            "MAIL_RESEND_API_KEY": key,
            "CONTROL_PLANE_TOKEN": CONTROL_PLACEHOLDER + secrets.token_hex(32),
        }
        del key, redis_pw, database_url
    problem = api_ok(api, host, op["EDMS_APP_PASSWORD"])
    if problem:
        stop(f"API_BUNDLE_CHECK_FAILED {problem}")
    # Nothing in one bundle may repeat a credential of another (beyond the app password the URLs carry).
    if urlsplit(mig["DATABASE_MIGRATION_URL"]).password in json.dumps(api):
        stop("OWNER_PASSWORD_IN_API_BUNDLE")
    if op["EDMS_BACKUP_PASSWORD"] in json.dumps(api):
        stop("BACKUP_PASSWORD_IN_API_BUNDLE")
    for name, value in ((OPERATOR, op), (MIGRATE, mig), (API, api)):
        if name not in vids:
            vids[name] = write(name, value, None)
    tid = tenant_of(api["TENANT_CATALOGUE"])
    mail = "resend" if resend_ok(api["MAIL_RESEND_API_KEY"]) else "placeholder"
    ctl = "mxc" if control_ok(api["CONTROL_PLANE_TOKEN"]) else "placeholder"
    del op, mig, api
    cleanup()
    say("BUNDLES VERIFIED")
    for name in (OPERATOR, MIGRATE, API):
        say(f"version_id      {name.split('/')[-1]} {vids[name]}")
    say(f"tenant_id       {tid}   (not a secret: Control needs it for the Docs subscription)")
    say(f"mail_key        {mail}")
    say(f"control_token   {ctl}" + ("   (replace-key CONTROL_PLANE_TOKEN after Control issues the credential)" if ctl == "placeholder" else ""))
    say("SEND CLAUDE     the version_id, tenant_id and mail_key lines above, nothing else")
    sys.exit(0)

# ---- replace-key: one docs-api version, one key changes ------------------------------------------
if MODE == "replace-key":
    if states[API][0] == "empty" or states[OPERATOR][0] == "empty":
        stop("BUNDLES_NOT_FILLED (run bundles first)")
    host = db_host()
    _t, op = read(OPERATOR, states[OPERATOR][1], OPERATOR_KEYS)
    del _t
    say("PREFLIGHT OK    nothing written yet")
    confirm("REPLACE", f"replace {KEY_ARG} in {API}")
    PHASE = "read"
    _t, api = read(API, states[API][1], API_KEYS)
    del _t
    if api_ok(api, host, op["EDMS_APP_PASSWORD"]):
        stop("CURRENT_API_BUNDLE_NOT_AS_EXPECTED")
    new = hidden(f"New {KEY_ARG} (hidden): ").strip()
    if KEY_ARG == "CONTROL_PLANE_TOKEN" and not control_ok(new):
        stop("CONTROL_TOKEN_FORMAT (expected mxc_<uuid>_<secret>)")
    if KEY_ARG == "MAIL_RESEND_API_KEY" and not resend_ok(new):
        stop("RESEND_KEY_FORMAT (expected re_...)")
    if new == api[KEY_ARG]:
        stop("SAME_VALUE")
    before = {k: v for k, v in api.items() if k != KEY_ARG}
    api[KEY_ARG] = new
    del new
    if api_ok(api, host, op["EDMS_APP_PASSWORD"]) or {k: v for k, v in api.items() if k != KEY_ARG} != before:
        stop("MERGE_SELF_CHECK_FAILED")
    previous = states[API][1]
    vid = write(API, api, previous)
    del api, before, op
    cleanup()
    say("REPLACED VERIFIED")
    say(f"version_id      docs-api {vid}   (AWSCURRENT; {previous} is AWSPREVIOUS)")
    say(f"changed_key     {KEY_ARG}")
    say("SEND CLAUDE     the version_id and changed_key lines above, nothing else")
    sys.exit(0)

# ---- provision-create / provision-delete -----------------------------------------------------------
if MODE == "provision-create":
    if states[API][0] == "empty":
        stop("BUNDLES_NOT_FILLED (run bundles first)")
    if describe(PROVISION, must_exist=False) is not None:
        stop("PROVISION_SECRET_EXISTS (run provision-delete first)")
    _t, api = read(API, states[API][1], API_KEYS)
    tid = tenant_of(api["TENANT_CATALOGUE"])
    del _t, api
    if tid is None:
        stop("TENANT_ID_UNREADABLE")
    say(f"tenant_id       {tid}")
    email = visible("First Docs administrator's email address: ")
    if not re.fullmatch(r"[^@\s]{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,24}", email):
        stop("EMAIL_FORMAT")
    name = visible("First Docs administrator's display name: ")
    if not (1 <= len(name) <= 120) or any(ord(c) < 32 for c in name):
        stop("NAME_FORMAT")
    pw = hidden("Their password, 16 to 256 characters (hidden): ")
    if hidden("The same password again (hidden): ") != pw:
        stop("PASSWORDS_DIFFER")
    # Docs' password policy (password-policy.ts): length in UTF-16 units, and no identifier of 4 or
    # more characters (email, display name) inside the password, case-insensitive.
    if not (16 <= len(pw.encode("utf-16-le")) // 2 <= 256) or pw.strip() != pw:
        stop("PASSWORD_LENGTH_OR_SPACES")
    if any(len(i.strip()) >= 4 and i.strip().lower() in pw.lower() for i in (email, name)):
        stop("PASSWORD_CONTAINS_EMAIL_OR_NAME")
    confirm("CREATE", f"create {PROVISION}")
    value = json.dumps({"TENANT_ID": tid, "ADMIN_EMAIL": email, "ADMIN_NAME": name, "ADMIN_PASSWORD": pw},
                       separators=(",", ":"), ensure_ascii=True)
    del pw
    token = str(uuid.uuid4())
    PHASE = "write-sent"
    out = call("secretsmanager", "create-secret", {
        "Name": PROVISION, "KmsKeyId": KMS_KEY, "SecretString": value, "ClientRequestToken": token,
        "Description": "One-run docs-provision input (owner, docs-testing-secrets.sh); delete after the run",
        "Tags": [{"Key": "Project", "Value": "munaxa"}, {"Key": "Environment", "Value": "nonprod"},
                 {"Key": "Purpose", "Value": "docs-provision-one-run"}]})
    if out.get("Name") != PROVISION or out.get("VersionId") != token:
        stop("CREATE_RESPONSE_UNEXPECTED")
    meta = describe(PROVISION)
    back, _v = read(PROVISION, token, PROVISION_KEYS)
    same = back == value
    del back, _v, value, email, name
    if not same:
        stop("WRITTEN_VALUE_DIFFERS")
    cleanup()
    say("PROVISION SECRET CREATED VERIFIED")
    say(f"secret          {meta['ARN']}")
    say(f"tenant_id       {tid}")
    say("SEND CLAUDE     'provision secret created' and the tenant_id line, nothing else; delete it after the docs-provision run")
    sys.exit(0)

if MODE == "provision-delete":
    meta = describe(PROVISION, must_exist=False)
    if meta is None:
        say("PROVISION SECRET ABSENT   nothing to delete")
        cleanup()
        sys.exit(0)
    confirm("DELETE", f"delete {PROVISION} now, without a recovery window")
    PHASE = "write-sent"
    out = call("secretsmanager", "delete-secret", {"SecretId": meta["ARN"], "ForceDeleteWithoutRecovery": True})
    if out.get("Name") != PROVISION:
        stop("DELETE_RESPONSE_UNEXPECTED")
    cleanup()
    say("PROVISION SECRET DELETED")
    say(f"secret          {meta['ARN']}")
    sys.exit(0)

stop("MODE")
PY
