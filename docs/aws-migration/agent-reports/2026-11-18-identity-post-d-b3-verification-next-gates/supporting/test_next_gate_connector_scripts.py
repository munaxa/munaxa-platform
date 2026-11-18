"""Fake-AWS tests for the D-B5 and D-B4 connector scripts in this folder. Offline only, standard library.

    python3 -I -m unittest discover -s docs/aws-migration/agent-reports/2026-11-18-identity-post-d-b3-verification-next-gates/supporting -p 'test_*.py' -v

Uses scripts/aws/connector/sandbox_harness.py (the sandbox rules and a fake call_boto3).
"""

import copy
import datetime
import json
import os
import sys
import types
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", "..", "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "scripts", "aws", "connector"))
import sandbox_harness as h  # noqa: E402

ACCOUNT = "229251310592"
TOPIC = f"arn:aws:sns:eu-central-1:{ACCOUNT}:munaxa-nonprod-session-cleanup-alerts"
NAME = "munaxa-nonprod-session-cleanup"
SM = f"arn:aws:states:eu-central-1:{ACCOUNT}:stateMachine:{NAME}"


def read(name):
    with open(os.path.join(HERE, name), encoding="utf-8") as f:
        return f.read()


D_B5 = read("d-b5-alert-subscription.py")
D_B4 = read("d-b4-dry-run-idle.py")
ASL = read(os.path.join(ROOT, "infra", "aws", "stack", "session-cleanup", "definition.asl.json"))


class Base:
    def __init__(self):
        self.account = ACCOUNT
        self.calls, self.faults = [], {}

    def ops(self, name):
        return [p for o, p in self.calls if o == name]

    def writes(self):
        reads = ("Get", "List", "Describe")
        return [o for o, _ in self.calls if not o.startswith(reads)]

    async def __call__(self, *, service_name, operation_name, region_name=None, params=None):
        assert region_name == "eu-central-1"
        self.calls.append((operation_name, copy.deepcopy(params)))
        f = (self.faults.get(operation_name) or [None]).pop(0) if self.faults.get(operation_name) else None
        if f is not None:
            raise h.ClientError(f, json.dumps(params, default=str), operation_name)
        return getattr(self, "op_" + operation_name)(params)

    def op_GetCallerIdentity(self, p):
        return {"Account": self.account}


class FakeSns(Base):
    def __init__(self):
        super().__init__()
        self.subs = []  # (endpoint, arn or "PendingConfirmation", confirmed)
        self.policy = {"Statement": [{"Sid": "CloudWatchAlarmsOfThisAccount", "Effect": "Allow"},
                                     {"Sid": "TlsOnly", "Effect": "Deny"}]}

    def op_GetTopicAttributes(self, p):
        if p["TopicArn"] != TOPIC:
            raise h.ClientError("NotFound", "", "GetTopicAttributes")
        return {"Attributes": {"TopicArn": TOPIC, "Owner": ACCOUNT, "Policy": json.dumps(self.policy),
                               "SubscriptionsConfirmed": str(sum(1 for s in self.subs if s[2])),
                               "SubscriptionsPending": str(sum(1 for s in self.subs if not s[2])), "SubscriptionsDeleted": "0"}}

    def op_ListSubscriptionsByTopic(self, p):
        return {"Subscriptions": [{"Protocol": "email", "Endpoint": e, "TopicArn": TOPIC,
                                   "SubscriptionArn": a if c else "PendingConfirmation"} for e, a, c in self.subs]}

    def op_Subscribe(self, p):
        arn = TOPIC + ":0000-%d" % len(self.subs)
        self.subs.append((p["Endpoint"], arn, False))
        return {"SubscriptionArn": arn}

    def op_GetSubscriptionAttributes(self, p):
        for e, a, c in self.subs:
            if a == p["SubscriptionArn"]:
                return {"Attributes": {"TopicArn": TOPIC, "Protocol": "email", "PendingConfirmation": "false" if c else "true",
                                       "ConfirmationWasAuthenticated": "true"}}
        raise h.ClientError("NotFound", "", "GetSubscriptionAttributes")

    def confirm(self):
        self.subs = [(e, a, True) for e, a, c in self.subs]


def b5(fake, **inputs):
    return h.run_script(h.set_inputs(D_B5, **inputs), fake)


class DB5(unittest.TestCase):
    def test_sandbox_rules_and_shared_helpers(self):
        self.assertEqual(h.check_source(D_B5), [])
        for op in ("Publish", "Unsubscribe", "SetTopicAttributes", "SetSubscriptionAttributes", "ConfirmSubscription"):
            self.assertNotIn('"' + op + '"', D_B5)

    def test_precheck_reads_only_and_passes_on_a_fresh_topic(self):
        f = FakeSns()
        r = b5(f, MODE="precheck")
        self.assertEqual(r["result"], "PASS", r)
        self.assertEqual(f.writes(), [])

    def test_precheck_fails_without_the_tls_deny(self):
        f = FakeSns()
        f.policy = {"Statement": []}
        self.assertEqual(b5(f, MODE="precheck")["result"], "FAIL")

    def test_subscribe_makes_exactly_one_email_subscription(self):
        f = FakeSns()
        r = b5(f, MODE="subscribe")
        self.assertEqual(r["result"], "SUBSCRIBED_PENDING_CONFIRMATION", r)
        self.assertEqual(f.ops("Subscribe"), [{"TopicArn": TOPIC, "Protocol": "email", "Endpoint": "alert@munaxa.com", "ReturnSubscriptionArn": True}])
        self.assertEqual(f.writes(), ["Subscribe"])

    def test_subscribe_twice_never_makes_a_second(self):
        f = FakeSns()
        b5(f, MODE="subscribe")
        r = b5(f, MODE="subscribe")
        self.assertEqual(r["code"], "ALREADY_SUBSCRIBED_OR_PENDING")
        self.assertEqual(len(f.ops("Subscribe")), 1)

    def test_another_address_is_refused_before_any_call(self):
        f = FakeSns()
        r = b5(f, MODE="subscribe", ADDRESS="someone@example.com")
        self.assertEqual(r["code"], "ADDRESS_NOT_THE_APPROVED_ONE")
        self.assertEqual(f.calls, [])

    def test_verify_is_pending_until_aws_confirms(self):
        f = FakeSns()
        self.assertEqual(b5(f, MODE="verify")["result"], "ABSENT")
        b5(f, MODE="subscribe")
        self.assertEqual(b5(f, MODE="verify")["result"], "PENDING")
        f.confirm()
        r = b5(f, MODE="verify")
        self.assertEqual(r["result"], "CONFIRMED", r)
        self.assertEqual(f.writes(), ["Subscribe"])

    def test_wrong_account_and_denied_subscribe(self):
        f = FakeSns()
        f.account = "111111111111"
        self.assertEqual(b5(f, MODE="subscribe")["code"], "WRONG_ACCOUNT")
        f = FakeSns()
        f.faults["Subscribe"] = ["AuthorizationError"]
        r = b5(f, MODE="subscribe")
        self.assertEqual(r["code"], "SUBSCRIBE_AWS_AuthorizationError")
        self.assertNotIn("alert@munaxa.com", json.dumps(r).replace('"alert@munaxa.com"', ""))


def rendered_definition():
    values = {"cluster": "munaxa-nonprod", "services": json.dumps(["identity"]), "alb_name": "munaxa-nonprod",
              "alb_arn_pattern": "x", "vpc_id": "vpc-0", "db_identifier": "munaxa-nonprod-pg",
              "bootstrap_secret": "munaxa-nonprod/identity-bootstrap", "bootstrap_secret_arn_pattern": "x*"}
    text = ASL
    for k, v in values.items():
        text = text.replace("${" + k + "}", v)
    json.loads(text)
    return text


class FixedDT(datetime.datetime):
    at = None

    @classmethod
    def now(cls, tz=None):
        return cls.at


CLOCK = types.SimpleNamespace(datetime=FixedDT, timedelta=datetime.timedelta, timezone=datetime.timezone)


class FakeSfn(Base):
    def __init__(self):
        super().__init__()
        self.definition = rendered_definition()
        self.running, self.services, self.tasks, self.alb, self.db = [], [], [], False, "stopped"
        self.executions = {}
        self.history_resources = ["listSecrets", "describeLoadBalancers", "describeServices", "listTasks", "describeDBInstances"]
        self.output = {"dryRun": True, "results": [{"component": "secret", "status": "absent", "ok": True},
                                                   {"component": "alb", "status": "absent", "ok": True},
                                                   {"component": "ecs", "status": "done", "ok": True},
                                                   {"component": "database", "status": "stopped", "ok": True}]}

    def op_DescribeStateMachine(self, p):
        return {"stateMachineArn": SM, "name": NAME, "status": "ACTIVE", "type": "STANDARD", "definition": self.definition, "revisionId": "r1"}

    def op_ListExecutions(self, p):
        return {"executions": self.running}

    def op_ListServices(self, p):
        return {"serviceArns": self.services}

    def op_ListTasks(self, p):
        return {"taskArns": self.tasks}

    def op_DescribeLoadBalancers(self, p):
        if not self.alb:
            raise h.ClientError("LoadBalancerNotFound", "", "DescribeLoadBalancers")
        return {"LoadBalancers": [{"LoadBalancerName": "munaxa-nonprod"}]}

    def op_DescribeDBInstances(self, p):
        return {"DBInstances": [{"DBInstanceStatus": self.db}]}

    def op_StartExecution(self, p):
        arn = f"arn:aws:states:eu-central-1:{ACCOUNT}:execution:{NAME}:{p['name']}"
        self.executions[arn] = {"input": p["input"], "status": "SUCCEEDED"}
        return {"executionArn": arn, "startDate": "2026-11-19T10:00:00Z"}

    def op_DescribeExecution(self, p):
        x = self.executions[p["executionArn"]]
        return {"executionArn": p["executionArn"], "status": x["status"], "input": x["input"], "output": json.dumps(self.output),
                "startDate": "s", "stopDate": "t"}

    def op_GetExecutionHistory(self, p):
        return {"events": [{"type": "TaskScheduled", "taskScheduledEventDetails": {"resourceType": "aws-sdk:x", "resource": r}}
                           for r in self.history_resources]}


def b4(fake, at=(2026, 11, 19, 10, 0), **inputs):
    FixedDT.at = FixedDT(*at, tzinfo=datetime.timezone.utc)
    return h.run_script(h.set_inputs(D_B4, **inputs), fake, overrides={"datetime": CLOCK})


class DB4(unittest.TestCase):
    def test_sandbox_rules(self):
        self.assertEqual(h.check_source(D_B4), [])
        # The only execution input in the script is the dry-run constant.
        self.assertEqual(D_B4.count('"input": DRY'), 1)
        self.assertIn("DRY = '{\"dryRun\":true}'", D_B4)
        self.assertEqual(D_B4.count('"StartExecution"'), 1)
        self.assertNotIn('"StopExecution"', D_B4)

    def test_the_reviewed_definition_is_recognised(self):
        r = b4(FakeSfn(), MODE="precheck")
        self.assertEqual(r["result"], "PASS", r)

    def test_precheck_fails_on_every_unsafe_state(self):
        for change in ("running", "services", "tasks", "alb", "db", "definition"):
            f = FakeSfn()
            if change == "running":
                f.running = [{"name": "x"}]
            elif change == "services":
                f.services = ["arn:svc"]
            elif change == "tasks":
                f.tasks = ["arn:task"]
            elif change == "alb":
                f.alb = True
            elif change == "db":
                f.db = "available"
            else:
                f.definition = f.definition.replace('"Default": "BadInput"', '"Default": "Config"', 1)
            self.assertEqual(b4(f, MODE="precheck")["result"], "FAIL", change)
            self.assertEqual(b4(f, MODE="start")["code"], "PRECHECK_FAILED", change)
            self.assertEqual(f.ops("StartExecution"), [], change)

    def test_never_near_the_backstop_or_r(self):
        for hm in ((20, 40), (21, 0), (21, 5), (21, 30)):
            f = FakeSfn()
            self.assertEqual(b4(f, at=(2026, 11, 19) + hm, MODE="start")["code"], "PRECHECK_FAILED", hm)
            self.assertEqual(f.ops("StartExecution"), [])

    def test_start_is_one_dry_run_execution_and_passes(self):
        f = FakeSfn()
        r = b4(f, MODE="start")
        self.assertEqual(r["result"], "PASS", r)
        self.assertEqual(f.ops("StartExecution"), [{"stateMachineArn": SM, "name": "dry-run-idle-20261119T1000", "input": '{"dryRun":true}'}])
        self.assertEqual(f.writes(), ["StartExecution"])

    def test_status_fails_on_a_write_or_another_branch_status(self):
        f = FakeSfn()
        arn = b4(f, MODE="start")["execution"]
        f.history_resources.append("deleteLoadBalancer")
        r = b4(f, MODE="status", EXECUTION_ARN=arn)
        self.assertEqual((r["result"], r["write_operations"]), ("FAIL", ["aws-sdk:x:deleteLoadBalancer"]))
        f = FakeSfn()
        arn = b4(f, MODE="start")["execution"]
        f.output["results"][1]["status"] = "would-delete"
        self.assertEqual(b4(f, MODE="status", EXECUTION_ARN=arn)["result"], "FAIL")

    def test_status_refuses_other_executions(self):
        f = FakeSfn()
        r = b4(f, MODE="status", EXECUTION_ARN=f"arn:aws:states:eu-central-1:{ACCOUNT}:execution:{NAME}:real-run")
        self.assertEqual(r["code"], "NOT_A_DRY_RUN_EXECUTION_ARN")
        self.assertEqual(f.writes(), [])


if __name__ == "__main__":
    unittest.main()
