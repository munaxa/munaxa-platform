# 01. D-SSL: the temporary Testing-only OpenSSL exception

## 1. Owner decision (recorded)

**D-SSL (Tamer, 22 Nov 2026 14:07 UTC, project thread brief):** proceed with the first Munaxa Docs
Testing deployment under a temporary, explicitly accepted OpenSSL risk. OpenSSL **3.5.10** stays the
required permanent fix, target **1 Dec 2026**. The acceptance:

- covers only the affected Testing images and the documented CVEs; never production;
- is not a permanent suppression, does not change the Grype threshold, hides no other finding;
- expires automatically at **2026-12-01T00:00:00Z** (the owner's date; no safer cutoff exists in
  repository policy) and then **fails closed**: no new affected image is published or started;
- does not cover Work or School (out of scope unless the owner widens it).

Scope interpretation [R]: "Docs Testing and its required dependencies" = **Identity** (sign-in),
**Control** (licence and the Docs deployment credential) and **Docs** (api, web, worker, migrate).
Docs `antivirus` (Ubuntu ClamAV) is excluded and must pass the permanent gate on its own.

## 2. Exact findings, from current scan evidence [V]

Alpine package index read 22 Nov ~14:10 UTC: v3.24/main `libssl3`/`libcrypto3` **3.5.9-r1** (built
2026-11-18 23:31:47), edge/main **3.5.9-r1** (2026-11-11). **No 3.5.10 anywhere.**

Latest scan before this work: munaxa-docs run [44900058536](https://github.com/munaxa/munaxa-docs/actions/runs/44900058536)
(docs#181, `docs-migrate`, Grype v0.121.2, DB built 2026-11-21T06:20:06Z). HIGH/CRITICAL findings,
complete list (no fix version published for any):

| CVE | `libssl3` 3.5.9-r1 (apk) | `libcrypto3` 3.5.9-r1 (apk) |
| --- | --- | --- |
| CVE-2026-124709 | High | High |
| CVE-2026-107494 | High | High |
| CVE-2026-121482 | High | High |
| CVE-2026-84786 | High | High |
| CVE-2026-107493 | High | High |

= **10 exact (CVE, package, version, type) combinations.** No CRITICAL. The same table appears for
every Alpine image (Identity, Control, Docs, Work). Medium findings in that scan (CVE-2026-95690,
CVE-2026-35190 on the same packages; GHSA-g3hv-75wg-m249 minimatch 10.2.6) do not fail the permanent
gate and are not touched by the exception.

Fresh confirmation 22 Nov: the CI image scans of docs#183, identity#26 and control#15 (file 03) ran
the permanent gate, which failed exactly as before, and the exception check accepted them; any
other HIGH/CRITICAL would have failed those jobs.

### 2.1 Control: the OpenSSL command-line tool is removed, not excepted

The first Control CI run with the exception (control#15) was **refused** by the check, correctly:
Control images also carried the Alpine `openssl` command-line package (`openssl@3.5.9-r1`), whose
findings are not in the 10 accepted combinations. Rather than widen the exception, control#15 removes
`openssl` from the Control runtime `apk add` and pin loop (it is not used at runtime; `libssl3` and
`libcrypto3` stay at 3.5.9-r1, `zlib` 1.4-r0 unchanged) and `verify-image.sh` now allows only
`ca-certificates` as an added package. The next run passed the permanent gate failure through the
exception with only the 10 listed findings. This is evidence that the exception fails closed on a
finding outside its list.

## 3. Design: the permanent gate is not modified

| Layer | File | What |
| --- | --- | --- |
| Permanent gate (unchanged) | `.github/scripts/scan-image.sh` | Grype `--fail-on high`, digest-pinned Syft/Grype, `.grype.yaml` rules. **SHA-256 `68c9f23ce5400790e5f41a099f4d8c55276ee4bafdab19bc60d5e1dd921acca2`, identical in Identity, Control and Docs, before and after.** `.grype.yaml` (Docs) still `ignore: []` |
| Gate verification | `.github/scripts/verify-permanent-gate.py` | Fails on: any byte change to `scan-image.sh`; any ignore rule or other Grype config file; `continue-on-error`, `GRYPE_*`, `--fail-on`/`--only-fixed` or `scan… \|\| true` in a workflow; a wrapper that passes `--now` or does not run the gate |
| Wrapper (temporary) | `.github/scripts/scan-image-testing.sh` | verify → permanent gate → **only if it failed** → exception check on that scan's own Grype JSON (stale report deleted first) |
| Exception check (temporary) | `.github/scripts/scan-exception.py` | Accepts only if **all** hold, else exit 1 (failure stands) |
| Exception data (temporary) | `.github/security/dssl-testing-exception.json` | id `D-SSL-2026-11`, environment `testing`, expiry, workflows, images, the 10 findings |

`scan-exception.py` accepts only when:

1. `--environment` is exactly `testing` (`production`, `prod`, `nonprod`, `Testing`, empty: refused);
2. the exception file exists, is valid JSON with **exactly** the expected keys, and stays inside
   **hard limits coded in the script**: packages {`libssl3`,`libcrypto3`}, version `3.5.9-r1`, type
   `apk`, the five CVEs, expiry ≤ 2026-12-01T00:00:00Z. Editing the JSON alone cannot widen anything;
3. the date is trustworthy: real clock (`--now` is refused inside GitHub Actions), not before
   2026-11-22T00:00:00Z, and consistent with the **Grype database build time** (an independent
   clock from Anchore: DB not newer than now + 1 h, not older than 7 days); a report without a DB
   time is refused;
4. now < expiry **and** DB build time < expiry;
5. in Actions, `GITHUB_WORKFLOW_REF` is a listed workflow (Docs: `ci.yml`, `publish-images.yml`;
   Identity: `ci.yml`, `publish-images-ecr.yml` (not the GHCR workflow); Control: `ci.yml`,
   `publish-images.yml`);
6. the image name is listed (Docs: `docs-api/web/worker/migrate`, `munaxa-docs-api/web/migrate`;
   Identity: `identity-runtime`, `identity-migrate`; Control: `control-api/migrate/portal`);
7. **every** HIGH/CRITICAL match equals one listed (CVE, package, version, type). A new CVE on the
   same package, another version (e.g. `3.5.9-r2`), another package or any CRITICAL fails.

Visibility: an accepted scan prints `::warning title=D-SSL temporary exception (<image>)::…`, a
"D-SSL temporary Testing-only exception USED" section in the job summary with the exception file
SHA-256, and writes `image-reports/<name>.dssl-exception.json` (decision, findings, expiry, DB time,
workflow), uploaded with the SBOM and the full Grype report (90-day artifacts). A refusal prints
`::error` and writes the reason to the same file.

## 4. Production exclusion (munaxa-platform, platform#159)

Images go to one shared ECR, so production is excluded at **deployment**:

| Rule | Where | Effect |
| --- | --- | --- |
| P-1 | `infra/aws/stack/tests/test_dssl_exception.py` (CI, required check) | While `dssl-exception.tf` exists, `envs/prod.tfvars` must be `images = {}` with no digest: no production deployment of any product image until the exception is removed |
| P-2 | `modules/image-exception-guard` (plan-time validation) | Production can never pin a digest in `dssl_testing_only_image_digests` |
| E-1 | same | From 2026-12-01T00:00:00Z (`plantimestamp()`), a Testing `up` (services or edge on) with a listed digest is refused; `down` still plans so cleanup is never blocked |
| T-1 | same | Expiry later than the hard cutoff, or a plan time that is unparsable or before 22 Nov: refused |

The module creates no resource, so every plan is unchanged (file 04). Each digest published under
the exception is added to `dssl_testing_only_image_digests` in the same PR that pins it.

Production publication: there is no separate production publish path; the publisher roles
(`munaxa-*-image-publisher`) are environment-agnostic, so an image is "production" only when a
production plan pins it, which P-1/P-2 refuse. Production deployment roles never see the exception.

## 5. Tests [V]

| Suite | Result |
| --- | --- |
| `python3 -I -m unittest discover -s .github/scripts -p 'test_scan_exception.py'` (each of Docs, Identity, Control) | **46 OK** ×3 locally; also run in CI before the scans |
| `terraform -chdir=infra/aws/modules/image-exception-guard test` | **13 passed** |
| `terraform -chdir=infra/aws/stack test` (with the guard wired) | **93 passed** (unchanged count) |
| `python3 -I -m unittest discover -s infra/aws/stack/tests -p 'test_dssl_exception.py'` | **4 OK** |

Coverage of the brief's list: allowed exact combination before expiry (and the last second);
unrelated CVE; unrelated package; unrelated version; unrelated CRITICAL; unrelated image
(`docs-antivirus`, `work-api`, `school-api`); production (6 spellings); after expiry (at and after
the instant; DB built after expiry); untrustworthy date (clock before decision, clock vs DB
disagreement both ways, no DB time, unparsable, no zone); missing / malformed / extra-key /
widened (expiry, environment, CVE, package, image named prod) exception file; a new CVE on the same
package not inherited; a CVE removed from the file no longer accepted; workflow not listed;
`--now` refused in Actions; local run needs an explicit flag; gate failed for a non-finding reason;
malformed report; permanent-gate tamper detection (ignore rule, extra Grype config, threshold change,
`continue-on-error`, `|| true`, `GRYPE_*`, `--only-fixed`, wrapper passing `--now`); end-to-end
wrapper with a fake `docker` (clean image passes without the exception; OpenSSL-only image accepted
in Testing; refused in production; unrelated HIGH fails; no exception file → gate failure stands).
Terraform: P-2, E-1 (up refused, down allowed, non-listed images still run), T-1 (late, malformed
expiry; early, unparsable clock), malformed digest.

## 6. Verification commands (anyone)

```sh
# in munaxa-docs, munaxa-identity or munaxa-control
python3 -I .github/scripts/verify-permanent-gate.py .
sha256sum .github/scripts/scan-image.sh   # 68c9f23ce5400790e5f41a099f4d8c55276ee4bafdab19bc60d5e1dd921acca2
# in munaxa-platform
python3 -I -m unittest discover -s infra/aws/stack/tests -p 'test_dssl_exception.py' -v
```

## 7. Removal procedure (on or after 1 Dec, once OpenSSL 3.5.10 is in Alpine v3.24/main)

1. [C] Update the bump PRs (identity#24, control#13, docs#182) to the exact published version; merge
   each only when its images pass the **permanent** gate with 0 HIGH / 0 CRITICAL.
2. [C] One PR per product repository: delete `scan-exception.py`, `scan-image-testing.sh`,
   `verify-permanent-gate.py`, `test_scan_exception.py`, `.github/security/dssl-testing-exception.json`,
   `docs/security/dssl-temporary-exception.md`; calls back to `scan-image.sh`; remove the CI step.
   `git grep -n -i 'dssl\|scan-image-testing'` must find nothing.
3. [C] munaxa-platform: move every `dssl_testing_only_image_digests` entry to `withdrawn-images.tf`
   (with a refusal test each), delete `dssl-exception.tf`, `modules/image-exception-guard`,
   `tests/test_dssl_exception.py` and the two CI lines, in one reviewed PR.
4. [C+yes] Publish 3.5.10 images, re-pin Testing (plan/apply approvals as usual).

If nothing is done, expiry alone already fails closed (scans and Testing `up`).
