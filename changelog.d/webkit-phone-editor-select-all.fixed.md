- **Fixed: `setEditorContent` replaced the deck instead of appending to it on the
  `webkit-phone` e2e project.** Playwright resolves `ControlOrMeta` against the OS the test
  process runs on (Linux, so `Control`), while CodeMirror resolves `Mod-` against what the
  page reports — and the iPhone user agent puts it in Mac mode, where `Mod` is Meta and a
  bare `Ctrl-a` moves the caret to the line start instead. The select-all missed, so every
  deck a spec set landed on top of the one the Studio had already loaded. The helper now
  presses, checks the real selection, and takes the other modifier if the first did nothing.
  `webkit-tablet` was never affected: it reports a Mac user agent but CodeMirror keys off
  `navigator.platform` and the UA's `Mobile/` token, neither of which that project carries.
- **Fixed: tagging a `@crosswidth` spec `@webkit-phone` silently dropped it from the desktop
  project.** The `desktop` project's `grepInvert` read `@webkit` as "mentions webkit", so a
  spec that gained a WebKit run traded away the desktop run it already had. It now reads
  "webkit-exclusive", which leaves every webkit-only spec routed exactly as before.
- **Changed: the two render-target lint arms now also run on real WebKit at iPhone 15 Pro.**
  Their oracle reads a painted box and asks CodeMirror which document line sits under it, so
  it is engine text layout — the class a Chromium project cannot stand in for.
