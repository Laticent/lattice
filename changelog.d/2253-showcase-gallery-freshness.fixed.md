- **Fixed: the showcase gallery's freshness check now sees engine changes.**
  `tools/build-showcase-galleries.js` decided freshness by recomposing the deck from the
  chart manifests and string-comparing it to the committed `.md`. Engine CSS and chart
  transforms move every rendered slide and no manifest, so the compare stayed
  byte-identical and the tool printed "already fresh" over stale PDFs. It now also asks
  `tools/lib/render-inputs.js` whether anything a render consumes changed without the PDF
  being rebuilt — the same question the component and bucket builders already ask. One
  memoized `git status`, no Chromium, about 5ms (p50 13.1 -> 17.8ms, 25 interleaved reps).
- **Fixed: the dark showcase PDF was never rebuilt after a manifest change.** `buildOne`
  recomputed "does the committed deck match the manifests?" per theme, and the light pass
  *writes* that deck — so the dark pass compared against what light had just written,
  found it identical and skipped. The answer is now measured once per showcase, before
  any theme renders.
- **Fixed: "git cannot answer" no longer reports as "everything matches".** That reason
  reached no output: all three fresh paths printed the same `already fresh` line and threw
  it away. It now prints once per run.
- **Added: `build-showcase-galleries.js --dry-run`** — what a build would rebuild, and
  why, without spending a render.
- **Changed: `changedPaths()` queries the whole working tree** instead of scoping git to
  `lib/ themes/ dist/`. That scope doubled as a semantic, so an artifact outside those
  roots could never appear in the changed set — which is where the showcase PDFs live.
- **Three scope limits, measured rather than assumed.** A dirty PDF still short-circuits
  to "fresh", so edit → build → edit again reports fresh; that predates this change, the
  component and bucket gates share it, and the sound fix is content-addressed. `dist/` is
  in the classifier's prefix list and unreachable through it, because it is gitignored and
  `git status` never lists an ignored path. And there is **no automatic trigger** for a
  CSS-only commit: the tool's only automated caller classifies every `.css`/`.js` render
  input as `null`, under a pre-commit job whose glob is markdown-only by design.
