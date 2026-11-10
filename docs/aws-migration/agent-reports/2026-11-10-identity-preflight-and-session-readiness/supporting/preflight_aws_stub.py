#!/usr/bin/env python3
"""Offline stand-in for the AWS CLI, used only by preflight_readonly_test.py. Makes no network call.

Invoked as `aws SERVICE OPERATION [--option value ...]` through a wrapper on PATH. The response
comes from the scenario file in STUB_SCENARIO, keyed "service operation selector" (the value of the
first selector option present, e.g. the role or secret name) or else "service operation":
  {"json": {...}}                         API response; --query is applied with jmespath and printed
                                          like the CLI's --output text / json
  {"error": "Code", "message": "..."}     service error, printed like the CLI ("An error occurred
                                          (Code) when calling the Op operation: ...") with exit 254
  {"stderr": "...", "rc": 255}            CLI-level failure (network, credentials) without an AWS code
A call with no matching key fails with exit 254 and code StubMissingResponse. Every call is appended
to STUB_LOG as one JSON line.
"""
import json
import os
import sys

import jmespath

SELECTORS = ("--db-instance-identifier", "--task-definition", "--secret-id", "--key-id", "--name",
             "--certificate-arn", "--repository-name", "--role-name", "--region")


def text(value):
    """The AWS CLI text format for the shapes the preflight queries return."""
    def scalar(v):
        if v is None:
            return "None"
        if isinstance(v, bool):
            return "True" if v else "False"
        return str(v)
    if isinstance(value, list):
        if all(not isinstance(v, (list, dict)) for v in value):
            return "\t".join(scalar(v) for v in value)
        return "\n".join(text(v) for v in value)
    if isinstance(value, dict):
        return "\t".join(scalar(v) for v in value.values())
    return scalar(value)


def main(argv):
    service, operation, rest = argv[0], argv[1], argv[2:]
    options, i = {}, 0
    while i < len(rest):
        if rest[i].startswith("--") and i + 1 < len(rest) and not rest[i + 1].startswith("--"):
            options[rest[i]] = rest[i + 1]
            i += 2
        else:
            options[rest[i]] = True
            i += 1
    with open(os.environ["STUB_LOG"], "a") as log:
        log.write(json.dumps({"service": service, "operation": operation, "options": options}) + "\n")
    with open(os.environ["STUB_SCENARIO"]) as f:
        scenario = json.load(f)
    keys = [f"{service} {operation} {options[s]}" for s in SELECTORS if isinstance(options.get(s), str)][:1]
    keys.append(f"{service} {operation}")
    response = next((scenario[k] for k in keys if k in scenario), None)
    op_name = "".join(part.capitalize() for part in operation.split("-"))
    if response is None:
        response = {"error": "StubMissingResponse", "message": f"no stub for {keys}"}
    if "stderr" in response:
        sys.stderr.write(response["stderr"] + "\n")
        return response.get("rc", 255)
    if "error" in response:
        sys.stderr.write(f"\nAn error occurred ({response['error']}) when calling the {op_name} "
                         f"operation: {response.get('message', '')}\n")
        return response.get("rc", 254)
    data = response["json"]
    if isinstance(options.get("--query"), str):
        data = jmespath.search(options["--query"], data)
    print(json.dumps(data, indent=4) if options.get("--output") == "json" else text(data))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
