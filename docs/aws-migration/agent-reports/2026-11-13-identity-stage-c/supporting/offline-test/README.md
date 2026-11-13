# Offline test of stage-c-add-mfa-key.sh (no AWS)

Fake boto3 and fake values only. Every fake value contains `FAKESECRET`, and the runner fails if that marker or the generated key appears in any output.

```bash
# once: the Identity 2db6ed9 config loader (case 1a) and an isolated venv holding the fake boto3 (case 20)
./build-identity-config.sh /path/to/munaxa-identity@2db6ed9 /path/to/munaxa-platform
python3 -m venv venv-iso
cp -r stub/boto3.py stub/botocore "$(venv-iso/bin/python3 -c 'import site;print(site.getsitepackages()[0])')/"
# run (exit 0 only if all 25 cases pass)
./run.sh ../stage-c-add-mfa-key.sh
```

`build/id-p5.txt` is the mocked `terraform test` render of the Identity task definition at PR #121. It holds ARNs with `XXXXXX` placeholders, environment names and public values only.
