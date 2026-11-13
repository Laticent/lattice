# `docs/patches/` — fixes to installed dependencies

`patch-package` applies every file here on `npm install` (`postinstall` in `docs/package.json`, with
`--error-on-fail`). Each file is named for the exact version it was made against. After a version bump, patch-package
re-applies the patch and **fails the install** if it no longer applies, so a stale patch cannot slip through silently.
When the bumped package already contains the fix, delete the patch file.

| Patch | What it fixes | Drop it when |
|---|---|---|
| `sonner+2.0.7.patch` | The `visibilitychange` listener is removed from `window` instead of `document`, so it leaks. | sonner ships the same fix. |
| `playwright-core+1.56.1.patch` | `FrameManager.frameCommittedNewDocumentNavigation` reads a frame without checking it exists. Firefox reports a navigation for a frame Playwright already dropped when a page re-inserts an iframe (the preview does, `docs/src/lib/srcdoc-write.js`), and the `gecko` project crashed with `reading 'childFrames'`. The patch adds the same guard its same-document twin already has. Test-only: Playwright never ships to users. | Playwright ships the guard upstream (it is missing on `main` as of 2026-11-12). Record: `engineering/decisions/2026-11-12-gecko-srcdoc-rewrite-controller.md` §7. |
