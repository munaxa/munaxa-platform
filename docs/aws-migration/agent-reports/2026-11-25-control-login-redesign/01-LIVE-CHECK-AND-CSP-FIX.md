# Live check on Testing and the page CSP fix (26 Nov 2026)

**Outcome: the redesign reached Testing but rendered UNSTYLED; root cause found and fixed in the repository (identity#31, merged `7641300`); Identity re-pin PR prepared and HELD until today's Testing session is shut down.**

## 1. Go-live of identity#29

- Owner approved going live 25 Nov 19:49 UTC ("Approved"). Release run 45692576016 (tag `image/c721a8e…`, created by the owner in the combined release request): api `sha256:d24ee375…`, migrate `sha256:05487060…`.
- Pinned in the combined re-pin platform#191 (`7005500`, Docs thread), owner apply run 45702381509 (plan matched 11 declared replacements).
- 26 Nov session (up run 45803649296): read-only ECS at 11:11 UTC showed `munaxa-nonprod-identity:5` RUNNING, HEALTHY since 10:54:33 UTC, identity container `sha256:d24ee375…` [V].
- This container cannot reach operator-test (egress proxy 403, and the ALB admits operator IPs only), so the owner checked by eye.

## 2. What the owner saw

`screenshots/13-live-26nov-unstyled-owner-photo.jpg` (owner photo, 11:47 UTC): new copy and layout order, but no styles and a broken logo.

## 3. Root cause [V]

`apps/api/src/security/edge.middleware.ts` runs Platform's `securityPipeline({ apiOnly: true })`, which sets `content-security-policy: default-src 'none'; frame-ancestors 'none'; base-uri 'none'` (munaxa-platform `packages/platform/security/src/headers.ts`) on every route, pages included. Browsers then refuse the inline `<style>` and the `data:` logo. The pre-redesign pages used the same inline style and were blocked identically, which is why they always looked plain. The 25 Nov local screenshots were taken from files without that header, so they did not show it.

Reproduced in Chromium with the edge header: body unstyled, logo width 0, 2 CSP console errors (`screenshots/14-edge-csp-reproduced.png`).

## 4. Fix: identity#31, merged `7641300`

- `ui/layout.ts` `PAGE_CSP`: `default-src 'none'; style-src 'sha256-<the one stylesheet>'; img-src data:; frame-ancestors 'none'; base-uri 'none'`. No script source, no `'unsafe-inline'`. `form-action` unchanged (not governed by `default-src`).
- `withPageCsp(response)` sets it with `setHeader` on all 13 HTML responses (sign-in, MFA, password recovery). JSON responses keep the edge policy.
- Chromium with `PAGE_CSP`: styled, logo loaded, 0 CSP errors on sign-in and MFA (`screenshots/15-page-csp-fixed.png`).
- CI: first run failed 2/343 integration tests (`set is not a function` on the test's minimal response); fixed by using `setHeader`; then verify and image build green.
- Image (automatic Testing publish, identity#30 workflow) run 45815404306: api `sha256:cd3b3180a75778d04b1564f74eed8eea7e1622bbc21e72bae9ec4c66af7f09d9`, migrate `sha256:760e16b3e28cf8eb89827988d39b7ebc1c81db8f9d3a33d8336b49eed27b295c`, tags `testing-7641300`; ECR basic scan COMPLETE, 0 findings [V]. Listed in `dssl-exception.tf` like every Testing digest.

## 5. Re-pin (this PR, held)

`nonprod.tfvars`, `dssl-exception.tf`, `nonprod.stage-e-tasks.json`, `e1-task-guard.py` move the Identity pair from c721a8e to 7641300; declaration = 4 replacements (`identity_bootstrap`, `identity_probe`, `module.identity`, `module.migrate["identity"]` task definitions). Checks: `test_dssl_exception` 4/4, connector tests 114/114 OK.

Held unmerged until the Docs thread confirms today's `down` (F-3: a pin merged while a session is up makes `down` refuse). Then: merge, owner plan/apply (one click), and the next session shows the page; owner confirms by eye.
