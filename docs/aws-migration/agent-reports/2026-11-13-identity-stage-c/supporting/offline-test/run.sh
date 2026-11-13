#!/usr/bin/env bash
# Offline stage C test (no AWS; fake values all contain FAKESECRET). Usage: run.sh <script>
# Cases 1-19 run the real script with two test-only substitutions, shown in the output: the python
# line (-> python3 with PYTHONPATH=stub: a fake boto3, and a fake `secrets` used only by the forced
# collide/degenerate cases) and /dev/tty (-> a file holding the typed answer). Case 20 keeps
# `-I -W ignore` and the real /dev/tty: the stub boto3 sits in a venv's site-packages (venv-iso) and
# CREATE is typed on a pseudo-terminal (pty-drive.py). Case 1a needs build/identity-config-2db6ed9.mjs
# (build-identity-config.sh) and build/id-p5.txt (the mocked P-5 render of the Identity task).
# Exit status: 0 only if every case shows its expected line and no output leaks a marker or the key.
set -u
D=$(cd "$(dirname "$0")" && pwd)
SRC=$1
T=$D/stage-c-under-test.sh
sed -e "s#exec /usr/bin/python3 -I -W ignore -#exec env PYTHONPATH=\"$D/stub\" /usr/bin/python3 -#" -e "s#\"/dev/tty\"#\"$D/confirm.txt\"#" "$SRC" > "$T"
echo "== test-only substitutions"; diff "$SRC" "$T" | sed "s#$D#<test>#g"
[[ $(diff "$SRC" "$T" | grep -c '^<') == 2 ]] || { echo "FAIL: substitutions did not apply"; exit 1; }
FAILS=0
leakcheck() { # output
  if grep -q FAKESECRET <<<"$1"; then echo "LEAK: fake secret marker in output"; FAILS=$((FAILS+1)); fi
  if [[ -f $D/state.json.put ]]; then
    local k; k=$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["MFA_ENCRYPTION_KEYS"].split("=",1)[1])' "$D/state.json.put")
    if grep -qF -- "$k" <<<"$1"; then echo "LEAK: key in output"; FAILS=$((FAILS+1)); fi
  fi
}
expect() { # output code want-code want-text
  if [[ $2 != "$3" ]] || ! grep -qF -- "$4" <<<"$1"; then echo "CASE FAILED (wanted exit $3 and: $4)"; FAILS=$((FAILS+1)); else echo "case ok"; fi
}
run() { # name scenario answer want-code want-text [keep-state]
  [[ ${6:-} == keep ]] || rm -f "$D/state.json" "$D/state.json.put" "$D/state.json.n"
  printf '%s\n' "$3" > "$D/confirm.txt"
  echo "== $1"
  local out code; out=$(SCEN=$2 STATE=$D/state.json bash -p "$T" 2>&1); code=$?
  echo "$out"; echo "exit=$code"; leakcheck "$out"; expect "$out" "$code" "$4" "$5"
}
run "1 normal run" normal CREATE 0 "CREATED VERIFIED"
echo "== 1a Identity 2db6ed9 loader on the written bundle"
o1a=$(cd "$D" && node check-ring.mjs state.json.put 2>&1); echo "$o1a"
grep -q "loadEnvironment (prod)  starts" <<<"$o1a" && grep -q "problems=0" <<<"$o1a" && echo "case ok" || { echo "CASE FAILED"; FAILS=$((FAILS+1)); }
run "1b second run on the result (rerun safety)" normal CREATE 0 "ALREADY DONE VERIFIED" keep
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
run "13 read denied" deny_read CREATE 1 "ABORT EXCEPTION ClientError AccessDeniedException"
run "14 key collides with the signing secret (forced)" collide CREATE 1 "ABORT KEY_COLLIDES_WITH_ANOTHER_SECRET"
run "15 degenerate key (forced repeated byte)" degenerate CREATE 1 "ABORT KEY_SELF_CHECK_FAILED"
run "16 concurrent writer moves AWSCURRENT after our write" race CREATE 1 "AFTER_WRITE_ATTEMPT"
run "17 written value differs on read-back" differs CREATE 1 "ABORT WRITTEN_VALUE_DIFFERS"
run "18 AWS error after the write" fail_after_write CREATE 1 "ABORT EXCEPTION ClientError InternalServiceError"
echo "== 19 sourced instead of run: refused, outer shell survives"
o19=$(bash -c "source '$T'; echo OUTER_SHELL_STILL_RUNNING rc=\$?" 2>&1); echo "$o19"
grep -q "ABORT SOURCED" <<<"$o19" && grep -q OUTER_SHELL_STILL_RUNNING <<<"$o19" && echo "case ok" || { echo "CASE FAILED"; FAILS=$((FAILS+1)); }
echo "== 20 isolated mode (-I -W ignore kept) and a real terminal prompt"
if [[ -x $D/venv-iso/bin/python3 ]]; then
  sed -e "s#exec /usr/bin/python3 -I -W ignore -#exec $D/venv-iso/bin/python3 -I -W ignore -#" "$SRC" > "$D/stage-c-iso.sh"
  rm -f "$D/state.json" "$D/state.json.put"
  o20=$(SCEN=normal STATE=$D/state.json python3 "$D/pty-drive.py" "$D/stage-c-iso.sh" | sed "s#$D#<test>#g"); echo "$o20"
  grep -q "CREATED VERIFIED" <<<"$o20" && grep -q "typed_on_tty=True" <<<"$o20" && grep -q "no fake secret marker and no key" <<<"$o20" && echo "case ok" || { echo "CASE FAILED"; FAILS=$((FAILS+1)); }
else echo "CASE FAILED: venv-iso missing (python3 -m venv venv-iso; copy stub/boto3.py and stub/botocore into its site-packages)"; FAILS=$((FAILS+1)); fi
echo "== RESULT: $([[ $FAILS = 0 ]] && echo 'ALL CASES PASS, no fake secret marker and no key in any output' || echo "$FAILS FAILURE(S)")"
exit $FAILS
