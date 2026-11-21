"""Offline tests for the Testing RDS restart stop (rds-restart-stop.tf, report
2026-11-21-autonomous-security-and-testing-readiness file 06). The state machine runs in the strict
ASL subset interpreter of ../session-cleanup/asl_simulator.py against a fake AWS: no network, no
AWS account. What it cannot prove (the SDK integration's real field and error names for
scheduler:listSchedules and secretsmanager:describeSecret, IAM, EventBridge delivery) is listed as
unverified in the report.

    python3 -I -m unittest discover -s infra/aws/stack/rds-restart-stop -p 'test_*.py' -v
"""

import copy
import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "session-cleanup"))

from asl_simulator import Simulator, StatesError, load_definition  # noqa: E402

DB = "munaxa-nonprod-pg"
CLUSTER = "munaxa-nonprod"
CLEANUP = "munaxa-nonprod-session-cleanup"
MASTER = "arn:aws:secretsmanager:eu-central-1:229251310592:secret:rds!db-c3ef5041-mock"
WAIT = 7200
VALUES = {"wait_seconds": str(WAIT), "db_identifier": DB, "cluster": CLUSTER, "cleanup_name": CLEANUP,
          "master_secret_arn": MASTER}

# Exactly what rds-restart-stop.tf allows (tests/rds-restart-stop.tftest.hcl checks the policy).
ALLOWED = {("rds", "describeDBInstances"), ("rds", "stopDBInstance"), ("ecs", "listTasks"),
           ("scheduler", "listSchedules"), ("secretsmanager", "describeSecret")}


class FakeAws:
    def __init__(self):
        self.statuses = ["available"]  # successive DescribeDBInstances answers (last one repeats)
        self.tasks = []
        self.p = []
        self.s = []
        self.fail = {}  # (service, action) -> list of error names or None, one per call
        self.mangle = {}  # (service, action) -> function(response) -> response
        self.stopped = 0

    def call(self, service, action, params):
        key = (service, action)
        if key not in ALLOWED:
            raise AssertionError(f"not allowed: {key}")
        plan = self.fail.get(key)
        if plan:
            error = plan.pop(0)
            if error:
                raise StatesError(error, "fake")
        response = self._answer(service, action, params)
        if key in self.mangle:
            response = self.mangle[key](copy.deepcopy(response))
        return response

    def _answer(self, service, action, params):
        if action == "describeDBInstances":
            assert params == {"DbInstanceIdentifier": DB}, params
            status = self.statuses.pop(0) if len(self.statuses) > 1 else self.statuses[0]
            return {"DbInstances": [{"DbInstanceIdentifier": DB, "DbInstanceStatus": status}]}
        if action == "listTasks":
            assert params == {"Cluster": CLUSTER, "DesiredStatus": "RUNNING", "MaxResults": 1}, params
            return {"TaskArns": self.tasks[:1]}
        if action == "listSchedules":
            prefix = params["NamePrefix"]
            assert prefix in (CLEANUP + "-p-", CLEANUP + "-s-") and params["MaxResults"] == 1, params
            names = self.p if prefix.endswith("-p-") else self.s
            return {"Schedules": [{"Name": n, "State": "ENABLED"} for n in names[:1]]}
        if action == "describeSecret":
            assert params == {"SecretId": MASTER}, params
            return {"Name": "rds!db-mock", "LastRotatedDate": "2026-11-28T11:00:01Z", "RotationEnabled": True}
        if action == "stopDBInstance":
            assert params == {"DbInstanceIdentifier": DB}, params
            self.stopped += 1
            return {"DbInstance": {"DbInstanceStatus": "stopping"}}
        raise AssertionError(action)


def run(aws):
    sim = Simulator(load_definition(os.path.join(HERE, "definition.asl.json"), VALUES), aws)
    result = sim.run({"version": "0", "detail": {"EventID": "RDS-EVENT-0154"}})
    return result, sim


def stop_calls(sim):
    return [c for c in sim.calls if c[1] == "stopDBInstance"]


class Shape(unittest.TestCase):
    def test_definition_is_bounded_and_reads_no_value(self):
        d = load_definition(os.path.join(HERE, "definition.asl.json"), VALUES)
        self.assertEqual(d["StartAt"], "WaitForRotation")
        self.assertEqual(d["States"]["WaitForRotation"]["Seconds"], WAIT)
        self.assertLessEqual(d["TimeoutSeconds"], 6 * 3600)
        with open(os.path.join(HERE, "definition.asl.json"), encoding="utf-8") as handle:
            text = handle.read()
        for forbidden in ("getSecretValue", "batchGetSecretValue", "putSecretValue", "updateSecret",
                          "rotateSecret", "startDBInstance", "deleteDBInstance", "updateService", "stopTask"):
            self.assertNotIn(forbidden, text)
        resources = {s["Resource"] for s in d["States"].values() if s.get("Type") == "Task"}
        self.assertEqual({tuple(r.split("aws-sdk:")[1].split(":")) for r in resources}, ALLOWED)


class Scenarios(unittest.TestCase):
    def test_idle_auto_start_is_stopped_after_the_rotation_window(self):
        aws = FakeAws()
        result, sim = run(aws)
        self.assertEqual(result["status"], "SUCCEEDED", result)
        self.assertEqual(aws.stopped, 1)
        self.assertGreaterEqual(result["seconds"], WAIT)
        self.assertIn(("secretsmanager", "describeSecret", {"SecretId": MASTER}), sim.calls)

    def test_a_database_still_starting_is_waited_for(self):
        aws = FakeAws()
        aws.statuses = ["starting", "configuring-enhanced-monitoring", "available"]
        result, _ = run(aws)
        self.assertEqual(result["status"], "SUCCEEDED")
        self.assertEqual(aws.stopped, 1)
        self.assertGreaterEqual(result["seconds"], WAIT + 2 * 900)

    def test_a_database_that_never_settles_times_out_without_a_stop(self):
        aws = FakeAws()
        aws.statuses = ["modifying"]
        result, sim = run(aws)
        self.assertEqual(result["status"], "TIMED_OUT")
        self.assertEqual(stop_calls(sim), [])

    def test_a_running_task_means_a_session_and_nothing_is_stopped(self):
        aws = FakeAws()
        aws.tasks = ["arn:aws:ecs:eu-central-1:229251310592:task/munaxa-nonprod/abc"]
        result, sim = run(aws)
        self.assertEqual(result["status"], "SUCCEEDED")
        self.assertEqual(stop_calls(sim), [])

    def test_an_armed_p_or_s_schedule_means_a_session_and_nothing_is_stopped(self):
        for which in ("p", "s"):
            with self.subTest(schedule=which):
                aws = FakeAws()
                setattr(aws, which, [f"{CLEANUP}-{which}-20261128t1300"])
                result, sim = run(aws)
                self.assertEqual(result["status"], "SUCCEEDED")
                self.assertEqual(stop_calls(sim), [])

    def test_already_stopped_or_stopping_is_left_alone(self):
        for status in ("stopped", "stopping"):
            with self.subTest(status=status):
                aws = FakeAws()
                aws.statuses = [status]
                result, sim = run(aws)
                self.assertEqual(result["status"], "SUCCEEDED")
                self.assertEqual(stop_calls(sim), [])

    def test_a_state_change_under_the_stop_is_not_a_failure(self):
        aws = FakeAws()
        aws.fail[("rds", "stopDBInstance")] = ["Rds.InvalidDbInstanceStateException"]
        result, sim = run(aws)
        self.assertEqual(result["status"], "SUCCEEDED")
        self.assertEqual(len(stop_calls(sim)), 1)  # not retried

    def test_throttling_is_retried(self):
        aws = FakeAws()
        aws.fail[("ecs", "listTasks")] = ["Ecs.ThrottlingException", "Ecs.ThrottlingException"]
        result, _ = run(aws)
        self.assertEqual(result["status"], "SUCCEEDED")
        self.assertEqual(aws.stopped, 1)

    def test_a_rotation_read_failure_does_not_block_the_stop(self):
        aws = FakeAws()
        aws.fail[("secretsmanager", "describeSecret")] = ["SecretsManager.AccessDeniedException"] * 3
        result, _ = run(aws)
        self.assertEqual(result["status"], "SUCCEEDED")
        self.assertEqual(aws.stopped, 1)

    def test_every_guard_fails_closed(self):
        cases = {
            "tasks unreadable": lambda a: a.fail.update({("ecs", "listTasks"): ["Ecs.AccessDeniedException"] * 3}),
            "schedules unreadable": lambda a: a.fail.update({("scheduler", "listSchedules"): ["Scheduler.AccessDeniedException"] * 3}),
            "database unreadable": lambda a: a.fail.update({("rds", "describeDBInstances"): ["Rds.DbInstanceNotFoundException"]}),
            "no TaskArns": lambda a: a.mangle.update({("ecs", "listTasks"): lambda r: {}}),
            "no Schedules": lambda a: a.mangle.update({("scheduler", "listSchedules"): lambda r: {"NextToken": "x"}}),
            "another database": lambda a: a.mangle.update({("rds", "describeDBInstances"): lambda r: {"DbInstances": [{"DbInstanceIdentifier": "munaxa-prod-pg", "DbInstanceStatus": "available"}]}}),
            "two databases": lambda a: a.mangle.update({("rds", "describeDBInstances"): lambda r: {"DbInstances": r["DbInstances"] * 2}}),
            "no instances": lambda a: a.mangle.update({("rds", "describeDBInstances"): lambda r: {"DbInstances": []}}),
            "status not a string": lambda a: a.mangle.update({("rds", "describeDBInstances"): lambda r: {"DbInstances": [{"DbInstanceIdentifier": DB, "DbInstanceStatus": None}]}}),
            "stop denied": lambda a: a.fail.update({("rds", "stopDBInstance"): ["Rds.AccessDeniedException"] * 3}),
        }
        for name, mutate in cases.items():
            with self.subTest(case=name):
                aws = FakeAws()
                mutate(aws)
                result, sim = run(aws)
                self.assertEqual(result["status"], "FAILED", result)
                self.assertEqual(result["error"], "RestartStop.GuardFailed")
                if name != "stop denied":
                    self.assertEqual(stop_calls(sim), [])
                self.assertEqual(aws.stopped, 0)


if __name__ == "__main__":
    unittest.main()
