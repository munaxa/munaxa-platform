# D-SSL probe (identity branch `claude/project-thread-4sspd9`, 21 Nov 2026)

These files are copies of the temporary probe. They were committed on the identity branch as
a99be6c, 6b3f273 and 8d8c70a. Nothing was merged, and the branch was later reset to carry
identity#24. They are stored as `.txt` so that no tool in this repository runs them.

| Run | What |
| --- | --- |
| 44907610997 | Round 4 (a99be6c): first Wolfi and Alpine builds of Identity; the production boot failed because REDIS_URL had no password (fixed in 4b) |
| 44907849133 | Round 5: upstream facts, the OpenSSL advisory, Alpine MRs, Debian tracker, Grype records |
| 44908117323 | Round 4b: Wolfi and Alpine images, each migrated, booted in production mode, health-checked, unit-tested and scanned (file 01 §3) |

The run logs and the `d-ssl-alpine` and `d-ssl-wolfi` artifacts (scan reports) are kept in the
munaxa-identity Actions history.
