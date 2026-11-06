- **Fixed: the Studio raster-export marker spec read the wrong pixel, so its images and PowerPoint arms failed on every
  engine while the exports were right.** The reader pill ("Content clipped") is in both pictures. Its rail stands one
  spectrum-bar width above the slide's bottom edge, so on a 2560×1440 picture the pill spans rows 1400–1431, and the
  spec sampled row 1437. `docs/e2e/studio-raster-export-marker.spec.ts` now samples at 98.2% of the height, which is
  inside the pill at every size measured, and each arm also checks that the slide that fits has no pill there, so the
  oracle can fail.
- **Fixed: a Studio command palette that was already open never showed a row that started to apply while it was
  open.** "Fix all issues" joins the list once lint has counted a fixable issue, often after ⌘K opened, and an open
  palette filtered to "Fix all" never listed it, even after a retype; only closing and reopening did. cmdk took each
  row's value from its rendered text, and a row that did not match yet rendered nothing, so it never got a value to
  match on. The Actions, Layout, Switch deck and Theme rows now name their `value` (the Learn rows stay mounted, so they never hit it). `docs/e2e/studio-palette-late-row.spec.ts` holds lint back at the
  network until the palette is filtered, then waits for the row without closing; it fails on the old code in Chromium,
  Gecko and WebKit at desktop and phone widths.
