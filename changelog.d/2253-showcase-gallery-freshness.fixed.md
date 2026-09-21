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
  Measured cost: about 5ms on one memoized `git status`.
- **Fixed: a freshness gate that went GREEN after the second edit.** The arm above
  answered "already rebuilt in this tree" from the fact that the artifact was
  dirty, which is only true if nothing changed *after* that rebuild. So the loop
  edit → build → edit again reported "deck, PDF and render inputs all match" while
  the artifact showed the first edit — the same failure this change set out to fix,
  one iteration later. The arm now asks whether the artifact is newer than the
  newest changed input. This also closes the hole for the component and bucket
  gallery gates, where it was reachable already.
- **Changed: `build:showcase-galleries:check` is red more often, on purpose.** Any
  uncommitted `.css`/`.js` under `lib/`, `themes/` or `dist/` now makes the
  showcase PDFs stale — the same posture the component and bucket gates already
  have. It is on-demand and the pre-commit rebuild, so no CI tax.
- **Fixed: `--check` and the build could disagree.** `--check` had no size floor, so
  a truncated PDF passed the gate and failed the build. And "git cannot answer" no
  longer reports as "everything matches" — it says it was not checked.
