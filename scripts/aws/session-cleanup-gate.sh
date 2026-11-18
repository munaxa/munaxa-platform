#!/usr/bin/env bash
# H-20 enforced: the Testing session cleanup gate before every `up` (aws-session.yml, job `session`).
#
# Read-only. It runs as the nonprod session deployer and calls only Describe/List/Get operations and
# sts:GetCallerIdentity. It writes nothing in AWS and changes no schedule. It PASSES only when all ten
# conditions hold; anything else (a failed condition, a missing or malformed answer, an AWS error
# such as AccessDenied, a bad input) is a FAIL with a code, and the step exits 1, so GitHub skips
# every later `up` step: plan, database start and apply. `down` never runs this script.
#
#    1 state_machine_active        munaxa-nonprod-session-cleanup is ACTIVE and STANDARD
#    2 succeeded_within_26h        its latest SUCCEEDED execution stopped within the last 26 hours
#    3 last_success_was_real       that execution's input is exactly {"dryRun": false}
#    4 none_running                no execution is RUNNING (a running cleanup would delete this session)
#    5 daily_enabled               schedule ...-daily (R) is ENABLED and targets the state machine
#    6 daily_role_and_input        ... through the backstop scheduler role, with {"dryRun": false}
#    7 alarms_present              ...-failed and ...-not-run both exist
#    8 alarms_not_in_alarm         neither is in ALARM
#    9 no_stale_session_schedules  no P or S schedule other than this session's own two
#   10 own_session_armed           this session's P (at H) and S (at H + 30 min) exist, exactly as the
#                                  connector's `arm` creates them
#
# Conditions 1 to 9 are the connector gate's eight checks (scripts/aws/connector/
# h20-session-cleanup-gate-and-arm.py, MODE "gate"; its daily_enabled is 5 and 6 here), with the same
# meaning; test_session_cleanup_gate_workflow.py runs both against the same fake AWS. Condition 10 is
# new: the workflow refuses an unarmed session, while the connector only allows its own P and S.
#
# Input: HARD_STOP_UTC, the session's hard stop H as YYYY-MM-DDTHH:MM:00Z, required. H must be at
# least 1 hour and at most 6 hours ahead (as `arm` requires), and S (H + 30 min) must not reach the 21:00 UTC backstop
# or the 21:05 UTC daily cleanup R (the connector's `arm` rule).
#
# Output: check names, true/false, error codes, alarm states and schedule names only. Never an AWS
# error message, an execution input or output, or a credential.
#
# Usage: HARD_STOP_UTC=2026-11-20T15:00:00Z scripts/aws/session-cleanup-gate.sh
set -uo pipefail

ACCOUNT=229251310592
REGION=eu-central-1
NAME=munaxa-nonprod-session-cleanup
SM_ARN="arn:aws:states:$REGION:$ACCOUNT:stateMachine:$NAME"
ROLE_ARN="arn:aws:iam::$ACCOUNT:role/munaxa-shared/munaxa-nonprod-session-backstop"
DAILY="$NAME-daily"
ALARM_FAILED="$NAME-failed"
ALARM_NOT_RUN="$NAME-not-run"
CHECKS=(state_machine_active succeeded_within_26h last_success_was_real none_running daily_enabled
  daily_role_and_input alarms_present alarms_not_in_alarm no_stale_session_schedules own_session_armed)

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

declare -A check=()
declare -A errors=()
notes=()
code=""

# call <out-file> <aws args...>: JSON on stdout into <out-file>. On failure, `code` is AWS_<Code>
# (only the code, parsed from "An error occurred (<Code>)"), or MALFORMED for an answer that is not a
# JSON object. Never the message.
call() {
  local out=$1
  shift
  code=""
  if aws --region "$REGION" --output json "$@" >"$out" 2>"$work/stderr"; then
    if jq -e 'type == "object"' "$out" >/dev/null 2>&1; then
      return 0
    fi
    code=MALFORMED
    return 1
  fi
  code=$(sed -nE 's/.*An error occurred \(([A-Za-z0-9.]{1,64})\).*/\1/p' "$work/stderr" | head -n 1)
  code="AWS_${code:-UNKNOWN}"
  return 1
}

# The input is exactly {"dryRun": false} (a JSON string field, compared as JSON).
REAL_INPUT='(. // "") | (try (fromjson == {"dryRun": false}) catch false)'
# An AWS CLI timestamp (2026-11-18T21:05:23.202000+00:00, or ...Z) as epoch seconds; null otherwise.
EPOCH='if type == "string" then (sub("\\.[0-9]+"; "") | sub("\\+00:00$"; "Z") | try fromdateiso8601 catch null) else null end'

finish() {
  local result=PASS name value
  for name in "${CHECKS[@]}"; do
    value=${check[$name]:-false}
    [ "$value" = true ] || result=FAIL
    if [ -n "${errors[$name]:-}" ]; then
      echo "check $name $value ${errors[$name]}"
    else
      echo "check $name $value"
    fi
  done
  for line in "${notes[@]}"; do echo "note $line"; done
  echo "H-20 gate: $result"
  if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
    {
      echo "### H-20 gate: $result"
      for name in "${CHECKS[@]}"; do echo "- $name: ${check[$name]:-false} ${errors[$name]:-}"; done
    } >>"$GITHUB_STEP_SUMMARY"
  fi
  if [ "$result" = PASS ]; then exit 0; fi
  echo "::error::H-20 gate FAILED: Testing up is refused (no plan, no database start, no apply)"
  exit 1
}

# An input, clock or caller problem: no check is evaluated, so all ten stay false, and the reason is
# printed on its own line (review L-3), not as one check's code.
abort() {
  notes+=("abort $1")
  finish
}

# --- inputs and the clock -------------------------------------------------------------------------
hard_stop=${HARD_STOP_UTC:-}
[[ "$hard_stop" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:00Z$ ]] || abort HARD_STOP_SHAPE
h=$(date -u -d "$hard_stop" +%s 2>/dev/null) || abort HARD_STOP_SHAPE
[ "$(date -u -d "@$h" +%Y-%m-%dT%H:%M:%SZ)" = "$hard_stop" ] || abort HARD_STOP_SHAPE
now=$(date -u +%s)
[[ "$now" =~ ^[0-9]+$ ]] || abort CLOCK
# At least 60 minutes, as the connector's `arm` requires (review M-2): the job may take up to 50
# minutes, and P at H must never fire while this `up` is still applying.
if [ "$h" -lt $((now + 3600)) ] || [ "$h" -gt $((now + 21600)) ]; then abort HARD_STOP_NOT_IN_1_TO_6_HOURS; fi
s=$((h + 1800))
for day in 0 1; do
  d=$(date -u -d "@$((now + day * 86400))" +%Y-%m-%d)
  t=$(date -u -d "${d}T21:00:00Z" +%s)
  if [ "$now" -le $((t + 600)) ] && [ "$t" -le "$s" ]; then abort SESSION_CROSSES_21_UTC; fi
done
own_p="$NAME-p-$(date -u -d "@$h" +%Y%m%dt%H%M)"
own_s="$NAME-s-$(date -u -d "@$s" +%Y%m%dt%H%M)"
at_p="at($(date -u -d "@$h" +%Y-%m-%dT%H:%M:%S))"
at_s="at($(date -u -d "@$s" +%Y-%m-%dT%H:%M:%S))"

# --- the account ------------------------------------------------------------------------------------
if ! call "$work/who" sts get-caller-identity; then abort "CALLER_$code"; fi
[ "$(jq -r '.Account // ""' "$work/who")" = "$ACCOUNT" ] || abort WRONG_ACCOUNT

# --- 1 the state machine ------------------------------------------------------------------------------
if call "$work/sm" stepfunctions describe-state-machine --state-machine-arn "$SM_ARN"; then
  check[state_machine_active]=$(jq --arg n "$NAME" '.status == "ACTIVE" and .name == $n and .type == "STANDARD"' "$work/sm")
else
  errors[state_machine_active]=$code
fi

# --- 2, 3 the latest success (newest first), and whether it was a real run -----------------------
if call "$work/done" stepfunctions list-executions --state-machine-arn "$SM_ARN" --status-filter SUCCEEDED --max-items 1; then
  if jq -e '.executions | type == "array"' "$work/done" >/dev/null; then
    stopped=$(jq -r "(.executions[0].stopDate // null) | $EPOCH" "$work/done")
    if [[ "$stopped" =~ ^[0-9]+$ ]] && [ "$stopped" -le $((now + 300)) ] && [ $((now - stopped)) -le 93600 ]; then
      check[succeeded_within_26h]=true
      arn=$(jq -r '.executions[0].executionArn // ""' "$work/done")
      if [[ "$arn" == "arn:aws:states:$REGION:$ACCOUNT:execution:$NAME:"* ]]; then
        if call "$work/x" stepfunctions describe-execution --execution-arn "$arn"; then
          check[last_success_was_real]=$(jq ".input | $REAL_INPUT" "$work/x")
        else
          errors[last_success_was_real]=$code
        fi
      else
        errors[last_success_was_real]=EXECUTION_ARN
      fi
    else
      errors[succeeded_within_26h]=NO_SUCCESS_WITHIN_26H
    fi
  else
    errors[succeeded_within_26h]=MALFORMED
  fi
else
  errors[succeeded_within_26h]=$code
fi

# --- 4 nothing running ------------------------------------------------------------------------------
if call "$work/running" stepfunctions list-executions --state-machine-arn "$SM_ARN" --status-filter RUNNING --max-items 10; then
  check[none_running]=$(jq '(.executions | type == "array") and (.executions | length == 0)' "$work/running")
else
  errors[none_running]=$code
fi

# --- 5, 6 the daily cleanup R -----------------------------------------------------------------------
if call "$work/daily" scheduler get-schedule --name "$DAILY"; then
  check[daily_enabled]=$(jq --arg sm "$SM_ARN" '.State == "ENABLED" and (.Target.Arn // "") == $sm' "$work/daily")
  check[daily_role_and_input]=$(jq --arg role "$ROLE_ARN" "(.Target.RoleArn // \"\") == \$role and (.Target.Input | $REAL_INPUT)" "$work/daily")
else
  errors[daily_enabled]=$code
  errors[daily_role_and_input]=$code
fi

# --- 7, 8 the alarms --------------------------------------------------------------------------------
if call "$work/alarms" cloudwatch describe-alarms --alarm-names "$ALARM_FAILED" "$ALARM_NOT_RUN"; then
  if jq -e '.MetricAlarms | type == "array"' "$work/alarms" >/dev/null; then
    check[alarms_present]=$(jq --arg a "$ALARM_FAILED" --arg b "$ALARM_NOT_RUN" '[.MetricAlarms[].AlarmName] | sort == ([$a, $b] | sort)' "$work/alarms")
    check[alarms_not_in_alarm]=$(jq --argjson present "${check[alarms_present]}" '$present and all(.MetricAlarms[]; .StateValue == "OK" or .StateValue == "INSUFFICIENT_DATA")' "$work/alarms")
    while IFS= read -r line; do notes+=("alarm $line"); done < <(jq -r '.MetricAlarms[] | "\(.AlarmName) \(.StateValue)"' "$work/alarms" | tr -cd 'A-Za-z0-9_ .\n-')
  else
    errors[alarms_present]=MALFORMED
    errors[alarms_not_in_alarm]=MALFORMED
  fi
else
  errors[alarms_present]=$code
  errors[alarms_not_in_alarm]=$code
fi

# --- 9 no other session's P or S ------------------------------------------------------------------
if call "$work/list" scheduler list-schedules --name-prefix "$NAME-"; then
  if jq -e '.Schedules | type == "array"' "$work/list" >/dev/null; then
    stale=$(jq -r --arg p "$own_p" --arg s "$own_s" \
      '[.Schedules[].Name | strings | select(test("^munaxa-nonprod-session-cleanup-[ps]-[0-9]{8}t[0-9]{4}$")) | select(. != $p and . != $s)] | unique | join(" ")' "$work/list")
    if [ -z "$stale" ]; then
      check[no_stale_session_schedules]=true
    else
      check[no_stale_session_schedules]=false
      notes+=("stale $stale")
    fi
  else
    errors[no_stale_session_schedules]=MALFORMED
  fi
else
  errors[no_stale_session_schedules]=$code
fi

# --- 10 this session's own P and S, exactly as `arm` creates them ---------------------------------
armed() {
  local name=$1 expression=$2 out="$work/own-$1"
  if ! call "$out" scheduler get-schedule --name "$name"; then
    errors[own_session_armed]="${name##*-cleanup-}:$code"
    return 1
  fi
  jq -e --arg e "$expression" --arg sm "$SM_ARN" --arg role "$ROLE_ARN" "
    .State == \"ENABLED\" and .ScheduleExpression == \$e
    and ((.ScheduleExpressionTimezone // \"UTC\") == \"UTC\")
    and ((.FlexibleTimeWindow.Mode // \"\") == \"OFF\")
    and .ActionAfterCompletion == \"DELETE\"
    and (.Target.Arn // \"\") == \$sm and (.Target.RoleArn // \"\") == \$role
    and (.Target.Input | $REAL_INPUT)
    and (.Target.RetryPolicy.MaximumRetryAttempts // -1) == 3" "$out" >/dev/null || {
    errors[own_session_armed]="${name##*-cleanup-}:NOT_AS_ARMED"
    return 1
  }
}
if armed "$own_p" "$at_p" && armed "$own_s" "$at_s"; then
  check[own_session_armed]=true
fi
notes+=("own $own_p $own_s")

finish
