#!/usr/bin/env bash
# Offline test of stage-c-add-mfa-key-cli.sh (no AWS; fake values all contain FAKESECRET).
# Usage: run.sh <script>. Needs the REAL AWS CLI v2 at /usr/local/bin/aws (official installer layout,
# as in CloudShell), Node.js for case 1a, and root (case 22 creates a non-root-owned file).
#
# Every AWS call goes from the script, through the real AWS CLI v2, over HTTP to fake-aws-server.py,
# which emulates the container credential provider, STS and Secrets Manager with the revision 1
# scenarios (stub/boto3.py). Test-only substitutions, shown in the output:
#   - the two python launch lines: PYTHONPATH=stub and SCEN added to the allowlisted environment (a
#     fake `secrets`, used only by the forced collide/degenerate cases), and no -I (case 20 keeps -I);
#   - /dev/tty -> a file holding the typed answer (case 20 keeps the real terminal);
#   - the two regional HTTPS endpoints -> the local fake server.
# Checked after every case: the expected exit code and line; no fake marker or generated key in the
# output; no marker or key in any process's arguments or environment while a request is in flight;
# the CLI's temporary home removed; the persistent home unchanged; and, for runs that write, exactly
# one PutSecretValue with a fresh UUID v4 token and no VersionStages.
# Exit status: 0 only if every case passes.
set -u
D=$(cd "$(dirname "$0")" && pwd)
SRC=$1
PORT=18443
URL=http://127.0.0.1:$PORT
T=$D/stage-c-under-test.sh
sed -e "s#exec /usr/bin/env -i PATH=/usr/bin:/bin#exec /usr/bin/env -i PYTHONPATH=\"$D/stub\" SCEN=\"\${SCEN:-normal}\" PATH=/usr/bin:/bin#" \
    -e "s#/usr/bin/python3 -I -W ignore - <<'PY'#/usr/bin/python3 -W ignore - <<'PY'#" \
    -e "s#\"/dev/tty\"#\"$D/confirm.txt\"#" \
    -e "s#\"https://sts.{REGION}.amazonaws.com\"#\"$URL\"#" \
    -e "s#\"https://secretsmanager.{REGION}.amazonaws.com\"#\"$URL\"#" "$SRC" > "$T"
echo "== test-only substitutions"; diff "$SRC" "$T" | sed "s#$D#<test>#g"
[[ $(diff "$SRC" "$T" | grep -c '^<') == 5 ]] || { echo "FAIL: substitutions did not apply"; exit 1; }
/usr/local/bin/aws --version | sed 's/ .*//; s/^/aws cli under test: /'
FAILS=0; SCANS=0; rm -f "$D/envnames-all"
fail() { echo "CASE FAILED: $*"; FAILS=$((FAILS+1)); }
SERVER=
start_server() { # scenario
  stop_server
  SCEN=$1 STATE=$D/state.json python3 "$D/fake-aws-server.py" $PORT & SERVER=$!
  for _ in $(seq 50); do (exec 3<>/dev/tcp/127.0.0.1/$PORT) 2>/dev/null && return; sleep 0.1; done
  echo "server did not start"; exit 1
}
stop_server() { [[ -n $SERVER ]] && kill $SERVER 2>/dev/null && wait $SERVER 2>/dev/null; SERVER=; }
trap stop_server EXIT
reset() { rm -f "$D"/state.json "$D"/state.json.*; rm -rf "$D/home"; mkdir -p "$D/home"; echo "persistent home" > "$D/home/.bashrc"; }
snapshot() { (cd "$D/home" && find . -type f -exec sha256sum {} + | sort); }
checks() { # output [writes]
  if grep -q FAKESECRET <<<"$1"; then fail "fake secret marker in output"; fi
  if [[ -f $D/state.json.put ]]; then
    local k; k=$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["MFA_ENCRYPTION_KEYS"].split("=",1)[1])' "$D/state.json.put")
    if grep -qF -- "$k" <<<"$1"; then fail "key in output"; fi
  fi
  [[ -f $D/state.json.proc ]] && SCANS=$((SCANS + $(wc -l < "$D/state.json.proc")))
  [[ -f $D/state.json.envnames ]] && cat "$D/state.json.envnames" >> "$D/envnames-all"
  if [[ -f $D/state.json.proc ]] && grep -v '"hits": \[\]' "$D/state.json.proc" >/dev/null; then fail "marker or key in a process's arguments or environment"; fi
  if compgen -G "/tmp/stage-c-cli-*" >/dev/null; then fail "CLI temporary home left behind"; rm -rf /tmp/stage-c-cli-*; fi
  if [[ "$(snapshot)" != "$HOME_BEFORE" ]]; then fail "persistent home changed"; fi
  if [[ ${2:-} == writes ]]; then
    python3 - "$D/state.json.ops" <<'EOF' || FAILS=$((FAILS+1))
import json, re, sys
ops = [json.loads(l) for l in open(sys.argv[1])]
puts = [o for o in ops if o["op"] == "PutSecretValue"]
arn = "arn:aws:secretsmanager:eu-central-1:229251310592:secret:munaxa-nonprod/identity-sn5umm"
bad = [o for o in ops if o["op"] in ("UNEXPECTED", "PutSecretValue_WITH_VERSION_STAGES") or (o.get("secret_id") not in (None, arn))]
ok = (len(puts) == 1 and re.fullmatch(r"[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}", puts[0]["token"] or "")
      and puts[0]["params"] == ["ClientRequestToken", "SecretId", "SecretString"] and not bad)
print("request shape: " + ("one PutSecretValue, UUID v4 token, no VersionStages, only the expected secret" if ok else f"UNEXPECTED {len(puts)} puts, {bad}"))
sys.exit(0 if ok else 1)
EOF
  fi
}
expect() { # output code want-code want-text
  if [[ $2 != "$3" ]] || ! grep -qF -- "$4" <<<"$1"; then fail "wanted exit $3 and: $4"; else echo "case ok"; fi
}
CRED_ENV=(AWS_CONTAINER_CREDENTIALS_FULL_URI=$URL/creds AWS_CONTAINER_AUTHORIZATION_TOKEN=fake-container-authorization-token)
run() { # name scenario answer want-code want-text [keep-state|writes] [script]
  [[ ${6:-} == keep ]] || reset
  HOME_BEFORE=$(snapshot)
  start_server "$2"
  printf '%s\n' "$3" > "$D/confirm.txt"
  echo "== $1"
  local out code; out=$(cd /tmp && env -i PATH=/usr/bin:/bin HOME="$D/home" SCEN="$2" "${CRED_ENV[@]}" bash -p "${7:-$T}" 2>&1); code=$?
  echo "$out" | sed "s#$D#<test>#g"; echo "exit=$code"
  [[ -f $D/state.json.ops ]] && echo "aws calls: $(python3 -c 'import json,sys;print(",".join(json.loads(l)["op"] for l in open(sys.argv[1])))' "$D/state.json.ops")"
  checks "$out" "${6:-}"; expect "$out" "$code" "$4" "$5"
}
echo; echo "######## A. The 25 revision 1 cases, now through the real AWS CLI v2"
run "1 normal run" normal CREATE 0 "CREATED VERIFIED" writes
echo "== 1a Identity 2db6ed9 loader on the written bundle"
o1a=$(cd "$D" && node check-ring.mjs state.json.put 2>&1); echo "$o1a"
grep -q "loadEnvironment (prod)  starts" <<<"$o1a" && grep -q "problems=0" <<<"$o1a" && echo "case ok" || fail "1a"
run "1b second run on the result (rerun safety)" normal CREATE 0 "ALREADY DONE VERIFIED" keep
grep -c '"op": "PutSecretValue"' "$D/state.json.ops" | grep -qx 1 && echo "still exactly one PutSecretValue" || fail "1b wrote again"
run "1c already done but the existing version is wrong (bad ring)" done_bad CREATE 1 "ABORT EXISTING_VERSION_NOT_AS_EXPECTED"
run "1d a version without a label exists (hidden from DescribeSecret)" unlabelled CREATE 1 "ABORT UNEXPECTED_VERSIONS listed=2"
run "1e labels move while the operator sits at the prompt" moved_during_prompt CREATE 1 "ABORT LABELS_CHANGED_SINCE_PREFLIGHT"
run "2 wrong account" wrong_account CREATE 1 "ABORT WRONG_ACCOUNT"
run "3 secret ARN mismatch" arn_mismatch CREATE 1 "ABORT SECRET_ARN_OR_NAME_MISMATCH"
run "4 wrong KMS key" wrong_kms CREATE 1 "ABORT SECRET_KMS_KEY_MISMATCH"
run "5 rotation enabled" rotation CREATE 1 "ABORT SECRET_HAS_ROTATION"
run "6 an extra AWSPENDING version" pending CREATE 1 "ABORT UNEXPECTED_VERSIONS count=2"
run "7 not confirmed (typed yes)" normal yes 1 "ABORT NOT_CONFIRMED"
run "8 bundle already has MFA_ENCRYPTION_KEYS" has_ring CREATE 1 "ABORT MFA_ENCRYPTION_KEYS_ALREADY_PRESENT"
run "9 unexpected extra key" extra_key CREATE 1 "ABORT BUNDLE_KEYS_UNEXPECTED missing=none extra_count=1"
run "10 duplicate JSON key" dup_key CREATE 1 "ABORT BUNDLE_NOT_VALID_JSON_OR_DUPLICATE_KEY"
run "11 empty value" empty_value CREATE 1 "ABORT BUNDLE_VALUE_NOT_A_NON_EMPTY_STRING"
run "12 binary secret" binary CREATE 1 "ABORT BUNDLE_NOT_A_STRING"
run "13 read denied (the AWS error message holds a marker and must not be printed)" deny_read CREATE 1 "ABORT AWS_ERROR get-secret-value AccessDeniedException"
run "14 key collides with the signing secret (forced)" collide CREATE 1 "ABORT KEY_COLLIDES_WITH_ANOTHER_SECRET"
run "15 degenerate key (forced repeated byte)" degenerate CREATE 1 "ABORT KEY_SELF_CHECK_FAILED"
run "16 concurrent writer moves AWSCURRENT after our write" race CREATE 1 "AFTER_WRITE_ATTEMPT" writes
run "17 written value differs on read-back" differs CREATE 1 "ABORT WRITTEN_VALUE_DIFFERS" writes
run "18 AWS error after the write" fail_after_write CREATE 1 "ABORT AWS_ERROR describe-secret InternalServiceError" writes
echo "== 19 sourced instead of run: refused, outer shell survives"
o19=$(bash -c "source '$T'; echo OUTER_SHELL_STILL_RUNNING rc=\$?" 2>&1); echo "$o19"
grep -q "ABORT SOURCED" <<<"$o19" && grep -q OUTER_SHELL_STILL_RUNNING <<<"$o19" && echo "case ok" || fail "19"
echo "== 20 isolated mode (-I -W ignore kept), real terminal prompt, real CLI"
sed -e "s#\"https://sts.{REGION}.amazonaws.com\"#\"$URL\"#" -e "s#\"https://secretsmanager.{REGION}.amazonaws.com\"#\"$URL\"#" "$SRC" > "$D/stage-c-iso.sh"
reset; HOME_BEFORE=$(snapshot); start_server normal
o20=$(cd /tmp && env -i PATH=/usr/bin:/bin HOME="$D/home" "${CRED_ENV[@]}" STATE=$D/state.json python3 "$D/pty-drive.py" "$D/stage-c-iso.sh" | sed "s#$D#<test>#g"); echo "$o20"
checks "$o20" writes
grep -q "CREATED VERIFIED" <<<"$o20" && grep -q "typed_on_tty=True" <<<"$o20" && grep -q "isolated=True" <<<"$o20" && grep -q "no fake secret marker and no key" <<<"$o20" && echo "case ok" || fail "20"

echo; echo "######## B. New cases for the AWS CLI execution path"
variant() { # name sed-expression -> path of a script variant
  sed -e "$2" "$T" > "$D/variant-$1.sh"; echo "-- variant $1: $(diff "$T" "$D/variant-$1.sh" | grep '^>' | sed "s#$D#<test>#g")" >&2; echo "$D/variant-$1.sh"
}
noaws() { if [[ -f $D/state.json.ops ]]; then fail "an AWS call was made"; else echo "no AWS call made"; fi; }
V=$(variant missing 's#AWS_CANDIDATES = \["/usr/local/bin/aws", "/usr/bin/aws"\]#AWS_CANDIDATES = ["/nonexistent/aws"]#')
run "21 AWS CLI missing" normal CREATE 1 "ABORT AWS_CLI_MISSING" "" "$V"; noaws
V=$(variant outside "s#AWS_CANDIDATES = \[\"/usr/local/bin/aws\", \"/usr/bin/aws\"\]#AWS_CANDIDATES = [\"$D/fakebin/aws\"]#")
mkdir -p "$D/fakebin"; printf '#!/bin/sh\necho aws-cli/2.0.0\n' > "$D/fakebin/aws"; chmod 755 "$D/fakebin/aws"
run "22a an aws outside the allowed locations (e.g. installed in a home directory)" normal CREATE 1 "ABORT AWS_CLI_UNEXPECTED_LOCATION" "" "$V"; noaws
mkdir -p /usr/local/aws-cli/v2/zz-test; printf '#!/bin/sh\necho aws-cli/2.0.0\n' > /usr/local/aws-cli/v2/zz-test/aws; chmod 755 /usr/local/aws-cli/v2/zz-test/aws; chown 65534 /usr/local/aws-cli/v2/zz-test/aws
V=$(variant notroot 's#AWS_CANDIDATES = \["/usr/local/bin/aws", "/usr/bin/aws"\]#AWS_CANDIDATES = ["/usr/local/aws-cli/v2/zz-test/aws"]#')
run "22b an aws in the right place but not owned by root" normal CREATE 1 "ABORT AWS_CLI_NOT_ROOT_OWNED" "" "$V"; noaws
chown 0 /usr/local/aws-cli/v2/zz-test/aws; chmod 777 /usr/local/aws-cli/v2/zz-test/aws
run "22c an aws writable by others" normal CREATE 1 "ABORT AWS_CLI_NOT_ROOT_OWNED" "" "$V"; noaws
chmod 755 /usr/local/aws-cli/v2/zz-test/aws; printf '#!/bin/sh\necho aws-cli/1.38.0 Python/3.9\n' > /usr/local/aws-cli/v2/zz-test/aws
run "23 AWS CLI version 1" normal CREATE 1 "ABORT AWS_CLI_NOT_VERSION_2" "" "$V"; noaws
rm -rf /usr/local/aws-cli/v2/zz-test
reset; HOME_BEFORE=$(snapshot); start_server normal
echo "== 24 no CloudShell container credentials"
o24=$(cd /tmp && env -i PATH=/usr/bin:/bin HOME="$D/home" bash -p "$T" 2>&1); c24=$?; echo "$o24"; echo "exit=$c24"
checks "$o24"; expect "$o24" "$c24" 1 "ABORT CLOUDSHELL_CREDENTIALS_MISSING"; noaws
echo "== 25 hostile home and environment (tampered ~/.aws, CLI history and alias, other credential sources, proxy, CA, TMPDIR)"
reset; mkdir -p "$D/home/.aws/cli" "$D/hostile-tmp"
printf '[default]\ncli_history = enabled\nregion = us-east-1\nendpoint_url = http://127.0.0.1:9\ncredential_process = /bin/false\n' > "$D/home/.aws/config"
printf '[default]\naws_access_key_id = AKIAHOSTILE\naws_secret_access_key = hostile\n' > "$D/home/.aws/credentials"
printf '[toplevel]\nsecretsmanager = !echo hijacked\n' > "$D/home/.aws/cli/alias"
HOME_BEFORE=$(snapshot); start_server normal; printf 'CREATE\n' > "$D/confirm.txt"
o25=$(cd /tmp && env -i PATH=/usr/bin:/bin HOME="$D/home" "${CRED_ENV[@]}" AWS_CONFIG_FILE="$D/home/.aws/config" \
  AWS_SHARED_CREDENTIALS_FILE="$D/home/.aws/credentials" AWS_PROFILE=default AWS_ACCESS_KEY_ID=AKIAHOSTILE AWS_SECRET_ACCESS_KEY=hostile \
  AWS_ROLE_ARN=arn:aws:iam::111111111111:role/hostile AWS_WEB_IDENTITY_TOKEN_FILE="$D/home/token" AWS_ENDPOINT_URL=http://127.0.0.1:9 \
  AWS_CA_BUNDLE=/nonexistent HTTPS_PROXY=http://127.0.0.1:9 HTTP_PROXY=http://127.0.0.1:9 AWS_DATA_PATH="$D/home" \
  GCONV_PATH="$D/home" MALLOC_CHECK_=3 PYTHONSTARTUP="$D/home/.bashrc" PYTHONHOME=/nonexistent \
  AWS_DEFAULT_OUTPUT=text AWS_CLI_AUTO_PROMPT=on TMPDIR="$D/hostile-tmp" PYTHONPATH="$D/home" bash -p "$T" 2>&1); c25=$?
echo "$o25" | sed "s#$D#<test>#g"; echo "exit=$c25"
checks "$o25" writes; expect "$o25" "$c25" 0 "CREATED VERIFIED"
if find "$D/home" "$D/hostile-tmp" /tmp -name 'history.db' 2>/dev/null | grep -q .; then fail "CLI history database written"; else echo "no CLI history database anywhere"; fi
if [[ -n $(ls -A "$D/hostile-tmp") ]]; then fail "hostile TMPDIR used"; else echo "hostile TMPDIR not used"; fi
echo "== 26 process arguments and environment while requests were in flight (all cases above)"
echo "process scans across all cases: $SCANS, every one with no hit (checked after each case)"
echo "== 28 environment of the script's Python and of every AWS CLI process, seen while requests were in flight"
python3 "$D/check-envnames.py" "$D/envnames-all" || FAILS=$((FAILS+1))
echo "== 27 control: the process scan does see a marker placed in another process's arguments"
reset; start_server wrong_account
(exec -a FAKESECRET-control sleep 5) & CTRL=$!
sleep 0.3
env -i PATH=/usr/bin:/bin HOME="$D/home" AWS_CONFIG_FILE=/dev/null "${CRED_ENV[@]}" /usr/local/bin/aws sts get-caller-identity \
  --region eu-central-1 --endpoint-url $URL >/dev/null 2>&1
kill $CTRL 2>/dev/null; wait $CTRL 2>/dev/null
if grep -q "/cmdline" "$D/state.json.proc"; then echo "control detected: $(cat "$D/state.json.proc")"; echo "case ok"; else fail "27 the scan missed the control marker"; fi
stop_server
echo "== RESULT: $([[ $FAILS = 0 ]] && echo 'ALL CASES PASS, no fake secret marker and no key in any output, argument or environment' || echo "$FAILS FAILURE(S)")"
exit $FAILS
