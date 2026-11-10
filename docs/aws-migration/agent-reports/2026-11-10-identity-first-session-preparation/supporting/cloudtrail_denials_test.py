"""python3 -I cloudtrail_denials_test.py   (no dependencies)"""
import importlib.util
import json
import pathlib
import subprocess
import sys
import unittest

HERE = pathlib.Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("denials", HERE / "cloudtrail-denials.py")
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


def ev(code=None, compact=True, **extra):
    e = {"eventTime": "2026-11-10T08:00:00Z", "eventSource": "ecs.amazonaws.com", "eventName": "CreateService",
         "userIdentity": {"arn": "arn:aws:sts::229251310592:assumed-role/x/y"}}
    if code is not None:
        e["errorCode"] = code
    e.update(extra)
    # lookup-events wraps each event as a JSON string, compact or not
    return {"EventId": "1", "CloudTrailEvent": json.dumps(e, indent=None if compact else 2)}


MATCH = ["AccessDenied", "AccessDeniedException", "UnauthorizedOperation", "Client.UnauthorizedOperation"]
NO_MATCH = [None, "ThrottlingException", "InvalidDBInstanceStateFault", "ServiceNotFoundException",
            "ResourceNotFoundException", "ValidationException", "UnauthorizedOperationRetry"]


class Denials(unittest.TestCase):
    def test_matching_codes(self):
        for code in MATCH:
            total, found = mod.denials({"Events": [ev(code)]})
            self.assertEqual((total, len(found)), (1, 1), code)
            self.assertEqual(found[0][3], code)

    def test_non_matching_codes(self):
        for code in NO_MATCH:
            self.assertEqual(mod.denials({"Events": [ev(code)]})[1], [], code)

    def test_words_outside_errorCode_do_not_match(self):
        noisy = ev("ThrottlingException", errorMessage="looks like AccessDenied but is not",
                   requestParameters={"note": "UnauthorizedOperation"})
        quiet = ev(None, responseElements={"text": "AccessDenied"})
        self.assertEqual(mod.denials({"Events": [noisy, quiet]})[1], [])

    def test_pretty_printed_event_json(self):
        self.assertEqual(len(mod.denials({"Events": [ev("AccessDenied", compact=False)]})[1]), 1)

    def test_mixed_batch_counts(self):
        events = [ev(c) for c in MATCH + NO_MATCH]
        total, found = mod.denials({"Events": events})
        self.assertEqual((total, len(found)), (len(MATCH) + len(NO_MATCH), len(MATCH)))

    def test_empty(self):
        self.assertEqual(mod.denials({"Events": []}), (0, []))

    def _cli(self, payload):
        return subprocess.run([sys.executable, "-I", str(HERE / "cloudtrail-denials.py")],
                              input=payload, capture_output=True, text=True)

    def test_cli_exit_codes(self):
        r = self._cli(json.dumps({"Events": [ev("ThrottlingException")]}))
        self.assertEqual((r.returncode, r.stdout.splitlines()[0]), (0, "events 1 denials 0"))
        r = self._cli(json.dumps({"Events": [ev("Client.UnauthorizedOperation"), ev(None)]}))
        self.assertEqual(r.returncode, 1)
        self.assertIn("events 2 denials 1", r.stdout)
        self.assertIn("CreateService", r.stdout)
        self.assertEqual(self._cli("not json").returncode, 2)


if __name__ == "__main__":
    unittest.main()
