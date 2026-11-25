# Docs add-document dialog fits the screen (25 Nov 2026)

**Status: FIXED IN REPO, on munaxa-docs main as `a523f44` (PR munaxa-docs#185). Nothing published, applied or deployed.** It reaches Testing with the next Docs image built from munaxa-docs main (the same image the demo starter work, docs#184, needs).

Requested by Tamer, 25 Nov 2026 14:00 UTC: "when adding a document, the wizard is in vertical outside the screen, try to make it square and rearrange the fields to fit to the screen".

## Cause

- `apps/web/src/features/documents/upload-dialog.tsx` (the "Add documents" / "Scan documents" dialog) rendered everything in one column inside the platform `Dialog` (default width `max-w-lg`, 512px): dropzone, file list, Document type, Category, Confidentiality, Description and every metadata field of the chosen type.
- The platform `Dialog` (`@munaxa/ui` 1.1.1, `packages/platform/ui/components/feedback/dialog.tsx`) centres the panel in a fixed overlay and sets no maximum height and no scrolling body. A panel taller than the window is cut off at the top and bottom, so the title and the Cancel / File buttons could not be reached.

## Fix (munaxa-docs, web only, 2 files)

| File | Change |
|---|---|
| `apps/web/src/features/admin-shared/form-dialog.tsx` | Form body capped at `calc(100dvh - 12.5rem)` (measured dialog chrome) and scrolls inside itself, so title and footer buttons always stay visible. Applies to all `FormDialog` forms. New optional `size="wide"` (`max-w-5xl`, 1024px, full width on small screens). |
| `apps/web/src/features/documents/upload-dialog.tsx` | `size="wide"`. On screens 1024px and wider: two columns. Left: Files (dropzone, file list, warnings) and Details (description). Right: Classification (Document type; Category and Confidentiality side by side) and the type's metadata fields two per row. Below 1024px: one column, scrolling inside the dialog. DOM order equals visual order. |

No API, contract, translation, database or infrastructure change. The platform `Dialog` is unchanged (a height cap there would need a new `@munaxa/ui` release; the Docs-side fix covers it).

## Evidence

Measured in Chromium (Playwright) on a static mock that uses the same Tailwind classes and the platform `Dialog` structure, with a document type of 4 metadata fields and 2 files added. This is a mock, not the running app: the private `@munaxa/*` packages could not be installed in the session, so the real app was not rendered. Typecheck, lint and tests run in munaxa-docs CI.

| Viewport | Before: panel top / height (px) | After: panel top / height (px) | After: inner scroll |
|---|---|---|---|
| 1366x657 (laptop) | -297 / 1252 | 17 / 623 | none (453 of 453) |
| 1280x600 | -326 / 1252 | 15 / 570 | 53px, buttons visible |
| 1920x960 | -146 / 1252 | 169 / 623 | none |
| 390x760 (phone) | -246 / 1252 | 15 / 730 | yes, buttons visible |

Screenshots: [before-laptop.png](before-laptop.png), [after-laptop.png](after-laptop.png), [after-phone.png](after-phone.png).

## Links

- PR: https://github.com/munaxa/munaxa-docs/pull/185, head `86214cb`, rebased onto main as `a523f44` (parent `bfdbae0`, docs#184), 25 Nov ~15:42 UTC under the standing merge rule. Tree identical to the tested head.

## CI

All 12 jobs green on `86214cb` in run 45630187450. In the parallel run 45630135364, "End-to-end · signing, faded text and search" failed once on `search.e2e.spec.ts:740` (tenant administrator opens a search result, `waitForURL` 30s timeout); 73/74 passed, including all faded-text (contrast) checks. The test does not open any dialog and the diff does not touch search. Re-run once at 15:38 UTC: green. Explained on the PR (comment 7164870604).

The re-run started about 80 minutes late: the run finished at 14:14 UTC and this thread missed it (no completion notice was received), which is why the PR looked stuck to the owner.

## Owner actions

None for this change. To see it in Testing, the next Docs image (planned with the demo starter work before 1 Dec) must be built from main after the merge.
