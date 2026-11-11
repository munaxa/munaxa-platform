#!/usr/bin/env bash
# READ-ONLY. CloudShell, account 229251310592. Prints the S3 ListTagsForResource CloudTrail events
# between 10 Nov 06:00 and 11 Nov 06:00 UTC in eu-central-1, one JSON object per event, with only
# the fields the investigation needs. One read call: cloudtrail lookup-events (all pages).
set -euo pipefail
aws cloudtrail lookup-events --region eu-central-1 \
  --lookup-attributes AttributeKey=EventName,AttributeValue=ListTagsForResource \
  --start-time 2026-11-10T06:00:00Z --end-time 2026-11-11T06:00:00Z --output json |
  python3 -I -c '
import json, sys
events = json.load(sys.stdin).get("Events", [])
n = 0
for e in events:
    ct = json.loads(e["CloudTrailEvent"])
    if ct.get("eventSource") != "s3.amazonaws.com":
        continue
    n += 1
    ui = ct.get("userIdentity", {})
    print(json.dumps({
        "eventTime": ct.get("eventTime"), "eventID": ct.get("eventID"), "requestID": ct.get("requestID"),
        "role": ui.get("sessionContext", {}).get("sessionIssuer", {}).get("arn"), "arn": ui.get("arn"),
        "errorCode": ct.get("errorCode"), "errorMessage": ct.get("errorMessage"),
        "requestParameters": ct.get("requestParameters"), "resources": ct.get("resources"),
        "userAgent": ct.get("userAgent"), "sourceIPAddress": ct.get("sourceIPAddress"),
        "eventType": ct.get("eventType"), "readOnly": ct.get("readOnly"),
    }, sort_keys=True))
print(f"s3 ListTagsForResource events: {n} (of {len(events)} lookup results)")
'
