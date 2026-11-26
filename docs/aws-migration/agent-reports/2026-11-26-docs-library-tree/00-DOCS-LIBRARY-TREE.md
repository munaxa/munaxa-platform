# Docs: libraries tree, remembered folder, remove a chosen file, notifications page, Check in from the library (26 Nov 2026)

Owner requests (Tamer, 26 Nov 2026) in the Docs workspace:

1. Show libraries as a tree, not a drop-down.
2. Coming back to Documents from another tab reopens the same folder.
3. In Add documents, each chosen file has a Remove button.
4. The notifications page was "not decorated".
5. A checked-out document should have a Check in beside it in the library (owner chose "Yes, add it").

A sixth report ("approve as admin says no permission") was routed to its own thread, fixed in
munaxa-docs#190 (report `2026-11-26-docs-admin-approval-permission/`).

## Result

| Change | Pull request | Main commit |
| --- | --- | --- |
| Libraries tree, remembered folder, remove a chosen file, notifications page | munaxa-docs#189 | `d6a44a0` |
| Check in from the library | munaxa-docs#191 | `75cdcc3` |

Both merged under the standing merge rule (all required checks green, no high findings, nothing
deploys on merge).

### What changed

- **Libraries tree (`folder-tree.tsx`).** The library drop-down is gone. Libraries are the top level of
  one `TreeView` (platform APG tree); the selected library's folders hang beneath its row (the root
  folder is the library row). Selection is `aria-current`; each row is a link.
- **Remembered location (`last-location.ts`, `documents/page.tsx`).** The current folder is written to
  a browser cookie `edms_docs_location` (`<libraryId>.<folderId>`, 30 days, SameSite=Lax, Secure on
  https) and the open branches to localStorage `edms.docs.rail.expanded` (max 500 ids). A bare
  `/documents` redirects to the remembered folder only if the library is one the caller can list and
  the folder still reads back in that library; otherwise the library top. The cookie is written by the
  browser on purpose: in Next 15 a cookie set from a server action re-renders the route. It holds only
  two UUIDs and grants nothing.
- **Remove a chosen file (`upload-dialog.tsx`).** Each row has a Remove button; an upload in flight is
  aborted with an `AbortController`, and closing the dialog aborts all.
- **Notifications page.** Docs v2 cards, an All / Unread switch, a type icon per notification, unread
  accent, empty state.
- **Check in from the library.** The list summary (`DocumentSummary`) now carries `liveLock`, the same
  shape as the record (one mapper). The title cell shows "Checked out by you / by {name} / Checked
  out"; the holder with `document:checkin` gets a Check in button there and in the row menu. It opens
  the record's own check-in dialog, so the file becomes the next revision of the same document and its
  fields stay as they are. Expired check-outs are not marked.

### Tests

- #189: new `folder-tree.spec.tsx` (30), `last-location.spec.ts`, `upload-dialog.spec.tsx` (4),
  six "coming back to Documents" cases in `documents/page.spec.ts`.
- #191: `library-checkin.spec.tsx` (7). Web logic and a11y suite 532/532; web and API typecheck clean.
- **Visual baselines.** 16 baselines that draw the rail were deleted (folder-tree, document-list and
  Arabic/mobile/tablet variants) because local renders differ from CI (fonts) and the CI artifact could
  not be downloaded from the agent session (proxy 403). The harness writes a missing baseline on the
  next run. **Follow-up:** commit the CI-written baselines from a CI artifact so they guard again.
- One required check ("End-to-end · the screens") failed once on an apt mirror 404 while installing
  Playwright; re-run once, green.

## Testing deployment

Owner said yes to deploying to Testing (11:42 UTC) and "Proceed" (12:31 UTC).

- Images published automatically from main by `publish-images-testing.yml` run 45822198363
  (`testing-75cdcc3`): api `sha256:62a563cb…dd693`, web `sha256:224bc621…153ee`, migrate
  `sha256:b5afba10…8c5c5`. Grype finds libssl3/libcrypto3 3.5.9-r1, so all three are listed in
  `dssl-exception.tf` under D-SSL-2026-11 (expires 2026-12-01T00:00:00Z).
- Pin folded into the Identity re-pin PR (platform#196) as one declaration: eight task definitions
  replaced (4 Identity, 4 Docs: docs-api, docs-web, docs-migrate, docs-provision). Services stay off.
- **Database update.** Docs API `75cdcc3` refuses to serve until its database has every migration this
  build carries (`schema-readiness.ts`), and `75cdcc3` adds `20261126120000_approver_decision_keys`
  (docs#190: grants document:approve/reject on the Approver and Library manager system roles). So the
  session must run `docs-migrate` once before the API becomes healthy. Asked the owner on a decision
  card; outcome recorded in file 01 once the session runs.
