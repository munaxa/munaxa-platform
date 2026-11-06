#!/usr/bin/env bash
# Offline tests for stop-database.sh (aws-session.yml `down`): a stub `aws` on PATH plays the RDS
# answers, so no credential and no AWS call is involved. They pin the idempotent cases the manual
# shutdown path relies on next to the AWS-side backstop (infra/aws/stack/backstop.tf): already
# stopped or stopping, absent, available, the seven-day auto-restart (starting), and refusals.
#
# Usage: scripts/aws/stop-database.test.sh   (exit 0 when every case passes)
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/bin"

# The stub reads the statuses to answer, one per describe call, from $STUB_STATUSES (space
# separated; "notfound" and "denied" make describe fail), records every stop call, and fails a stop
# when $STUB_STOP_FAILS is set.
cat >"$work/bin/aws" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail
state_dir=${STUB_DIR:?}
case "$1 $2" in
  "rds describe-db-instances")
    n=$(cat "$state_dir/n" 2>/dev/null || echo 0)
    n=$((n + 1))
    echo "$n" >"$state_dir/n"
    read -r -a answers <<<"$STUB_STATUSES"
    idx=$((n - 1))
    [ "$idx" -lt "${#answers[@]}" ] || idx=$((${#answers[@]} - 1))
    answer=${answers[$idx]}
    case "$answer" in
      notfound) echo "An error occurred (DBInstanceNotFound) when calling the DescribeDBInstances operation: DBInstance x not found." >&2; exit 254 ;;
      denied) echo "An error occurred (AccessDenied) when calling the DescribeDBInstances operation" >&2; exit 254 ;;
      *) echo "$answer" ;;
    esac
    ;;
  "rds stop-db-instance")
    echo stop >>"$state_dir/stops"
    if [ -n "${STUB_STOP_FAILS:-}" ]; then
      echo "An error occurred (InvalidDBInstanceState) when calling the StopDBInstance operation" >&2
      exit 254
    fi
    echo '{}'
    ;;
  *) echo "unexpected aws call: $*" >&2; exit 99 ;;
esac
STUB
chmod +x "$work/bin/aws"

pass=0
fail=0
# case <name> <statuses> <expected exit> <expected stop calls> <expected output fragment> [stop fails]
case_() {
  local name=$1 statuses=$2 want_code=$3 want_stops=$4 want_text=$5 stop_fails=${6:-}
  local dir="$work/$name" out code stops
  mkdir -p "$dir"
  set +e
  out=$(PATH="$work/bin:$PATH" STUB_DIR="$dir" STUB_STATUSES="$statuses" STUB_STOP_FAILS="$stop_fails" \
    STOP_WAIT_SECONDS=2 STOP_POLL_SECONDS=1 "$here/stop-database.sh" munaxa-nonprod-pg 2>&1)
  code=$?
  set -e
  stops=0
  if [ -f "$dir/stops" ]; then stops=$(wc -l <"$dir/stops"); fi
  stops=$((stops + 0))
  if [ "$code" -eq "$want_code" ] && [ "$stops" -eq "$want_stops" ] && grep -qF -- "$want_text" <<<"$out"; then
    pass=$((pass + 1))
    echo "ok   $name"
  else
    fail=$((fail + 1))
    echo "FAIL $name: exit $code (want $want_code), stop calls $stops (want $want_stops), output: $out"
  fi
}

case_ already-stopped "stopped" 0 0 "database munaxa-nonprod-pg: stopped"
case_ already-stopping "stopping" 0 0 "database munaxa-nonprod-pg: stopping"
case_ absent "notfound" 0 0 "nothing to stop"
case_ available "available" 0 1 "was available, stop requested"
case_ auto-restart-then-available "starting available" 0 1 "was available, stop requested"
case_ starting-too-long "starting" 1 0 "still starting after 2s"
case_ describe-denied "denied" 1 0 "cannot read the state"
case_ stop-refused "available" 1 1 "the stop request failed" yes
case_ unknown-state "failed" 1 0 "is failed: not stopped"
# Run twice in a row: the second run finds it stopping and changes nothing.
case_ second-run "stopping" 0 0 "stopping"

echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
