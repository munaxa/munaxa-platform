#!/usr/bin/env bash
# Stop a Testing database (aws-session.yml `down`). Needs credentials that may describe and stop it.
#
#   stopped, stopping     nothing to do (green)
#   available             stop requested (green)
#   a passing state       wait (starting after the seven-day auto-restart, backing-up, modifying, ...)
#                         and stop once available; still not available after STOP_WAIT_SECONDS: red
#   not found             green notice (before the first apply)
#   anything else         red, so a failed backstop is visible in the run list
#
# Usage: stop-database.sh <db-instance-identifier>
set -euo pipefail

db=${1:?usage: stop-database.sh <db-instance-identifier>}
wait_seconds=${STOP_WAIT_SECONDS:-1800}
poll_seconds=${STOP_POLL_SECONDS:-30}

describe() {
  aws rds describe-db-instances --db-instance-identifier "$db" \
    --query 'DBInstances[0].DBInstanceStatus' --output text
}

set +e
status=$(describe 2>&1)
code=$?
set -e
if [ "$code" -ne 0 ]; then
  if grep -q 'DBInstanceNotFound' <<<"$status"; then
    echo "::notice::no database $db yet: nothing to stop"
    exit 0
  fi
  echo "::error::cannot read the state of $db: $status"
  exit 1
fi

deadline=$((SECONDS + wait_seconds))
while :; do
  case "$status" in
    stopped | stopping)
      echo "database $db: $status"
      exit 0
      ;;
    available)
      aws rds stop-db-instance --db-instance-identifier "$db" >/dev/null
      echo "database $db: was available, stop requested"
      exit 0
      ;;
    starting | backing-up | modifying | maintenance | rebooting | renaming | upgrading | storage-optimization | \
      configuring-enhanced-monitoring | configuring-iam-database-auth | configuring-log-exports | resetting-master-credentials)
      if [ "$SECONDS" -ge "$deadline" ]; then
        echo "::error::database $db still $status after ${wait_seconds}s: not stopped (the AWS-side backstop retries at its own time)"
        exit 1
      fi
      echo "database $db: $status, waiting"
      sleep "$poll_seconds"
      status=$(describe)
      ;;
    *)
      echo "::error::database $db is $status: not stopped"
      exit 1
      ;;
  esac
done
