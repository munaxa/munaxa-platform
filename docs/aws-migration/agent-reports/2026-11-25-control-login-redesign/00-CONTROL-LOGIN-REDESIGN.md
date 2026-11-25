# Control operator portal sign-in redesign (25 Nov 2026)

**Outcome: DONE in the repository, NOT deployed.** The operator-test.munaxa.com sign-in page now uses the Munaxa Docs sign-in layout in the Munaxa Group colours. Change: munaxa-identity PR #29, MERGED 25 Nov 19:45 UTC as `c721a8e` (CI verify + image build green on head `74d8a75`; merging publishes and deploys nothing). Nothing was published, applied or changed in AWS, DNS or Cloudflare.

Owner request (Tamer, 25 Nov 19:35 UTC): "redesign the operator-test.munaxa.com to be as munaxa docs login page but use munaxa colors".

## 1. Where the page comes from

- munaxa-control `apps/portal/src/middleware.ts`: a visitor without the `__Host-mx_session` cookie is redirected to `/api/auth/login?returnTo=...`. The portal has no login page of its own.
- `/api/auth/*` is served by Munaxa Identity: `apps/api/src/auth/auth.controller.ts` `GET login` returns `signInPage(...)` from `apps/api/src/ui/sign-in.page.ts`, plain HTML with no script.
- The console behind sign-in already uses the platform `AppShell` with the corporate (Group) theme (`apps/portal/src/app/globals.css` imports `@munaxa/theme/css/corporate`), so it was not changed.

Consequence: the same Identity pages are also the front door of Munaxa Work, so Work's sign-in gets the same look.

## 2. Reference and palette

- Layout reference: munaxa-docs `apps/web/src/app/(auth)/layout.tsx` and `login/login-form.tsx` (Docs v2): muted page, one 380 px card, 14 px radius, card shadow, logo at the head of the card, theme and language controls at the top right, "Access is logged to the audit trail." under the card; platform `Field` (monospace uppercase labels, red asterisk), `Input` (36 px), solid `Button`, toned `Alert`.
- Colours: munaxa-platform `packages/platform/themes/group/palette.css` (brand `#2B3A67`, primary ramp, semantic roles, dark scheme) and `themes/base/base.css` (`--shadow-card`).
- Mark: `packages/platform/assets/group/logos/symbol.png` (Group symbol). The corporate identity has no lockup (`brand/products.ts`), so the wordmark `munaxa.` is set as text beside it, as that file prescribes.

## 3. What changed (identity#29)

| File | Change |
|---|---|
| `apps/api/src/ui/layout.ts` (new) | Shared frame: Group palette (light, and dark via `prefers-color-scheme`), card, brand row, language chip, audit line, `field()` and `alert()` helpers, shared `escapeHtml`. Symbol inlined as a 1,207-byte PNG data URI (cropped to the artwork, 91x60 px, 32 colours; sha256 `c974f894...f8ed033`). |
| `apps/api/src/ui/sign-in.page.ts` | Renders into the frame. Lead text changed from "Munaxa Identity signs you in. Munaxa Work never sees your password." (wrong on Control) to "Use your Munaxa account to continue. Only Munaxa Identity sees your password." (Arabic updated too). `spellcheck="false"` added to the organisation field, as Docs does. |
| `apps/api/src/ui/mfa.page.ts` | Same frame for the second-factor pages (operators go through these because Control requires MFA). |
| `apps/api/src/ui/password-recovery.page.ts` | Same frame for the recovery pages. |

Unchanged: `auth.controller.ts`, every form `action`, field `name`, `id`, `autocomplete`, `required`, hidden input, and the `organisationRequired` logic. Still no JavaScript and no external request. No theme toggle (Docs has a scripted one); the scheme follows the device.

## 4. Verification (local)

- Rendered every page variant with Node (`--experimental-strip-types`) before and after; diffed the `<form>`, `<input>` and `<button>` tags: identical apart from CSS classes and the one added `spellcheck`.
- No `<script>` in any output; a `returnTo` of `"><script>x</script>&'` is escaped in the hidden input and URL-encoded in the language link.
- Prettier (repo config) and `tsc --noEmit` with the api tsconfig strict options on the four files: pass. The full workspace could not be installed here (private GitHub Packages), so CI on identity#29 is the full check.
- Screenshots with Chromium at 1280x800, scale 2, in `screenshots/`:
  - `01-reference-docs-login.png`: Docs login **reconstructed from munaxa-docs source** with the Docs palette and lockup (the Docs app was not run here; Docs Testing is shut down).
  - `02-before-sign-in.png`: current operator-test sign-in.
  - `03-after-sign-in.png`, `04-after-sign-in-error.png`, `05-after-sign-in-dark.png`, `06-after-sign-in-arabic.png`, `07-after-sign-in-phone.png` (390 px).
  - `08-before-mfa.png`, `09-after-mfa.png`, `10-after-mfa-recovery-codes.png`, `11-after-password-forgot.png`, `12-after-password-reset.png`.

## 5. Coordination

The "Auto-fill tenant identifier in Control" thread also touches the sign-in flow. It was told which Identity files this change edits and that field names and the organisation logic are unchanged; whichever merges second rebases.

## 6. To see it on operator-test (owner decision, not done)

The Testing Identity service runs a pinned image. Showing the new page needs: build and publish Identity images from main after identity#29, pin the new digest in the nonprod configuration, and apply in a Testing session. Each of those needs Tamer's yes.
