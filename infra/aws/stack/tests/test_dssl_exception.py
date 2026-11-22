#!/usr/bin/env python3
"""Static checks of the temporary D-SSL exception guard (dssl-exception.tf), run in CI.

  python3 -I -m unittest discover -s infra/aws/stack/tests -p 'test_dssl_exception.py' -v

P-1: while dssl-exception.tf exists, envs/prod.tfvars pins no image at all (images = {}).
The Terraform rules P-2, E-1 and T-1 are tested in modules/image-exception-guard/tests.
"""
import os
import re
import unittest

STACK = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))


def read(*p):
    with open(os.path.join(STACK, *p), encoding="utf-8") as f:
        return f.read()


def strip_comments(text):
    return "\n".join(l.split("#", 1)[0] for l in text.splitlines())


class DsslGuard(unittest.TestCase):
    def setUp(self):
        if not os.path.exists(os.path.join(STACK, "dssl-exception.tf")):
            self.skipTest("the D-SSL exception has been removed")
        self.guard = strip_comments(read("dssl-exception.tf"))

    def test_p1_production_pins_no_image(self):
        prod = strip_comments(read("envs", "prod.tfvars"))
        assigns = re.findall(r"^\s*images\s*=\s*(.*)$", prod, re.M)
        self.assertEqual(assigns, ["{}"], "envs/prod.tfvars must say exactly `images = {}` while the D-SSL exception exists")
        self.assertNotRegex(prod, r"sha256:[0-9a-f]{64}", "no digest in production tfvars while the D-SSL exception exists")

    def test_expiry_is_the_owner_cutoff(self):
        self.assertRegex(self.guard, r'dssl_exception_expires_utc\s*=\s*"2026-12-01T00:00:00Z"')

    def test_the_guard_uses_the_real_plan_time(self):
        self.assertRegex(self.guard, r"now_utc\s*=\s*plantimestamp\(\)")
        self.assertRegex(self.guard, r"environment\s*=\s*var\.environment")
        self.assertRegex(self.guard, r"sessions_running\s*=\s*var\.services_enabled \|\| var\.edge_enabled")

    def test_listed_digests_are_well_formed_and_not_withdrawn_twice(self):
        listed = re.findall(r'"(sha256:[^"]*)"\s*=', self.guard)
        for d in listed:
            self.assertRegex(d, r"^sha256:[0-9a-f]{64}$")
        withdrawn = strip_comments(read("withdrawn-images.tf"))
        for d in listed:
            self.assertNotIn(d, withdrawn, "a digest is either Testing-only or withdrawn, not both")


if __name__ == "__main__":
    unittest.main()
