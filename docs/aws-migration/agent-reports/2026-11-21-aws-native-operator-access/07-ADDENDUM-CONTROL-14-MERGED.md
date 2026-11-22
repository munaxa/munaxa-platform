# 07. Addendum (22 Nov 2026): munaxa-control#14 merged

- On 22 Nov 2026 the owner made decision D-SSL in another thread: a **temporary, Testing-only**
  OpenSSL exception that expires at 2026-12-01T00:00:00Z (munaxa-control#15, `6269a9c`). The
  permanent gate (Grype `--fail-on high`, no ignore rule) still runs first, and the exception
  accepts only the 10 exact OpenSSL 3.5.9-r1 `libssl3`/`libcrypto3` findings. This task did not
  make or change that decision.
- The owner merged `main` into the control#14 branch (`620b238`). Both required checks then passed
  on that head: "Format · Lint · Typecheck · Test · Build" and "Build the images" (run 45033776310).
- Claude squash-merged **control#14** under the standing rule as **`e9fb445`**.
- Corrections to files 00, 02, 04 and 06: control#14 is **merged**, not open or blocked. B-2 in
  file 06 is closed. B-1 (D-SSL) is now governed by the owner's exception until 1 Dec. The
  session 2 preamble's "merge control#14" step in file 05 is done.
- Still the case: no AWS resource was changed, no image was published and no service was started
  by this task.
