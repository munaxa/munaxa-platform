# H-20  Independent session cleanup: the gate before `up`, and arming the session's P and S runs.
#
# Stage E blocker BE-2 (report 2026-11-14-identity-stage-e-blockers-remediation, file 02). Needs the
# cleanup applied first (infra/aws/stack/session-cleanup.tf, session_cleanup_enabled = true, an
# owner-approved configuration PR and apply). Until then the gate FAILS and `up` must not run.
#
#   MODE "gate"  read-only. PASS only if: the state machine exists and is ACTIVE; its last SUCCEEDED
#                execution ended within 26 hours (the daily run R works end to end); no execution is
#                RUNNING (a running cleanup would delete the new session's load balancer); the daily
#                schedule R is ENABLED and targets the state machine with {"dryRun": false}; neither
#                alarm is in ALARM; the last success was a real run, not a dry run; and no P or S
#                schedule of an earlier session is still waiting to fire (it would delete this
#                session's load balancer). With HARD_STOP_UTC set, that session's own P and S pass.
#   MODE "arm"   the gate, then two one-time EventBridge Scheduler schedules for this session:
#                P at the hard stop H and S at H + 30 min, each starting the state machine with
#                {"dryRun": false} through the backstop scheduler role, deleting itself after it
#                fires (ActionAfterCompletion DELETE). Idempotent: a fixed ClientToken per schedule,
#                and an existing schedule with the same time and target counts as armed; any other
#                existing schedule of that name aborts. Refuses a session whose S would fall after the
#                backstop (21:00 UTC) or R (21:05 UTC). Never deletes or changes anything else.
#   MODE "disarm" only after `down` is verified complete: deletes every leftover P and S schedule
#                (names matching munaxa-nonprod-session-cleanup-{p|s}-YYYYMMDDtHHMM only).
#
# Returns names, times and codes only. Checked by sandbox_harness.py and tested against a fake AWS
# (test_session_cleanup_arm.py). NOT RUN.

MODE = "gate"  # INPUT: gate | arm | disarm
HARD_STOP_UTC = ""  # INPUT: arm (and gate after arming), the session's hard stop H, e.g. 2026-11-20T15:00:00Z

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

NAME = "munaxa-nonprod-session-cleanup"
SM_ARN = "arn:aws:states:" + REGION + ":" + ACCOUNT + ":stateMachine:" + NAME
ROLE_ARN = "arn:aws:iam::" + ACCOUNT + ":role/munaxa-shared/munaxa-nonprod-session-backstop"
DAILY = NAME + "-daily"
ALARMS = [NAME + "-failed", NAME + "-not-run"]
INPUT = '{"dryRun":false}'
H_SHAPE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00Z$")
SESSION_SCHEDULE = re.compile(r"^munaxa-nonprod-session-cleanup-[ps]-\d{8}t\d{4}$")
RETRYABLE = ("PY_TIMEOUT", "AWS_ThrottlingException", "AWS_InternalServerException")


def utc(text):
    return datetime.datetime.strptime(text, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=datetime.timezone.utc)


def as_utc(value):
    """A boto3 timestamp (datetime) or an ISO string, as an aware UTC datetime; None if neither."""
    if isinstance(value, datetime.datetime):
        return value if value.tzinfo else value.replace(tzinfo=datetime.timezone.utc)
    if isinstance(value, str):
        try:
            return datetime.datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    return None


def own_names():
    """The P and S names this session's HARD_STOP_UTC gives, or none."""
    if not H_SHAPE.match(HARD_STOP_UTC):
        return []
    h = utc(HARD_STOP_UTC)
    return [NAME + "-p-" + h.strftime("%Y%m%dt%H%M"), NAME + "-s-" + (h + datetime.timedelta(minutes=30)).strftime("%Y%m%dt%H%M")]


async def session_schedules():
    """Every one-time P or S schedule armed by this script and not yet fired (they delete themselves)."""
    names, token = [], None
    for _ in range(10):
        params = {"NamePrefix": NAME + "-", "MaxResults": 100}
        if token:
            params["NextToken"] = token
        r = await aws("scheduler", "ListSchedules", params)
        found = r.get("Schedules")
        if not isinstance(found, list):
            raise ValueError("shape")
        names += [str(x.get("Name")) for x in found if isinstance(x, dict) and SESSION_SCHEDULE.match(str(x.get("Name")))]
        token = r.get("NextToken")
        if not token:
            return sorted(set(names))
    raise ValueError("too-many-pages")


def same_input(text):
    try:
        return json.loads(text) == {"dryRun": False}
    except Exception:
        return False


async def gate():
    checks, now = {}, datetime.datetime.now(datetime.timezone.utc)
    try:
        sm = await aws("stepfunctions", "DescribeStateMachine", {"stateMachineArn": SM_ARN})
        checks["state_machine_active"] = sm.get("status") == "ACTIVE" and sm.get("name") == NAME and sm.get("type") == "STANDARD"
    except Exception as e:
        checks["state_machine_active"] = False
        checks["state_machine_error"] = code_of(e)
    try:
        done = await aws("stepfunctions", "ListExecutions", {"stateMachineArn": SM_ARN, "statusFilter": "SUCCEEDED", "maxResults": 1})
        last = (done.get("executions") or [None])[0]
        stopped = as_utc(last.get("stopDate")) if isinstance(last, dict) else None
        checks["succeeded_within_26h"] = stopped is not None and now - stopped <= datetime.timedelta(hours=26)
        # A dry run proves nothing about the delete permissions: the last success must be a real run
        # (review finding C-8).
        real = False
        if checks["succeeded_within_26h"]:
            x = await aws("stepfunctions", "DescribeExecution", {"executionArn": str(last.get("executionArn"))})
            real = same_input(x.get("input", ""))
        checks["last_success_was_real"] = real
        running = await aws("stepfunctions", "ListExecutions", {"stateMachineArn": SM_ARN, "statusFilter": "RUNNING", "maxResults": 10})
        checks["none_running"] = isinstance(running.get("executions"), list) and len(running["executions"]) == 0
    except Exception as e:
        checks["succeeded_within_26h"] = checks.get("succeeded_within_26h", False)
        checks["last_success_was_real"] = checks.get("last_success_was_real", False)
        checks["none_running"] = False
        checks["executions_error"] = code_of(e)
    try:
        r = await aws("scheduler", "GetSchedule", {"Name": DAILY})
        target = r.get("Target") or {}
        checks["daily_enabled"] = (r.get("State") == "ENABLED" and target.get("Arn") == SM_ARN
                                   and target.get("RoleArn") == ROLE_ARN and same_input(target.get("Input", "")))
    except Exception as e:
        checks["daily_enabled"] = False
        checks["daily_error"] = code_of(e)
    try:
        a = await aws("cloudwatch", "DescribeAlarms", {"AlarmNames": ALARMS})
        found = {str(x.get("AlarmName")): x.get("StateValue") for x in a.get("MetricAlarms") or []}
        checks["alarms_present"] = sorted(found.keys()) == sorted(ALARMS)
        checks["alarms_not_in_alarm"] = checks["alarms_present"] and all(v != "ALARM" for v in found.values())
        checks["alarm_states"] = found
    except Exception as e:
        checks["alarms_present"] = checks["alarms_not_in_alarm"] = False
        checks["alarms_error"] = code_of(e)
    try:
        # A P or S schedule left from an earlier session could fire inside this one and delete its load
        # balancer and stop its tasks (review finding S-3). Only this session's own two are allowed.
        stale = [n for n in await session_schedules() if n not in own_names()]
        checks["no_stale_session_schedules"] = not stale
        checks["stale_session_schedules"] = stale
    except Exception as e:
        checks["no_stale_session_schedules"] = False
        checks["schedules_error"] = code_of(e)
    names = ["state_machine_active", "succeeded_within_26h", "last_success_was_real", "none_running", "daily_enabled",
             "alarms_present", "alarms_not_in_alarm", "no_stale_session_schedules"]
    return all(checks.get(n) is True for n in names), checks


async def arm_one(label, at):
    name = NAME + "-" + label + "-" + at.strftime("%Y%m%dt%H%M")
    expression = "at(" + at.strftime("%Y-%m-%dT%H:%M:%S") + ")"
    try:
        r = await aws("scheduler", "GetSchedule", {"Name": name})
        target = r.get("Target") or {}
        if (r.get("ScheduleExpression") == expression and target.get("Arn") == SM_ARN
                and target.get("RoleArn") == ROLE_ARN and same_input(target.get("Input", "")) and r.get("State") == "ENABLED"):
            return {"name": name, "at": expression, "status": "already-armed"}
        return {"name": name, "status": "conflict"}
    except Exception as e:
        if code_of(e) != "AWS_ResourceNotFoundException":
            return {"name": name, "status": "error", "code": "GET_" + code_of(e)}
    params = {
        "Name": name, "ScheduleExpression": expression, "ScheduleExpressionTimezone": "UTC",
        "FlexibleTimeWindow": {"Mode": "OFF"}, "State": "ENABLED", "ActionAfterCompletion": "DELETE",
        "Description": "Testing cleanup " + label.upper() + " for the session ending " + HARD_STOP_UTC + " (deletes itself)",
        "Target": {"Arn": SM_ARN, "RoleArn": ROLE_ARN, "Input": INPUT,
                   "RetryPolicy": {"MaximumEventAgeInSeconds": 3600, "MaximumRetryAttempts": 3}},
        "ClientToken": name,
    }
    for attempt in (1, 2):
        try:
            await aws("scheduler", "CreateSchedule", params)
            return {"name": name, "at": expression, "status": "armed"}
        except Exception as e:
            code = code_of(e)
            if attempt == 1 and code in RETRYABLE:
                continue
            return {"name": name, "status": "error", "code": "CREATE_" + code}
    return {"name": name, "status": "error", "code": "RETRIES"}


def crosses_backstop(now, s_time):
    """True when the backstop (21:00 UTC) or the daily cleanup R (21:05 UTC) falls between now and S:
    R would delete the session's load balancer mid-session (review finding C-8)."""
    for days in (0, 1):
        t = (now + datetime.timedelta(days=days)).replace(hour=21, minute=0, second=0, microsecond=0)
        if now <= t + datetime.timedelta(minutes=10) and t <= s_time:
            return True
    return False


async def disarm():
    """After `down` is verified only: delete every leftover P and S schedule (exact pattern, nothing else)."""
    try:
        names = await session_schedules()
    except Exception as e:
        return {"result": "FAIL", "code": "LIST_" + code_of(e)}
    out = []
    for name in names:
        try:
            await aws("scheduler", "DeleteSchedule", {"Name": name, "ClientToken": "disarm-" + name[-22:]})
            out.append({"name": name, "status": "deleted"})
        except Exception as e:
            code = code_of(e)
            out.append({"name": name, "status": "absent" if code == "AWS_ResourceNotFoundException" else "error", "code": code})
    ok = all(x["status"] in ("deleted", "absent") for x in out)
    return {"result": "DISARMED" if ok else "FAIL", "schedules": out}


async def h20():
    if MODE not in ("gate", "arm", "disarm"):
        return {"result": "ABORT", "code": "UNKNOWN_MODE"}
    if HARD_STOP_UTC and not H_SHAPE.match(HARD_STOP_UTC):
        return {"result": "ABORT", "code": "HARD_STOP_SHAPE"}
    if MODE == "arm":
        if not H_SHAPE.match(HARD_STOP_UTC):
            return {"result": "ABORT", "code": "HARD_STOP_SHAPE"}
        h = utc(HARD_STOP_UTC)
        now = datetime.datetime.now(datetime.timezone.utc)
        if not now + datetime.timedelta(minutes=60) <= h <= now + datetime.timedelta(hours=6):
            return {"result": "ABORT", "code": "HARD_STOP_NOT_IN_1_TO_6_HOURS"}
        if crosses_backstop(now, h + datetime.timedelta(minutes=30)):
            return {"result": "ABORT", "code": "SESSION_CROSSES_21_UTC"}
    problem = await this_account()
    if problem:
        return {"result": "ABORT", "code": problem}
    if MODE == "disarm":
        return await disarm()
    ok, checks = await gate()
    if MODE == "gate" or not ok:
        return {"result": ("PASS" if ok else "FAIL") if MODE == "gate" else "ABORT", "code": "" if ok else "GATE_FAILED", "checks": checks}
    p = await arm_one("p", h)
    s = await arm_one("s", h + datetime.timedelta(minutes=30))
    armed = all(x["status"] in ("armed", "already-armed") for x in (p, s))
    return {"result": "ARMED" if armed else "FAIL", "p": p, "s": s, "checks": checks,
            "next": "" if armed else "fix the named schedule, then run arm again (idempotent); never `up` unarmed"}


try:
    result = await h20()
except Exception as e:  # fail closed with a code only, never a message or a traceback
    result = {"result": "FAIL", "code": "UNEXPECTED_" + code_of(e)}
result
