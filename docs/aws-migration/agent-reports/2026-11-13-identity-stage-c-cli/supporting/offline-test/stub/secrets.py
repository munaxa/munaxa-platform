# Test-only stand-in for the stdlib module, used only by the collide and degenerate scenarios.
import os, importlib.util, sysconfig
_spec = importlib.util.spec_from_file_location("_real_secrets", os.path.join(sysconfig.get_paths()["stdlib"], "secrets.py"))
_real = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(_real)
def token_bytes(n):
    s = os.environ.get("SCEN")
    if s == "collide": return bytes(range(1, 33))
    if s == "degenerate": return b"\x07" * 32
    return _real.token_bytes(n)
