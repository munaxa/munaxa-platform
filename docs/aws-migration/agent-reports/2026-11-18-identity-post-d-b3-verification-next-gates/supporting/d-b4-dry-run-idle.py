# D-B4  Testing session cleanup: the idle DRY RUN (owner decision D-B4, file 06 §5.1 of the
# 2026-11-15-identity-stage-e-owner-decisions report).
#
# Report: docs/aws-migration/agent-reports/2026-11-18-identity-post-d-b3-verification-next-gates/ (file 06).
# Run through the AWS connector (root, account 229251310592, eu-central-1), each mode only when the
# owner has approved that step in the thread:
#
#   MODE "precheck"  read-only. PASS only if: the state machine exists, is ACTIVE and STANDARD, and its
#                    live definition still starts with the CheckInput choice that refuses any input but
#                    a boolean dryRun; no execution is RUNNING; no ECS service and no task in cluster
#                    munaxa-nonprod; no load balancer named munaxa-nonprod; the database is stopped; the
#                    time is 00:00-20:39 UTC, i.e. before the 21:00 backstop and R at 21:05 (a dry run
#                    after R would become the latest success and fail H-20 until the next R; R's retry
#                    window can also start R as late as 22:05). Returns the definition's
#                    revision and length; Claude separately compares the definition text with the
#                    reviewed template before asking for the start.
#   MODE "start"     the precheck, then ONE states:StartExecution named dry-run-idle-<UTC yyyymmddThhmm>
#                    with input exactly {"dryRun": true}, and returns its ARN at once (no polling, so
#                    the connector's ~60 s limit can never lose the ARN; review L-9). Then run status.
#                    The name is fixed per minute, so a retry inside that minute cannot start a second
#                    execution (Step Functions refuses a reused name with other input, and returns the
#                    same execution for the same input).
#   MODE "status"    read-only, for EXECUTION_ARN: status, start and stop time, the per-branch statuses
#                    of the output, and the history's TaskScheduled operations. PASS only if SUCCEEDED,
#                    the output says dryRun true, the four branches are secret absent, alb absent,
#                    ecs done, database stopped, and no write operation (deleteSecret,
#                    deleteLoadBalancer, updateService, stopTask, stopDBInstance) was scheduled.
#
# Never: a real run ({"dryRun": false}), StopExecution, any schedule, alarm or resource change, any
# secret value. Returns names, times, statuses and codes only.
# Checked by sandbox_harness.py and tested against a fake AWS (test_next_gate_connector_scripts.py). NOT RUN.

MODE = "precheck"  # INPUT: precheck | start | status
EXECUTION_ARN = ""  # INPUT: status only, the executionArn that start returned

# --- shared helpers v2 (identical in every connector script) ---
# Sandbox rules (sandbox_harness.py check_source): no import, no dunder name, no getattr/hasattr/type,
# no print; only the pre-imported names; the last statement is the bare expression `result`.
REGION = "eu-central-1"
ACCOUNT = "229251310592"


def code_of(e):
    """An error CODE only. Never str(e) or a message: AWS and botocore messages can echo values.
    The live sandbox has no `ClientError` name (observed 18 Nov 2026: NameError), so an AWS error is
    recognised by its botocore `.response`, never by isinstance(e, ClientError)."""
    if isinstance(e, asyncio.TimeoutError):
        return "PY_TIMEOUT"
    try:
        aws_code = e.response["Error"]["Code"]
    except Exception:
        aws_code = None
    if aws_code is not None:
        return "AWS_" + re.sub(r"[^A-Za-z0-9.]", "", str(aws_code))[:64]
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
EXEC_PREFIX = "arn:aws:states:" + REGION + ":" + ACCOUNT + ":execution:" + NAME + ":dry-run-idle-"
CLUSTER = "munaxa-nonprod"
DB = "munaxa-nonprod-pg"
ALB = "munaxa-nonprod"
DRY = '{"dryRun":true}'
WRITES = ("deleteSecret", "deleteLoadBalancer", "updateService", "stopTask", "stopDBInstance")
EXPECTED = {"secret": "absent", "alb": "absent", "ecs": "done", "database": "stopped"}


def refuses_bad_input(definition):
    """The live definition still begins with the reviewed input check (CheckInput -> BadInput)."""
    try:
        d = json.loads(definition)
        c = d["States"]["CheckInput"]
        rule = c["Choices"][1]["And"]
        return (d.get("StartAt") == "CheckInput" and c.get("Type") == "Choice" and c.get("Default") == "BadInput"
                and c["Choices"][0] == {"Variable": "$.dryRun", "IsPresent": False, "Next": "BadInput"}
                and {"Variable": "$.dryRun", "IsBoolean": True} in rule and d["States"]["BadInput"].get("Type") == "Fail")
    except Exception:
        return False


async def precheck(now):
    checks = {}
    try:
        sm = await aws("stepfunctions", "DescribeStateMachine", {"stateMachineArn": SM_ARN})
        checks["state_machine_active"] = sm.get("status") == "ACTIVE" and sm.get("name") == NAME and sm.get("type") == "STANDARD"
        checks["definition_refuses_bad_input"] = refuses_bad_input(str(sm.get("definition", "")))
        checks["definition_length"] = len(str(sm.get("definition", "")))
        checks["revision_id"] = str(sm.get("revisionId", ""))
    except Exception as e:
        checks["state_machine_active"] = checks["definition_refuses_bad_input"] = False
        checks["state_machine_error"] = code_of(e)
    try:
        running = await aws("stepfunctions", "ListExecutions", {"stateMachineArn": SM_ARN, "statusFilter": "RUNNING", "maxResults": 10})
        checks["none_running"] = isinstance(running.get("executions"), list) and len(running["executions"]) == 0
    except Exception as e:
        checks["none_running"] = False
        checks["executions_error"] = code_of(e)
    try:
        s = await aws("ecs", "ListServices", {"cluster": CLUSTER, "maxResults": 100})
        t = await aws("ecs", "ListTasks", {"cluster": CLUSTER, "maxResults": 100})
        checks["ecs_services"] = len(s.get("serviceArns") or [])
        checks["ecs_tasks"] = len(t.get("taskArns") or [])
        checks["ecs_idle"] = isinstance(s.get("serviceArns"), list) and isinstance(t.get("taskArns"), list) and checks["ecs_services"] == 0 and checks["ecs_tasks"] == 0 and not s.get("nextToken") and not t.get("nextToken")
    except Exception as e:
        checks["ecs_idle"] = False
        checks["ecs_error"] = code_of(e)
    try:
        await aws("elbv2", "DescribeLoadBalancers", {"Names": [ALB]})
        checks["no_session_alb"] = False
    except Exception as e:
        checks["no_session_alb"] = code_of(e) == "AWS_LoadBalancerNotFound"
        if not checks["no_session_alb"]:
            checks["alb_error"] = code_of(e)
    try:
        r = await aws("rds", "DescribeDBInstances", {"DBInstanceIdentifier": DB})
        status = [str(x.get("DBInstanceStatus")) for x in r.get("DBInstances") or []]
        checks["database_status"] = status
        checks["database_stopped"] = status == ["stopped"]
    except Exception as e:
        checks["database_stopped"] = False
        checks["database_error"] = code_of(e)
    minutes = now.hour * 60 + now.minute
    checks["before_backstop_and_r"] = minutes <= 20 * 60 + 39
    names = ["state_machine_active", "definition_refuses_bad_input", "none_running", "ecs_idle", "no_session_alb",
             "database_stopped", "before_backstop_and_r"]
    return all(checks.get(n) is True for n in names), checks


def branch_statuses(output):
    try:
        out = json.loads(output)
        return out.get("dryRun"), {str(r.get("component")): str(r.get("status")) for r in out.get("results") or [] if isinstance(r, dict)}
    except Exception:
        return None, {}


async def status(arn):
    if not arn.startswith(EXEC_PREFIX):
        return {"result": "ABORT", "code": "NOT_A_DRY_RUN_EXECUTION_ARN"}
    x = await aws("stepfunctions", "DescribeExecution", {"executionArn": arn})
    out = {"execution": arn, "status": x.get("status"), "start": str(x.get("startDate")), "stop": str(x.get("stopDate")),
           "input_is_dry_run": json.loads(x.get("input") or "null") == {"dryRun": True}}
    if x.get("status") == "RUNNING":
        out["result"] = "RUNNING"
        return out
    dry, comps = branch_statuses(x.get("output") or "")
    out["output_dry_run"], out["branches"] = dry, comps
    scheduled, token = [], None
    for _ in range(10):
        params = {"executionArn": arn, "maxResults": 1000, "includeExecutionData": False}
        if token:
            params["nextToken"] = token
        h = await aws("stepfunctions", "GetExecutionHistory", params)
        for ev in h.get("events") or []:
            d = ev.get("taskScheduledEventDetails") if isinstance(ev, dict) else None
            if isinstance(d, dict):
                scheduled.append(str(d.get("resourceType", "")) + ":" + str(d.get("resource", "")))
        token = h.get("nextToken")
        if not token:
            break
    else:
        out["result"] = "FAIL"
        out["code"] = "HISTORY_TOO_LONG"
        return out
    out["scheduled_operations"] = sorted(set(scheduled))
    writes = [s for s in scheduled if s.split(":")[-1] in WRITES]
    out["write_operations"] = sorted(set(writes))
    ok = (x.get("status") == "SUCCEEDED" and out["input_is_dry_run"] and dry is True and comps == EXPECTED and not writes)
    out["result"] = "PASS" if ok else "FAIL"
    return out


async def d_b4():
    if MODE not in ("precheck", "start", "status"):
        return {"result": "ABORT", "code": "UNKNOWN_MODE"}
    problem = await this_account()
    if problem:
        return {"result": "ABORT", "code": problem}
    if MODE == "status":
        return await status(EXECUTION_ARN)
    now = datetime.datetime.now(datetime.timezone.utc)
    ok, checks = await precheck(now)
    if MODE == "precheck":
        return {"result": "PASS" if ok else "FAIL", "checks": checks}
    if not ok:
        return {"result": "ABORT", "code": "PRECHECK_FAILED", "checks": checks}
    name = "dry-run-idle-" + now.strftime("%Y%m%dT%H%M")
    try:
        r = await aws("stepfunctions", "StartExecution", {"stateMachineArn": SM_ARN, "name": name, "input": DRY})
    except Exception as e:
        return {"result": "FAIL", "code": "START_" + code_of(e), "next": "run precheck, then status for any execution it lists"}
    return {"result": "STARTED", "execution": str(r.get("executionArn", "")), "started": str(r.get("startDate")),
            "input": DRY, "checks": checks, "next": "run status with EXECUTION_ARN set to execution (it is read-only)"}


try:
    result = await d_b4()
except Exception as e:  # fail closed with a code only
    result = {"result": "FAIL", "code": "UNEXPECTED_" + code_of(e)}
result
