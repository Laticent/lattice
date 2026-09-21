- **Fixed: the showcase gallery's freshness check now sees engine changes.**
  `tools/build-showcase-galleries.js` decided freshness by recomposing the deck
  from the chart manifests and string-comparing it to the committed `.md`. A
  change to engine CSS or a chart transform moves every rendered slide and no
  manifest, so the comparison stayed byte-identical and the tool printed
  "already fresh" over stale PDFs. It now also asks `tools/lib/render-inputs.js`
  whether anything a render consumes changed without the PDF being rebuilt —
  the same question the component and bucket gallery builders already ask. One
  `git status`, no Chromium.
- **Fixed: the dark showcase PDF was never rebuilt after a manifest change.**
  `buildOne` recomputed "does the committed deck match the manifests?" per
  theme, and the light pass *writes* that deck — so the dark pass compared
  against the file light had just written, found it identical and skipped. The
  answer is now measured once per showcase, before any theme renders.
- **Added: `build-showcase-galleries.js --dry-run`.** Reports what a build would
  rebuild, and why, without spending a render.
- **Changed: `changedPaths()` in `tools/lib/render-inputs.js` queries the whole
  working tree** instead of scoping git to `lib/ themes/ dist/`. The scope was
  an optimization that doubled as a semantic: an artifact outside those roots
  could never appear in the changed set, so the helper's "this PDF was already
  rebuilt in this tree" arm could not fire for the showcase gallery, whose PDFs
  live in `examples/`. `isRenderInput` still decides what counts as an input.
