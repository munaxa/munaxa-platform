#!/usr/bin/env python3
# A fake AWS CLI v2 for the offline test of ../docs-testing-secrets.sh. No AWS call, no network.
# It accepts exactly the shape the script uses: `aws <service> <operation> --cli-input-json
# file:///dev/stdin ...`, reads the request from standard input, and answers like the real CLI
# (JSON on stdout; "An error occurred (Code) when calling ..." on stderr with exit 254).
# State lives in the JSON file named in the first line of STATE_POINTER (next to this file), because
# the script runs the CLI with a cleared environment. Every request is appended to <state>.ops, and
# every request's argv and environment are checked for the marker FAKEVALUE and for any value the
# state holds (a value in an argument or the environment would be a leak).
import json, os, sys, uuid

HERE = os.path.dirname(os.path.abspath(__file__))
STATE = open(os.path.join(HERE, "STATE_POINTER")).read().strip()
ACCOUNT = "229251310592"
REGION = "eu-central-1"


def load():
    with open(STATE) as f:
        return json.load(f)


def save(s):
    with open(STATE + ".tmp", "w") as f:
        json.dump(s, f)
    os.replace(STATE + ".tmp", STATE)


def log(rec):
    with open(STATE + ".ops", "a") as f:
        f.write(json.dumps(rec) + "\n")


def fail(code, op):
    sys.stderr.write(f"\nAn error occurred ({code}) when calling the {op} operation: FAKEVALUE detail must never be printed\n")
    sys.exit(254)


def main():
    argv = sys.argv[1:]
    if argv == ["--version"]:
        print("aws-cli/2.31.0 Python/3.13.7 Linux/6 exe/x86_64")
        return
    service, op = argv[0], argv[1]
    if "--cli-input-json" not in argv or argv[argv.index("--cli-input-json") + 1] != "file:///dev/stdin":
        fail("FakeUsage", op)
    req = json.loads(sys.stdin.read() or "{}")
    s = load()
    # Leak checks: no stored value and no fake marker in our argv or environment.
    values = [v["string"] for sec in s["secrets"].values() for v in sec["versions"]]
    blob = "\0".join(argv) + "\0" + "\0".join(f"{k}={v}" for k, v in os.environ.items())
    leaked = "FAKEVALUE" in blob or any(v and v in blob for v in values) or any(
        part and part in blob for v in values for part in json.loads(v).values() if isinstance(part, str) and len(part) >= 16)
    log({"service": service, "op": op, "req_keys": sorted(req), "leak": leaked,
         "env_names": sorted(os.environ)})
    faults = s.get("faults", {})
    key = f"{service}:{op}"
    if key in faults and faults[key]["count"] > 0:
        faults[key]["count"] -= 1
        save(s)
        fail(faults[key]["code"], op)

    pf = s.get("put_fail_at")
    if pf and service == "secretsmanager" and op == "put-secret-value":
        pf["seen"] = pf.get("seen", 0) + 1
        save(s)
        if pf["seen"] == pf["nth"]:
            fail(pf["code"], op)

    if service == "sts" and op == "get-caller-identity":
        print(json.dumps({"Account": s.get("account", ACCOUNT), "Arn": f"arn:aws:iam::{s.get('account', ACCOUNT)}:root", "UserId": ACCOUNT}))
        return
    if service == "rds" and op == "describe-db-instances":
        print(json.dumps({"DBInstances": [{"DBInstanceIdentifier": req["DBInstanceIdentifier"], "DBInstanceStatus": "stopped",
                                           "Endpoint": {"Address": s["db_host"], "Port": 5432}}]}))
        return
    if service != "secretsmanager":
        fail("FakeUnsupported", op)

    def find(sid):
        for name, sec in s["secrets"].items():
            if sid in (name, sec["arn"]):
                return name, sec
        fail("ResourceNotFoundException", op)

    def stages(sec):
        return {v["id"]: v["stages"] for v in sec["versions"]}

    if op == "describe-secret":
        name, sec = find(req["SecretId"])
        print(json.dumps({"ARN": sec["arn"], "Name": name, "KmsKeyId": sec["kms"],
                          "VersionIdsToStages": {k: v for k, v in stages(sec).items() if v}}))
    elif op == "list-secret-version-ids":
        name, sec = find(req["SecretId"])
        print(json.dumps({"ARN": sec["arn"], "Name": name,
                          "Versions": [{"VersionId": v["id"], "VersionStages": v["stages"]} for v in sec["versions"]]}))
    elif op == "get-secret-value":
        name, sec = find(req["SecretId"])
        for v in sec["versions"]:
            if v["id"] == req["VersionId"]:
                print(json.dumps({"ARN": sec["arn"], "Name": name, "VersionId": v["id"], "SecretString": v["string"],
                                  "VersionStages": v["stages"]}))
                return
        fail("ResourceNotFoundException", op)
    elif op == "put-secret-value":
        name, sec = find(req["SecretId"])
        if "VersionStages" in req:
            fail("FakeVersionStagesNotExpected", op)
        uuid.UUID(req["ClientRequestToken"], version=4)
        for v in sec["versions"]:
            if "AWSPREVIOUS" in v["stages"]:
                v["stages"].remove("AWSPREVIOUS")
        for v in sec["versions"]:
            if "AWSCURRENT" in v["stages"]:
                v["stages"].remove("AWSCURRENT")
                v["stages"].append("AWSPREVIOUS")
        sec["versions"].append({"id": req["ClientRequestToken"], "string": req["SecretString"], "stages": ["AWSCURRENT"]})
        save(s)
        print(json.dumps({"ARN": sec["arn"], "Name": name, "VersionId": req["ClientRequestToken"], "VersionStages": ["AWSCURRENT"]}))
    elif op == "create-secret":
        if req["Name"] in s["secrets"]:
            fail("ResourceExistsException", op)
        uuid.UUID(req["ClientRequestToken"], version=4)
        arn = f"arn:aws:secretsmanager:{REGION}:{ACCOUNT}:secret:{req['Name']}-AbCdEf"
        s["secrets"][req["Name"]] = {"arn": arn, "kms": req["KmsKeyId"],
                                     "versions": [{"id": req["ClientRequestToken"], "string": req["SecretString"], "stages": ["AWSCURRENT"]}]}
        save(s)
        print(json.dumps({"ARN": arn, "Name": req["Name"], "VersionId": req["ClientRequestToken"]}))
    elif op == "delete-secret":
        name, sec = find(req["SecretId"])
        if req.get("ForceDeleteWithoutRecovery") is not True:
            fail("FakeRecoveryWindowNotExpected", op)
        del s["secrets"][name]
        save(s)
        print(json.dumps({"ARN": sec["arn"], "Name": name, "DeletionDate": 0}))
    else:
        fail("FakeUnsupported", op)


main()
