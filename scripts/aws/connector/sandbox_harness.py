"""Offline harness for the AWS connector scripts in this directory (Stage E blockers BE-1, BE-2, BE-8).

The AWS connector's run_script tool runs one Python text in a sandbox. What is known about it, and
nothing more is assumed here:

  - its own tool description: `call_boto3(*, service_name, operation_name, region_name, params)` is
    awaited; these names are pre-imported: asyncio, collections, csv, dataclasses, datetime, decimal,
    enum, fractions, functools, itertools, json, math, re, statistics, string, time, typing, uuid,
    ClientError, StringIO, BytesIO; the script sets `result = ...` and ends with the bare expression
    `result`, which is what the tool returns;
  - observed 13 Nov 2026 (reports 2026-11-13-identity-stage-c-execution, 2026-11-14 stage D
    readiness): the validator refused imports of secrets, os, base64, binascii, hashlib, codecs and
    contextlib, and refused a script that used `__name__` (`type(e).__name__`);
  - the script source itself is recorded in the account's CloudTrail (AWS MCP Server logging), so a
    value written into the source is not secret from the account.

So every script here is checked against a stricter rule set than what was observed (check_source):
no import statement at all, no dunder name or attribute anywhere, no reflective builtins
(getattr, hasattr, setattr, delattr, type, vars, globals, locals, eval, exec, compile, open,
__import__, print, input, breakpoint), no Secrets Manager value read, only the pre-imported module
names, and the last statement is the bare expression `result`.

run_script() then executes the text the way the sandbox does (top-level await) against a fake
call_boto3. Nothing here opens a network connection or reads a credential.
"""

import ast
import asyncio
import collections
import csv
import dataclasses
import datetime
import decimal
import enum
import fractions
import functools
import io
import itertools
import json
import math
import re
import statistics
import string
import time
import typing
import uuid

PRE_IMPORTED = {
    "asyncio": asyncio, "collections": collections, "csv": csv, "dataclasses": dataclasses,
    "datetime": datetime, "decimal": decimal, "enum": enum, "fractions": fractions,
    "functools": functools, "itertools": itertools, "json": json, "math": math, "re": re,
    "statistics": statistics, "string": string, "time": time, "typing": typing, "uuid": uuid,
    "StringIO": io.StringIO, "BytesIO": io.BytesIO,
}

FORBIDDEN_NAMES = {
    "getattr", "hasattr", "setattr", "delattr", "type", "vars", "globals", "locals", "eval", "exec",
    "compile", "open", "__import__", "print", "input", "breakpoint", "memoryview", "help", "dir",
    "os", "sys", "secrets", "base64", "binascii", "hashlib", "codecs", "contextlib", "subprocess",
    "socket", "importlib", "builtins",
}
FORBIDDEN_TEXT = (":2773", "AWS_SESSION_TOKEN", "AWS_SECRET_ACCESS_KEY")
# Operations no connector script may ever call (value reads and value writes outside C-8/C-8R).
FORBIDDEN_OPERATIONS = {"GetSecretValue", "BatchGetSecretValue"}
AWS_CALLERS = {"aws", "call_boto3"}


class ClientError(Exception):
    """Stands in for botocore.exceptions.ClientError: `.response["Error"]["Code"]`. Its message is
    deliberately built from the request so a test can prove a script never echoes a message."""

    def __init__(self, code, message="", operation=""):
        super().__init__(f"An error occurred ({code}) when calling the {operation} operation: {message}")
        self.response = {"Error": {"Code": code, "Message": message}}


def check_source(text):
    """Return a sorted list of rule violations (empty when the script is acceptable)."""
    problems = set()
    try:
        tree = ast.parse(text)
    except SyntaxError:
        # Top-level await is a SyntaxError for ast.parse in exec mode: parse it as the sandbox does.
        try:
            tree = compile(text, "<connector>", "exec", flags=ast.PyCF_ONLY_AST | ast.PyCF_ALLOW_TOP_LEVEL_AWAIT)
        except SyntaxError as err:
            return [f"syntax-error line {err.lineno}"]
    for node in ast.walk(tree):
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            problems.add(f"import line {node.lineno}")
        if isinstance(node, ast.Name):
            if "__" in node.id:
                problems.add(f"dunder-name {node.id}")
            if node.id in FORBIDDEN_NAMES:
                problems.add(f"forbidden-name {node.id}")
        if isinstance(node, ast.Attribute) and "__" in node.attr:
            problems.add(f"dunder-attribute {node.attr}")
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)) and "__" in node.name:
            problems.add(f"dunder-definition {node.name}")
        if isinstance(node, ast.arg) and "__" in node.arg:
            problems.add(f"dunder-argument {node.arg}")
        if isinstance(node, (ast.Global, ast.Nonlocal)):
            problems.add(f"global-statement line {node.lineno}")
    # Every AWS call names its service and operation as literals, so a reviewer (and this check) sees
    # exactly which operations a script can reach; no value read is among them.
    for node in ast.walk(tree):
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id in AWS_CALLERS:
            if node.func.id == "call_boto3":
                kw = {k.arg: k.value for k in node.keywords}
                service, operation = kw.get("service_name"), kw.get("operation_name")
            else:
                service = node.args[0] if len(node.args) > 0 else None
                operation = node.args[1] if len(node.args) > 1 else None
            if not (isinstance(service, ast.Constant) and isinstance(operation, ast.Constant)):
                if not (node.func.id == "call_boto3" and isinstance(service, ast.Name) and isinstance(operation, ast.Name)):
                    problems.add(f"non-literal-operation line {node.lineno}")
                continue
            if operation.value in FORBIDDEN_OPERATIONS:
                problems.add(f"forbidden-operation {operation.value}")
    direct = [n for n in ast.walk(tree) if isinstance(n, ast.Call) and isinstance(n.func, ast.Name) and n.func.id == "call_boto3"]
    if len(direct) != 1:
        problems.add("call_boto3-outside-the-shared-helper")
    for needle in FORBIDDEN_TEXT:
        if needle in text:
            problems.add(f"forbidden-text {needle}")
    body = tree.body
    if not body or not (isinstance(body[-1], ast.Expr) and isinstance(body[-1].value, ast.Name) and body[-1].value.id == "result"):
        problems.add("last-statement-not-result")
    # Only the pre-imported modules may be referred to as modules.
    for node in ast.walk(tree):
        if isinstance(node, ast.Attribute) and isinstance(node.value, ast.Name):
            base = node.value.id
            if base in {"os", "sys", "secrets", "hashlib", "base64"}:
                problems.add(f"module {base}")
    return sorted(problems)


def run_script(text, call_boto3, *, now=None, max_seconds=55, overrides=None):
    """Execute a connector script like the sandbox: top-level await, the pre-imported names, a fake
    call_boto3. Returns the value of `result`. `asyncio.sleep` is made instantaneous (a fake clock),
    and the run is refused if it would take more simulated time than the connector allows."""
    violations = check_source(text)
    if violations:
        raise AssertionError(f"sandbox rules: {violations}")
    clock = {"t": 0.0}
    real_sleep = asyncio.sleep

    async def fake_sleep(seconds, *args, **kwargs):
        clock["t"] += seconds
        if clock["t"] > max_seconds:
            raise AssertionError(f"script would exceed {max_seconds} s of the connector's time")
        await real_sleep(0)

    fake_asyncio = type("FakeAsyncio", (), {})()
    for name in ("gather", "wait_for", "TimeoutError", "CancelledError", "create_task", "Lock", "Semaphore"):
        setattr(fake_asyncio, name, getattr(asyncio, name))
    fake_asyncio.sleep = fake_sleep

    namespace = dict(PRE_IMPORTED)
    namespace["asyncio"] = fake_asyncio
    namespace["ClientError"] = ClientError
    namespace["call_boto3"] = call_boto3
    if now is not None:
        namespace["_harness_now"] = now
    # A test may replace a pre-imported module (e.g. a fake `time` whose clock it controls).
    for name, value in (overrides or {}).items():
        if name not in PRE_IMPORTED:
            raise KeyError(f"{name} is not a pre-imported name")
        namespace[name] = value
    code = compile(text, "<connector>", "exec", flags=ast.PyCF_ALLOW_TOP_LEVEL_AWAIT)

    async def go():
        outcome = eval(code, namespace)  # noqa: S307 - the harness, not a connector script
        if asyncio.iscoroutine(outcome):
            await outcome
        return namespace.get("result")

    return asyncio.run(go())


def set_inputs(text, **values):
    """Replace `NAME = <literal>  # INPUT` lines, the only lines an operator edits in a session copy."""
    for name, value in values.items():
        pattern = re.compile(rf"^{name} = .*?  # INPUT.*$", re.MULTILINE)
        if not pattern.search(text):
            raise KeyError(f"no INPUT line for {name}")
        text = pattern.sub(lambda _m: f"{name} = {value!r}  # INPUT (set by the test)", text, count=1)
    return text


SHARED_BEGIN = "# --- shared helpers v1 (identical in every connector script) ---"
SHARED_END = "# --- end shared helpers ---"


def shared_block(text):
    start = text.index(SHARED_BEGIN)
    end = text.index(SHARED_END) + len(SHARED_END)
    return text[start:end]
