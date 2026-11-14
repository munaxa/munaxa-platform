"""Offline scenario tests for the Testing session cleanup state machine (Stage E blocker BE-2).

No network, no AWS account, no credentials: the definition runs in asl_simulator.py against
FakeAws below. Run with:

    python3 -I -m unittest discover -s infra/aws/stack/session-cleanup -p 'test_*.py' -v
"""

import copy
import json
import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from asl_simulator import Simulator, StatesError, load_definition  # noqa: E402

ACCOUNT = "229251310592"
REGION = "eu-central-1"
VPC = "vpc-0123456789abcdef0"
CLUSTER = "munaxa-nonprod"
BOOTSTRAP = "munaxa-nonprod/identity-bootstrap"
OPERATOR = "munaxa-nonprod/identity-operator"
SERVICES = ["identity", "control-api", "control-portal", "work-api", "work-admin", "school-api", "school-admin", "docs-api", "docs-web", "docs-scanner"]
ALB_ARN = f"arn:aws:elasticloadbalancing:{REGION}:{ACCOUNT}:loadbalancer/app/munaxa-nonprod/50dc6c495c0c9188"

# The values session-cleanup.tf passes to templatefile() for nonprod (the Terraform test checks the
# same names in the rendered definition).
TEMPLATE_VALUES = {
    "cluster": CLUSTER,
    "services": json.dumps(SERVICES),
    "alb_name": "munaxa-nonprod",
    "alb_arn_pattern": f"arn:aws:elasticloadbalancing:{REGION}:{ACCOUNT}:loadbalancer/app/munaxa-nonprod/*",
    "vpc_id": VPC,
    "db_identifier": "munaxa-nonprod-pg",
    "bootstrap_secret": BOOTSTRAP,
    "bootstrap_secret_arn_pattern": f"arn:aws:secretsmanager:{REGION}:{ACCOUNT}:secret:{BOOTSTRAP}-??????",
}

# The ten actions the role policy allows (session-cleanup.tf; tests/session-cleanup.tftest.hcl
# asserts the policy holds exactly these).
ALLOWED = {
    ("secretsmanager", "listSecrets"), ("secretsmanager", "deleteSecret"),
    ("elasticloadbalancingv2", "describeLoadBalancers"), ("elasticloadbalancingv2", "deleteLoadBalancer"),
    ("ecs", "describeServices"), ("ecs", "updateService"), ("ecs", "listTasks"), ("ecs", "stopTask"),
    ("rds", "describeDBInstances"), ("rds", "stopDBInstance"),
}
MUTATING = {("secretsmanager", "deleteSecret"), ("elasticloadbalancingv2", "deleteLoadBalancer"), ("ecs", "updateService"), ("ecs", "stopTask"), ("rds", "stopDBInstance")}


def definition():
    return load_definition(os.path.join(HERE, "definition.asl.json"), TEMPLATE_VALUES)


class FakeAws:
    """A tiny model of the nonprod account. `fail` maps (service, action) to a list of error names
    raised on successive calls (None = succeed that time)."""

    def __init__(self):
        self.secrets = {OPERATOR: {"Name": OPERATOR, "ARN": f"arn:aws:secretsmanager:{REGION}:{ACCOUNT}:secret:{OPERATOR}-AbCdEf"}}
        self.lbs = []
        self.services = {}
        self.tasks = []
        self.db = {"id": "munaxa-nonprod-pg", "status": "stopped", "sequence": []}
        self.fail = {}
        self.lb_delete_lingers = 0
        self.lb_more_pages = False
        self.other_lbs = [{"LoadBalancerName": "munaxa-docs-legacy", "LoadBalancerArn": f"arn:aws:elasticloadbalancing:{REGION}:{ACCOUNT}:loadbalancer/app/munaxa-docs-legacy/1",
                           "Type": "application", "Scheme": "internet-facing", "VpcId": "vpc-0bbbbbbbbbbbbbbbb"}]
        self.list_tasks_next_token = False

    # Builders --------------------------------------------------------------------------------
    def with_session(self):
        self.secrets[BOOTSTRAP] = {"Name": BOOTSTRAP, "ARN": f"arn:aws:secretsmanager:{REGION}:{ACCOUNT}:secret:{BOOTSTRAP}-XyZ123"}
        self.lbs = [{"LoadBalancerName": "munaxa-nonprod", "LoadBalancerArn": ALB_ARN, "Type": "application", "Scheme": "internet-facing", "VpcId": VPC}]
        self.services = {"identity": {"Status": "ACTIVE", "DesiredCount": 1}}
        self.tasks = [f"arn:aws:ecs:{REGION}:{ACCOUNT}:task/{CLUSTER}/aaaa", f"arn:aws:ecs:{REGION}:{ACCOUNT}:task/{CLUSTER}/bbbb"]
        self.db["status"] = "available"
        return self

    def _raise_if_scripted(self, key):
        queue = self.fail.get(key)
        if queue:
            error = queue.pop(0)
            if error is not None:
                raise StatesError(error, "scripted")

    # The API ---------------------------------------------------------------------------------
    def call(self, service, action, params):
        key = (service, action)
        if key not in ALLOWED:
            raise StatesError("AccessDenied", f"{service}:{action} is not in the role policy")
        self._raise_if_scripted(key)
        handler = getattr(self, f"_{service}_{action}")
        return handler(params)

    def _secretsmanager_listSecrets(self, p):
        # The name filter is a prefix match (so a longer name can come back too); never a value.
        assert p["IncludePlannedDeletion"] is True
        prefix = [f for f in p["Filters"] if f["Key"] == "name"][0]["Values"][0]
        return {"SecretList": [copy.deepcopy(s) for s in self.secrets.values() if s["Name"].startswith(prefix)]}

    def _secretsmanager_deleteSecret(self, p):
        arn = p["SecretId"]
        assert p.get("ForceDeleteWithoutRecovery") is True
        if not arn.startswith(f"arn:aws:secretsmanager:{REGION}:{ACCOUNT}:secret:{BOOTSTRAP}-"):
            raise StatesError("AccessDenied", "NeverAnotherSecret")
        for name, s in list(self.secrets.items()):
            if s["ARN"] == arn:
                del self.secrets[name]
                return {"Name": name}
        raise StatesError("SecretsManager.ResourceNotFoundException")

    def _elasticloadbalancingv2_describeLoadBalancers(self, p):
        # Every load balancer in the Region (another one is always there), never filtered by name.
        assert "Names" not in p and p.get("PageSize") == 400
        out = {"LoadBalancers": [copy.deepcopy(lb) for lb in self.lbs + self.other_lbs]}
        if self.lb_more_pages:
            out["NextMarker"] = "next"
        return out

    def _elasticloadbalancingv2_deleteLoadBalancer(self, p):
        arn = p["LoadBalancerArn"]
        if not arn.startswith(f"arn:aws:elasticloadbalancing:{REGION}:{ACCOUNT}:loadbalancer/app/munaxa-nonprod/"):
            raise StatesError("AccessDenied", "only the nonprod ALB")
        if self.lb_delete_lingers:
            self.lb_delete_lingers -= 1
            return {}
        self.lbs = [lb for lb in self.lbs if lb["LoadBalancerArn"] != arn]  # idempotent, like ELB
        return {}

    def _ecs_describeServices(self, p):
        assert p["Cluster"] == CLUSTER and len(p["Services"]) == 1
        name = p["Services"][0]
        if name not in self.services:
            return {"Services": [], "Failures": [{"Reason": "MISSING"}]}
        return {"Services": [dict(self.services[name], ServiceName=name)], "Failures": []}

    def _ecs_updateService(self, p):
        assert p["Cluster"] == CLUSTER and p["DesiredCount"] == 0
        if p["Service"] not in self.services:
            raise StatesError("Ecs.ServiceNotFoundException")
        self.services[p["Service"]]["DesiredCount"] = 0
        return {}

    def _ecs_listTasks(self, p):
        assert p["Cluster"] == CLUSTER and p["DesiredStatus"] == "RUNNING"
        out = {"TaskArns": list(self.tasks)}
        if self.list_tasks_next_token:
            out["NextToken"] = "more"
        return out

    def _ecs_stopTask(self, p):
        assert p["Cluster"] == CLUSTER
        if p["Task"] in self.tasks:
            self.tasks.remove(p["Task"])
        return {}

    def _rds_describeDBInstances(self, p):
        assert p["DbInstanceIdentifier"] == "munaxa-nonprod-pg"
        if self.db is None:
            raise StatesError("Rds.DbInstanceNotFoundException")
        if self.db["sequence"]:
            self.db["status"] = self.db["sequence"].pop(0)
        return {"DbInstances": [{"DbInstanceIdentifier": self.db["id"], "DbInstanceStatus": self.db["status"]}]}

    def _rds_stopDBInstance(self, p):
        assert p["DbInstanceIdentifier"] == "munaxa-nonprod-pg"
        if self.db["status"] != "available":
            raise StatesError("Rds.InvalidDbInstanceStateException")
        self.db["status"] = "stopping"
        return {}


def run(aws, payload=None):
    sim = Simulator(definition(), aws)
    result = sim.run({"dryRun": False} if payload is None else payload)
    return result, sim


def by_component(result):
    results = result["output"]["results"] if result["status"] == "SUCCEEDED" else json.loads(result["cause"])
    return {r["component"]: r for r in results}


def mutating_calls(sim):
    return [c for c in sim.calls if (c[0], c[1]) in MUTATING]


class DefinitionShape(unittest.TestCase):
    def test_template_fills_and_parses(self):
        d = definition()
        self.assertEqual(d["TimeoutSeconds"], 900)
        self.assertEqual(len(d["States"]["Cleanup"]["Branches"]), 4)

    def test_only_allowed_actions_and_never_a_secret_value(self):
        text = json.dumps(definition())
        self.assertNotIn("getSecretValue", text)
        self.assertNotIn("GetSecretValue", text)
        self.assertNotIn("identity-operator", text)
        self.assertNotIn("munaxa-prod", text)
        resources = set()

        def walk(states):
            for st in states.values():
                if st["Type"] == "Task":
                    service, _, action = st["Resource"].split("aws-sdk:")[1].partition(":")
                    resources.add((service, action))
                for b in st.get("Branches", []):
                    walk(b["States"])
                if "ItemProcessor" in st:
                    walk(st["ItemProcessor"]["States"])

        walk(definition()["States"])
        self.assertEqual(resources, ALLOWED)


class Scenarios(unittest.TestCase):
    def test_nothing_left_succeeds_and_changes_nothing(self):
        aws = FakeAws()
        result, sim = run(aws)
        self.assertEqual(result["status"], "SUCCEEDED", result)
        comp = by_component(result)
        self.assertEqual(comp["secret"]["status"], "absent")
        self.assertEqual(comp["alb"]["status"], "absent")
        self.assertEqual(comp["ecs"]["status"], "done")
        self.assertEqual(comp["database"]["status"], "stopped")
        self.assertEqual(mutating_calls(sim), [])
        self.assertIn(OPERATOR, aws.secrets)

    def test_dry_run_with_everything_left_changes_nothing(self):
        aws = FakeAws().with_session()
        before = copy.deepcopy((aws.secrets, aws.lbs, aws.services, aws.tasks, aws.db))
        result, sim = run(aws, {"dryRun": True})
        self.assertEqual(result["status"], "SUCCEEDED", result)
        comp = by_component(result)
        self.assertEqual(comp["secret"]["status"], "would-delete")
        self.assertEqual(comp["alb"]["status"], "would-delete")
        self.assertEqual(comp["database"]["status"], "would-stop")
        statuses = {s["service"]: s["status"] for s in comp["ecs"]["services"]}
        self.assertEqual(statuses["identity"], "would-scale-to-0")
        self.assertEqual(comp["ecs"]["tasksFound"], 2)
        self.assertEqual(mutating_calls(sim), [])
        self.assertEqual(before, (aws.secrets, aws.lbs, aws.services, aws.tasks, aws.db))

    def test_lost_session_is_cleaned_up(self):
        aws = FakeAws().with_session()
        result, sim = run(aws)
        self.assertEqual(result["status"], "SUCCEEDED", result)
        self.assertNotIn(BOOTSTRAP, aws.secrets)
        self.assertIn(OPERATOR, aws.secrets)  # the persistent secret is never touched
        self.assertEqual(aws.lbs, [])
        self.assertEqual(aws.services["identity"]["DesiredCount"], 0)
        self.assertEqual(aws.tasks, [])
        self.assertEqual(aws.db["status"], "stopping")
        comp = by_component(result)
        self.assertEqual((comp["secret"]["status"], comp["alb"]["status"], comp["database"]["status"]), ("deleted", "deleted", "stopping"))
        self.assertLessEqual(result["seconds"], 900)

    def test_duplicate_execution_is_idempotent(self):
        aws = FakeAws().with_session()
        first, _ = run(aws)
        second, sim = run(aws)
        self.assertEqual(first["status"], "SUCCEEDED")
        self.assertEqual(second["status"], "SUCCEEDED", second)
        comp = by_component(second)
        self.assertEqual((comp["secret"]["status"], comp["alb"]["status"]), ("absent", "absent"))
        self.assertEqual(comp["database"]["status"], "stopping")
        self.assertEqual(mutating_calls(sim), [])

    def test_concurrent_down_already_deleted_the_alb(self):
        # `down` (or another cleanup) deleted the ALB between Describe and Delete: ELB answers
        # success for an ALB that is already gone, and the poll then finds nothing.
        aws = FakeAws().with_session()
        original = aws._elasticloadbalancingv2_describeLoadBalancers
        calls = {"n": 0}

        def racing(p):
            calls["n"] += 1
            out = original(p)
            if calls["n"] == 1:
                aws.lbs = []
            return out

        aws._elasticloadbalancingv2_describeLoadBalancers = racing
        result, _ = run(aws)
        self.assertEqual(result["status"], "SUCCEEDED", result)
        self.assertEqual(by_component(result)["alb"]["status"], "deleted")

    def test_partial_failure_does_not_stop_other_branches(self):
        aws = FakeAws().with_session()
        aws.fail[("elasticloadbalancingv2", "deleteLoadBalancer")] = ["AccessDenied"] * 3
        result, sim = run(aws)
        self.assertEqual(result["status"], "FAILED")
        self.assertEqual(result["error"], "CleanupIncomplete")
        comp = by_component(result)
        self.assertEqual(comp["alb"], {"component": "alb", "status": "error", "ok": False, "error": "AccessDenied"})
        self.assertEqual(comp["secret"]["status"], "deleted")
        self.assertEqual(comp["database"]["status"], "stopping")
        self.assertEqual(comp["ecs"]["status"], "done")
        # Retried exactly MaxAttempts (2) times after the first failure, never more.
        deletes = [c for c in sim.calls if c[1] == "deleteLoadBalancer"]
        self.assertEqual(len(deletes), 3)

    def test_cause_carries_names_and_codes_only(self):
        aws = FakeAws().with_session()
        aws.fail[("secretsmanager", "deleteSecret")] = ["SecretsManager.InternalServiceError"] * 3
        result, _ = run(aws)
        self.assertEqual(result["status"], "FAILED")
        cause = json.loads(result["cause"])
        keys = set()
        for r in cause:
            keys |= set(r)
            for s in r.get("services", []):
                keys |= set(s)
        self.assertLessEqual(keys, {"component", "status", "ok", "error", "services", "service", "tasksFound", "taskProblems", "last"})
        self.assertNotIn("XyZ123", result["cause"])  # not even the secret's ARN suffix

    def test_transient_throttling_is_retried(self):
        aws = FakeAws().with_session()
        aws.fail[("secretsmanager", "listSecrets")] = ["SecretsManager.ThrottlingException"]
        result, _ = run(aws)
        self.assertEqual(result["status"], "SUCCEEDED", result)
        self.assertEqual(by_component(result)["secret"]["status"], "deleted")

    def test_task_timeout_is_caught_per_branch(self):
        aws = FakeAws().with_session()
        aws.fail[("rds", "describeDBInstances")] = ["States.Timeout"] * 3
        result, _ = run(aws)
        self.assertEqual(result["status"], "FAILED")
        comp = by_component(result)
        self.assertEqual(comp["database"], {"component": "database", "status": "error", "ok": False, "error": "States.Timeout"})
        self.assertEqual(comp["alb"]["status"], "deleted")

    def test_unexpected_alb_in_another_vpc_is_not_deleted(self):
        aws = FakeAws().with_session()
        aws.lbs[0]["VpcId"] = "vpc-0aaaaaaaaaaaaaaaa"
        result, sim = run(aws)
        self.assertEqual(result["status"], "FAILED")
        self.assertEqual(by_component(result)["alb"]["status"], "unexpected-load-balancer")
        self.assertEqual([c for c in sim.calls if c[1] == "deleteLoadBalancer"], [])
        self.assertEqual(len(aws.lbs), 1)

    def test_unexpected_internal_or_network_lb_is_not_deleted(self):
        for field, value in (("Scheme", "internal"), ("Type", "network")):
            aws = FakeAws().with_session()
            aws.lbs[0][field] = value
            result, sim = run(aws)
            self.assertEqual(by_component(result)["alb"]["status"], "unexpected-load-balancer", field)
            self.assertEqual([c for c in sim.calls if c[1] == "deleteLoadBalancer"], [])

    def test_more_load_balancers_than_one_page_is_not_guessed(self):
        aws = FakeAws().with_session()
        aws.lb_more_pages = True
        result, sim = run(aws)
        self.assertEqual(by_component(result)["alb"]["status"], "unexpected-load-balancer")
        self.assertEqual([c for c in sim.calls if c[1] == "deleteLoadBalancer"], [])

    def test_no_not_found_error_name_is_needed_on_a_normal_day(self):
        # Review finding C-5: between sessions nothing exists, and the result must not depend on
        # AWS naming a "not found" error the way the definition expects.
        aws = FakeAws()
        result, sim = run(aws)
        self.assertEqual(result["status"], "SUCCEEDED", result)
        comp = by_component(result)
        self.assertEqual((comp["secret"]["status"], comp["alb"]["status"]), ("absent", "absent"))
        self.assertEqual(len(aws.other_lbs), 1)

    def test_two_load_balancers_with_the_name_are_not_deleted(self):
        aws = FakeAws().with_session()
        aws.lbs.append(dict(aws.lbs[0], LoadBalancerArn=ALB_ARN + "x"))
        result, sim = run(aws)
        self.assertEqual(by_component(result)["alb"]["status"], "unexpected-load-balancer")
        self.assertEqual([c for c in sim.calls if c[1] == "deleteLoadBalancer"], [])

    def test_alb_still_present_after_polling_fails(self):
        aws = FakeAws().with_session()
        aws.lb_delete_lingers = 1  # the delete is accepted but the ALB never goes
        result, _ = run(aws)
        self.assertEqual(result["status"], "FAILED")
        self.assertEqual(by_component(result)["alb"]["status"], "still-present")
        self.assertLessEqual(result["seconds"], 900)

    def test_secret_scheduled_for_deletion_is_reported_not_deleted(self):
        aws = FakeAws().with_session()
        aws.secrets[BOOTSTRAP]["DeletedDate"] = "2026-11-14T20:00:00Z"
        result, sim = run(aws)
        self.assertEqual(by_component(result)["secret"], {"component": "secret", "status": "pending-deletion", "ok": True})
        self.assertEqual(result["status"], "SUCCEEDED", result)
        self.assertEqual([c for c in sim.calls if c[1] == "deleteSecret"], [])

    def test_a_longer_name_is_never_the_bootstrap_secret(self):
        aws = FakeAws()
        name = BOOTSTRAP + "-old"
        aws.secrets[name] = {"Name": name, "ARN": f"arn:aws:secretsmanager:{REGION}:{ACCOUNT}:secret:{name}-AbCdEf"}
        result, sim = run(aws)
        self.assertEqual(by_component(result)["secret"]["status"], "absent")
        self.assertEqual([c for c in sim.calls if c[1] == "deleteSecret"], [])

    def test_a_secret_of_that_name_with_a_foreign_arn_is_not_deleted(self):
        aws = FakeAws().with_session()
        aws.secrets[BOOTSTRAP]["ARN"] = f"arn:aws:secretsmanager:{REGION}:111111111111:secret:{BOOTSTRAP}-XyZ123"
        result, sim = run(aws)
        self.assertEqual(by_component(result)["secret"]["status"], "unexpected-secret")
        self.assertEqual([c for c in sim.calls if c[1] == "deleteSecret"], [])

    def test_one_service_error_is_reported_and_others_still_scaled(self):
        aws = FakeAws().with_session()
        aws.services["work-api"] = {"Status": "ACTIVE", "DesiredCount": 1}
        original = aws._ecs_updateService

        def picky(p):
            if p["Service"] == "identity":
                raise StatesError("Ecs.AccessDeniedException")
            return original(p)

        aws._ecs_updateService = picky
        result, _ = run(aws)
        self.assertEqual(result["status"], "FAILED")
        ecs = by_component(result)["ecs"]
        self.assertEqual(ecs["status"], "incomplete")
        self.assertEqual(aws.services["work-api"]["DesiredCount"], 0)

    def test_more_tasks_than_one_page_is_incomplete(self):
        aws = FakeAws().with_session()
        aws.list_tasks_next_token = True
        result, _ = run(aws)
        self.assertEqual(by_component(result)["ecs"]["status"], "incomplete")

    def test_database_starting_is_waited_out_then_stopped(self):
        aws = FakeAws().with_session()
        aws.db["sequence"] = ["starting", "starting", "available"]
        result, _ = run(aws)
        self.assertEqual(result["status"], "SUCCEEDED", result)
        self.assertEqual(by_component(result)["database"]["status"], "stopping")

    def test_database_stuck_is_bounded_and_reported(self):
        aws = FakeAws().with_session()
        aws.db["status"] = "modifying"
        aws.db["sequence"] = []
        result, sim = run(aws)
        self.assertEqual(result["status"], "FAILED")
        db = by_component(result)["database"]
        self.assertEqual((db["status"], db["last"]), ("still-running", "modifying"))
        self.assertEqual(len([c for c in sim.calls if c[1] == "describeDBInstances"]), 11)
        self.assertLessEqual(result["seconds"], 900)

    def test_database_race_between_describe_and_stop(self):
        aws = FakeAws().with_session()
        aws.fail[("rds", "stopDBInstance")] = ["Rds.InvalidDbInstanceStateException"]
        aws.db["sequence"] = ["available", "stopping"]
        result, _ = run(aws)
        self.assertEqual(result["status"], "SUCCEEDED", result)
        self.assertEqual(by_component(result)["database"]["status"], "stopping")

    def test_missing_database_is_reported(self):
        aws = FakeAws()
        aws.db = None
        result, _ = run(aws)
        self.assertEqual(result["status"], "FAILED")
        self.assertEqual(by_component(result)["database"]["status"], "absent")

    def test_bad_input_changes_nothing(self):
        for payload in ({}, {"dryRun": "false"}, {"dryRun": 0}, {"other": True}):
            aws = FakeAws().with_session()
            result, sim = run(aws, payload)
            self.assertEqual((result["status"], result["error"]), ("FAILED", "BadInput"), payload)
            self.assertEqual(sim.calls, [])

    def test_unknown_error_name_fails_closed(self):
        # If AWS names "not found" differently from what the definition expects, the branch reports
        # an error (alarm) instead of a false success. The B-4 dry run shows it before any session.
        aws = FakeAws()
        aws._secretsmanager_listSecrets = lambda p: (_ for _ in ()).throw(StatesError("SecretsManager.SecretsManagerException"))
        result, _ = run(aws)
        self.assertEqual(result["status"], "FAILED")
        self.assertEqual(by_component(result)["secret"]["status"], "error")

    def test_worst_case_time_fits_inside_the_timeout(self):
        aws = FakeAws().with_session()
        aws.db["status"] = "backing-up"
        aws.lb_delete_lingers = 1
        for key in [("secretsmanager", "listSecrets"), ("ecs", "listTasks")]:
            aws.fail[key] = ["Throttling", "Throttling"]
        result, _ = run(aws)
        self.assertNotEqual(result["status"], "TIMED_OUT")
        self.assertLessEqual(result["seconds"], 900)


if __name__ == "__main__":
    unittest.main()
