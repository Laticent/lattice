# `docs/patches/` — fixes to installed dependencies

`patch-package` applies every file here on `npm install` (`postinstall` in `docs/package.json`, with
`--error-on-fail`). Each file is named for the exact version it was made against. After a version bump, patch-package
re-applies the patch and **fails the install** if it no longer applies, so a stale patch cannot slip through silently.
When the bumped package already contains the fix, delete the patch file.

No patch is active today. When you add one, list it here:

| Patch | What it fixes | Drop it when |
|---|---|---|

**Retired:** `sonner+2.0.7.patch` (2026-11-20). sonner removed its `visibilitychange` listener from `window` instead of
`document`, so the listener leaked; 2.0.8 ships the same one-line fix, and the old patch no longer applied to it.

**Retired:** `playwright-core+1.56.1.patch` (2026-11-20). It guarded `FrameManager.frameCommittedNewDocumentNavigation`
against a frame Firefox 142 reported after Playwright had dropped it. Playwright 1.65.1 still lacks the guard in source,
but its Firefox 159 no longer sends that navigation: `studio-warm-offline` on gecko failed 5 of 10 unpatched on 1.56.1
and passed 60 of 60 unpatched on 1.65.1. If the `reading 'childFrames'` crash comes back, re-add the guard against the
installed version (`lib/coreBundle.js` now) and see `engineering/gotchas/browser-engine.md`.
