# Runs the script on a real pseudo-terminal (so /dev/tty is genuine) and types CREATE at the prompt.
import os, pty, sys, select, time
pid, fd = pty.fork()
if pid == 0:
    os.execvp("bash", ["bash", sys.argv[1]])
buf = b""; sent = False; end = time.time() + 30
while time.time() < end:
    r, _, _ = select.select([fd], [], [], 0.2)
    if r:
        try: chunk = os.read(fd, 4096)
        except OSError: break
        if not chunk: break
        buf += chunk
        if not sent and b"Type CREATE" in buf:
            os.write(fd, b"CREATE\n"); sent = True
_, status = os.waitpid(pid, 0)
out = buf.decode(errors="replace").replace("\r\n", "\n")
print(out.rstrip()); print(f"exit={os.waitstatus_to_exitcode(status)} typed_on_tty={sent}")
leak = "FAKESECRET" in out
put = os.environ["STATE"] + ".put"
if os.path.exists(put):
    import json; leak = leak or json.load(open(put))["MFA_ENCRYPTION_KEYS"].split("=", 1)[1] in out
print("leak check:", "LEAK" if leak else "no fake secret marker and no key in the output")
