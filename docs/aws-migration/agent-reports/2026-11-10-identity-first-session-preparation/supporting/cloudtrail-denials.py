#!/usr/bin/env python3
"""Count authorization denials in CloudTrail event history (read-only, metadata only).

    aws cloudtrail lookup-events --region eu-central-1 --start-time 2026-11-10T06:00:00Z --output json \
      | python3 -I cloudtrail-denials.py

Give the AWS CLI no --max-results: without it the CLI follows every page, so the whole window is
read; with it the CLI stops at that many events (the 10 Nov report's 50-event command did that).
Run it once for eu-central-1 and once for us-east-1 (IAM and STS events are recorded there).

A denial is an event whose `errorCode` field (not its message, not its request) contains
AccessDenied (AccessDenied, AccessDeniedException) or ends in UnauthorizedOperation
(UnauthorizedOperation, Client.UnauthorizedOperation). Prints one line per denial: time, source,
action, error code, principal ARN; never the request or response. Exit 0 none, 1 some, 2 bad input.
"""
import json
import re
import sys

DENIAL = re.compile(r"AccessDenied|UnauthorizedOperation$")


def denials(document):
    """document: the parsed lookup-events JSON ({"Events": [...]}) or a bare list of events."""
    events = document.get("Events", []) if isinstance(document, dict) else document
    found = []
    for item in events:
        raw = item.get("CloudTrailEvent") if isinstance(item, dict) else None
        event = json.loads(raw) if isinstance(raw, str) else (raw or item)
        code = event.get("errorCode")
        if isinstance(code, str) and DENIAL.search(code):
            found.append((
                event.get("eventTime", "?"),
                event.get("eventSource", "?"),
                event.get("eventName", "?"),
                code,
                (event.get("userIdentity") or {}).get("arn", "?"),
            ))
    return len(events), found


def main():
    try:
        total, found = denials(json.load(sys.stdin))
    except (ValueError, AttributeError) as error:
        print(f"cannot read lookup-events JSON: {error}")
        return 2
    print(f"events {total} denials {len(found)}")
    for row in found:
        print(*row, sep="  ")
    return 1 if found else 0


if __name__ == "__main__":
    sys.exit(main())
