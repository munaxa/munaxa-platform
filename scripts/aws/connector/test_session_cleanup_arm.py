"""Fake-AWS tests for h20-session-cleanup-gate-and-arm.py (Stage E blocker BE-2). Offline only.

    python3 -I -m unittest discover -s scripts/aws/connector -p 'test_*.py'
"""

import asyncio
import copy
import datetime
import json
import os
import sys
import types
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import sandbox_harness as h  # noqa: E402

ACCOUNT = "229251310592"
NAME = "munaxa-nonprod-session-cleanup"
SM = f"arn:aws:states:eu-central-1:{ACCOUNT}:stateMachine:{NAME}"
ROLE = f"arn:aws:iam::{ACCOUNT}:role/munaxa-shared/munaxa-nonprod-session-backstop"

with open(os.path.join(HERE, "h20-session-cleanup-gate-and-arm.py"), encoding="utf-8") as f:
    SCRIPT = f.read()


class FixedDT(datetime.datetime):
    """The clock the script sees: 10:00 UTC, well clear of the 21:00 backstop unless a test moves it."""
    at = None

    @classmethod
    def now(cls, tz=None):
        return cls.at


FixedDT.at = FixedDT(2026, 11, 20, 10, 0, 0, tzinfo=datetime.timezone.utc)
CLOCK = types.SimpleNamespace(datetime=FixedDT, timedelta=datetime.timedelta, timezone=datetime.timezone)


def now():
    return FixedDT.now(datetime.timezone.utc)


def hard_stop(hours=2):
    return (now() + datetime.timedelta(hours=hours)).replace(second=0, microsecond=0).strftime("%Y-%m-%dT%H:%M:%SZ")


class Fake:
    def __init__(self):
        self.account = ACCOUNT
        self.sm = {"stateMachineArn": SM, "name": NAME, "status": "ACTIVE", "type": "STANDARD"}
        self.succeeded = [{"executionArn": "x", "status": "SUCCEEDED", "stopDate": now() - datetime.timedelta(hours=3)}]
        self.inputs = {"x": '{"dryRun": false}'}
        self.running = []
        self.schedules = {NAME + "-daily": {"State": "ENABLED", "ScheduleExpression": "cron(5 21 * * ? *)",
                                            "Target": {"Arn": SM, "RoleArn": ROLE, "Input": '{"dryRun": false}'}}}
        self.alarms = {NAME + "-failed": "OK", NAME + "-not-run": "OK"}
        self.calls, self.faults = [], {}

    def ops(self, name):
        return [p for o, p in self.calls if o == name]

    async def __call__(self, *, service_name, operation_name, region_name=None, params=None):
        assert region_name == "eu-central-1"
        self.calls.append((operation_name, copy.deepcopy(params)))
        pending = self.faults.get(operation_name)
        f = pending.pop(0) if pending else None
        if f == "timeout-after":
            out = getattr(self, "op_" + operation_name)(params)
            raise asyncio.TimeoutError()
        if f == "timeout":
            raise asyncio.TimeoutError()
        if f is not None:
            raise h.ClientError(f, json.dumps(params, default=str), operation_name)
        return getattr(self, "op_" + operation_name)(params)

    def op_GetCallerIdentity(self, p):
        return {"Account": self.account}

    def op_DescribeStateMachine(self, p):
        if self.sm is None:
            raise h.ClientError("StateMachineDoesNotExist", "", "DescribeStateMachine")
        return dict(self.sm)

    def op_ListExecutions(self, p):
        return {"executions": list(self.succeeded if p["statusFilter"] == "SUCCEEDED" else self.running)[: p["maxResults"]]}

    def op_GetSchedule(self, p):
        if p["Name"] not in self.schedules:
            raise h.ClientError("ResourceNotFoundException", "", "GetSchedule")
        return copy.deepcopy(self.schedules[p["Name"]])

    def op_CreateSchedule(self, p):
        existing = self.schedules.get(p["Name"])
        if existing is not None:
            if existing.get("ClientToken") == p["ClientToken"]:
                return {"ScheduleArn": "x"}
            raise h.ClientError("ConflictException", "", "CreateSchedule")
        self.schedules[p["Name"]] = copy.deepcopy(p)
        return {"ScheduleArn": "x"}

    def op_DescribeExecution(self, p):
        return {"executionArn": p["executionArn"], "input": self.inputs.get(p["executionArn"], "{}")}

    def op_ListSchedules(self, p):
        assert p["NamePrefix"] == NAME + "-"
        return {"Schedules": [{"Name": n, "State": v.get("State")} for n, v in sorted(self.schedules.items()) if n.startswith(p["NamePrefix"])]}

    def op_DeleteSchedule(self, p):
        if p["Name"] not in self.schedules:
            raise h.ClientError("ResourceNotFoundException", "", "DeleteSchedule")
        del self.schedules[p["Name"]]
        return {}

    def op_DescribeAlarms(self, p):
        return {"MetricAlarms": [{"AlarmName": n, "StateValue": s} for n, s in self.alarms.items() if n in p["AlarmNames"]]}


def run(fake, **inputs):
    return h.run_script(h.set_inputs(SCRIPT, **inputs) if inputs else SCRIPT, fake, overrides={"datetime": CLOCK})


class Gate(unittest.TestCase):
    def test_rules_and_shared_helpers(self):
        self.assertEqual(h.check_source(SCRIPT), [])
        with open(os.path.join(HERE, "c16-delete-bootstrap-secret.py"), encoding="utf-8") as f:
            self.assertEqual(h.shared_block(SCRIPT), h.shared_block(f.read()))

    def test_a_healthy_cleanup_passes_and_nothing_is_written(self):
        fake = Fake()
        r = run(fake)
        self.assertEqual(r["result"], "PASS")
        self.assertEqual(fake.ops("CreateSchedule"), [])

    def test_every_unhealthy_state_fails(self):
        cases = {
            "state_machine_active": lambda f: setattr(f, "sm", None),
            "succeeded_within_26h": lambda f: setattr(f, "succeeded", [{"stopDate": now() - datetime.timedelta(hours=30)}]),
            "none_running": lambda f: setattr(f, "running", [{"executionArn": "y", "status": "RUNNING"}]),
            "daily_enabled": lambda f: f.schedules[NAME + "-daily"].update(State="DISABLED"),
            "alarms_not_in_alarm": lambda f: f.alarms.update({NAME + "-not-run": "ALARM"}),
            "alarms_present": lambda f: f.alarms.pop(NAME + "-failed"),
            "last_success_was_real": lambda f: f.inputs.update(x='{"dryRun": true}'),
            "no_stale_session_schedules": lambda f: f.schedules.update({NAME + "-p-20261120t1100": {"State": "ENABLED"}}),
        }
        for check, change in cases.items():
            with self.subTest(check=check):
                fake = Fake()
                change(fake)
                r = run(fake)
                self.assertEqual(r["result"], "FAIL")
                self.assertFalse(r["checks"][check])

    def test_never_succeeded_and_a_dry_run_daily_target_fail(self):
        fake = Fake()
        fake.succeeded = []
        self.assertFalse(run(fake)["checks"]["succeeded_within_26h"])
        fake = Fake()
        fake.schedules[NAME + "-daily"]["Target"]["Input"] = '{"dryRun": true}'
        self.assertFalse(run(fake)["checks"]["daily_enabled"])

    def test_a_denied_read_fails_closed(self):
        fake = Fake()
        fake.faults["DescribeAlarms"] = ["AccessDenied"]
        r = run(fake)
        self.assertEqual(r["result"], "FAIL")
        self.assertEqual(r["checks"]["alarms_error"], "AWS_AccessDenied")


    def test_a_leftover_schedule_of_an_earlier_session_is_named(self):
        fake = Fake()
        fake.schedules[NAME + "-s-20261120t1130"] = {"State": "ENABLED"}
        fake.schedules["munaxa-nonprod-session-cleanup-other"] = {"State": "ENABLED"}
        r = run(fake)
        self.assertEqual(r["result"], "FAIL")
        self.assertEqual(r["checks"]["stale_session_schedules"], [NAME + "-s-20261120t1130"])

    def test_this_sessions_own_schedules_pass_the_gate_once_armed(self):
        fake = Fake()
        h_text = hard_stop()
        self.assertEqual(run(fake, MODE="arm", HARD_STOP_UTC=h_text)["result"], "ARMED")
        self.assertEqual(run(fake, HARD_STOP_UTC=h_text)["result"], "PASS")
        self.assertEqual(run(fake)["result"], "FAIL")


class Disarm(unittest.TestCase):
    def test_disarm_deletes_only_session_schedules(self):
        fake = Fake()
        h_text = hard_stop()
        run(fake, MODE="arm", HARD_STOP_UTC=h_text)
        fake.schedules["munaxa-nonprod-session-cleanup-other"] = {"State": "ENABLED"}
        r = run(fake, MODE="disarm")
        self.assertEqual(r["result"], "DISARMED")
        self.assertEqual(sorted(fake.schedules), sorted([NAME + "-daily", "munaxa-nonprod-session-cleanup-other"]))
        self.assertEqual(run(fake, MODE="disarm")["schedules"], [])

    def test_a_denied_delete_fails(self):
        fake = Fake()
        run(fake, MODE="arm", HARD_STOP_UTC=hard_stop())
        fake.faults["DeleteSchedule"] = ["AccessDeniedException"]
        r = run(fake, MODE="disarm")
        self.assertEqual(r["result"], "FAIL")


class Arm(unittest.TestCase):
    def test_arms_p_at_h_and_s_thirty_minutes_later(self):
        fake = Fake()
        h_text = hard_stop()
        r = run(fake, MODE="arm", HARD_STOP_UTC=h_text)
        self.assertEqual(r["result"], "ARMED")
        created = fake.ops("CreateSchedule")
        self.assertEqual(len(created), 2)
        h_time = datetime.datetime.strptime(h_text, "%Y-%m-%dT%H:%M:%SZ")
        expected = [h_time, h_time + datetime.timedelta(minutes=30)]
        for p, at in zip(created, expected):
            self.assertEqual(p["ScheduleExpression"], "at(" + at.strftime("%Y-%m-%dT%H:%M:%S") + ")")
            self.assertEqual((p["ScheduleExpressionTimezone"], p["ActionAfterCompletion"], p["State"]), ("UTC", "DELETE", "ENABLED"))
            self.assertEqual(p["Target"]["Arn"], SM)
            self.assertEqual(p["Target"]["RoleArn"], ROLE)
            self.assertEqual(json.loads(p["Target"]["Input"]), {"dryRun": False})
            self.assertEqual(p["ClientToken"], p["Name"])
            self.assertNotIn("—", p["Description"])
        self.assertTrue(created[0]["Name"].startswith(NAME + "-p-"))
        self.assertTrue(created[1]["Name"].startswith(NAME + "-s-"))

    def test_arming_twice_is_idempotent(self):
        fake = Fake()
        h_text = hard_stop()
        run(fake, MODE="arm", HARD_STOP_UTC=h_text)
        r = run(fake, MODE="arm", HARD_STOP_UTC=h_text)
        self.assertEqual(r["result"], "ARMED")
        self.assertEqual((r["p"]["status"], r["s"]["status"]), ("already-armed", "already-armed"))
        self.assertEqual(len(fake.ops("CreateSchedule")), 2)

    def test_a_timeout_after_create_is_retried_with_the_same_token(self):
        fake = Fake()
        fake.faults["CreateSchedule"] = ["timeout-after"]
        r = run(fake, MODE="arm", HARD_STOP_UTC=hard_stop())
        self.assertEqual(r["result"], "ARMED")
        created = fake.ops("CreateSchedule")
        self.assertEqual(len(created), 3)
        self.assertEqual(created[0]["ClientToken"], created[1]["ClientToken"])

    def test_a_partial_failure_is_reported_and_rerun_completes_it(self):
        fake = Fake()
        fake.faults["CreateSchedule"] = [None, "AccessDeniedException"]
        h_text = hard_stop()
        r = run(fake, MODE="arm", HARD_STOP_UTC=h_text)
        self.assertEqual((r["result"], r["p"]["status"], r["s"]["status"]), ("FAIL", "armed", "error"))
        self.assertEqual(r["s"]["code"], "CREATE_AWS_AccessDeniedException")
        r = run(fake, MODE="arm", HARD_STOP_UTC=h_text)
        self.assertEqual((r["result"], r["p"]["status"], r["s"]["status"]), ("ARMED", "already-armed", "armed"))

    def test_a_conflicting_schedule_of_that_name_aborts_without_change(self):
        fake = Fake()
        h_text = hard_stop()
        h_time = datetime.datetime.strptime(h_text, "%Y-%m-%dT%H:%M:%SZ")
        name = NAME + "-p-" + h_time.strftime("%Y%m%dt%H%M")
        fake.schedules[name] = {"State": "ENABLED", "ScheduleExpression": "at(2030-01-01T00:00:00)", "Target": {"Arn": "other"}}
        r = run(fake, MODE="arm", HARD_STOP_UTC=h_text)
        self.assertEqual((r["result"], r["p"]["status"]), ("FAIL", "conflict"))
        self.assertEqual(fake.schedules[name]["Target"], {"Arn": "other"})

    def test_owner_review_a10_a_same_named_schedule_that_keeps_itself_is_a_conflict(self):
        fake = Fake()
        h_text = hard_stop()
        first = run(fake, MODE="arm", HARD_STOP_UTC=h_text)
        self.assertEqual(first["result"], "ARMED")
        for name in list(fake.schedules):
            fake.schedules[name]["ActionAfterCompletion"] = "NONE"
        r = run(fake, MODE="arm", HARD_STOP_UTC=h_text)
        self.assertEqual((r["p"]["status"], r["s"]["status"]), ("conflict", "conflict"))

    def test_a_failed_gate_arms_nothing(self):
        fake = Fake()
        fake.running = [{"executionArn": "y"}]
        r = run(fake, MODE="arm", HARD_STOP_UTC=hard_stop())
        self.assertEqual((r["result"], r["code"]), ("ABORT", "GATE_FAILED"))
        self.assertEqual(fake.ops("CreateSchedule"), [])

    def test_the_hard_stop_must_be_well_formed_and_one_to_six_hours_ahead(self):
        for bad, code in (("", "HARD_STOP_SHAPE"), ("2026-11-20 15:00", "HARD_STOP_SHAPE"), ("2026-11-20T15:00:30Z", "HARD_STOP_SHAPE"),
                          (hard_stop(0.5), "HARD_STOP_NOT_IN_1_TO_6_HOURS"), (hard_stop(7), "HARD_STOP_NOT_IN_1_TO_6_HOURS"),
                          (hard_stop(-1), "HARD_STOP_NOT_IN_1_TO_6_HOURS")):
            with self.subTest(bad=bad):
                fake = Fake()
                self.assertEqual(run(fake, MODE="arm", HARD_STOP_UTC=bad)["code"], code)
                self.assertEqual(fake.calls, [])

    def test_a_session_that_would_cross_the_21_utc_backstop_is_refused(self):
        for hours in (6, 5):  # S at 16:30 is fine; at 10:00 + 6 h + 30 min still before 21:00
            self.assertEqual(run(Fake(), MODE="arm", HARD_STOP_UTC=hard_stop(hours))["result"], "ARMED")
        FixedDT.at = FixedDT(2026, 11, 20, 17, 0, 0, tzinfo=datetime.timezone.utc)
        try:
            for hours, code in ((3, "ARMED"), (4, "SESSION_CROSSES_21_UTC")):
                fake = Fake()
                r = run(fake, MODE="arm", HARD_STOP_UTC=hard_stop(hours))
                self.assertEqual(r.get("code", r["result"]) if r["result"] != "ARMED" else "ARMED", code)
        finally:
            FixedDT.at = FixedDT(2026, 11, 20, 10, 0, 0, tzinfo=datetime.timezone.utc)

    def test_the_wrong_account_and_an_unknown_mode_abort(self):
        fake = Fake()
        fake.account = "111111111111"
        self.assertEqual(run(fake, MODE="arm", HARD_STOP_UTC=hard_stop())["code"], "WRONG_ACCOUNT")
        self.assertEqual(run(Fake(), MODE="disable")["code"], "UNKNOWN_MODE")


if __name__ == "__main__":
    unittest.main()
