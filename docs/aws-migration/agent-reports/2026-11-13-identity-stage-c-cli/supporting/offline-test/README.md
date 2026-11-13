# Offline test of stage-c-add-mfa-key-cli.sh (no AWS)

The real script calls the real AWS CLI v2, which talks over HTTP to `fake-aws-server.py`, a local fake of the container credential provider, STS and Secrets Manager. The fake holds fake values only, and every fake value contains `FAKESECRET`. The runner fails if that marker or the generated key appears in any output, or in any process's arguments or environment while a request is in flight.

Needs root, Node.js, free port 18443, and the AWS CLI v2 at `/usr/local/bin/aws` in the official installer layout, as in CloudShell:

```bash
# once: the AWS CLI v2 (check the package signature first, see the AWS CLI install guide)
curl -sSfo awscliv2.zip https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip && unzip -q awscliv2.zip && sudo ./aws/install
# once: the Identity 2db6ed9 config loader for case 1a
./build-identity-config.sh /path/to/munaxa-identity@2db6ed9 /path/to/munaxa-platform
# run (exit 0 only if every case passes)
./run.sh ../stage-c-add-mfa-key-cli.sh
```

Python 3.9 run: bind-mount a wrapper over `/usr/bin/python3` in a private mount namespace (`unshare --mount`). The wrapper is `exec /usr/bin/env -u PWD <python3.9> "$@"`.

Notes:

- `build/id-p5.txt` is the mocked `terraform test` render of the Identity task definition at PR #121. It holds ARNs with `XXXXXX` placeholders, environment names and public values only.
- `stub/` is the revision 1 fake (scenarios in `stub/boto3.py`). The fake server uses it as its back end.
- Case 28 reads the script's `/proc/<pid>/environ` while a request is in flight. The script makes itself non-dumpable, so that read works only because the fake server runs as root.
