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
  Measured cost: about 6ms on one memoized `git status` — 18.1ms whole-tree against
  11.9ms scoped, median of seven runs after a warmup.
- **Known limit, now written down and pinned by a test: a dirty PDF still reads
  fresh.** That arm answers "already rebuilt in this tree" from the artifact being
  dirty, which only holds if nothing changed *after* the rebuild — so edit → build →
  edit again reports "all match" while the artifact shows the first edit. It predates
  this change and the component and bucket gates share it. An mtime comparison was
  tried here and **reverted**, because it is unsound in both directions: `git stash
  pop` restores dirty inputs and a dirty artifact together, so their relative mtimes
  become checkout order and a zero-content-change tree reports stale, and a *deleted*
  input stats as absent, sorts oldest and reads fresh. Both were measured. The sound
  fix is content-addressed — have the builder write the hash of the inputs it consumed
  beside the artifact — and is its own change.
- **Changed: `build:showcase-galleries:check` is red more often, on purpose.** Any
  uncommitted `.css`/`.js` under `lib/` or `themes/` now makes the showcase PDFs
  stale — the same posture the component and bucket gates already have. It is
  on-demand and the pre-commit rebuild, so no CI tax.
  **Two scope limits, both measured rather than assumed.** `dist/` is in the
  classifier's prefix list and is unreachable through it: `.gitignore` carries a bare
  `dist/`, and `git status --porcelain` never lists an ignored path, so appending to
  `dist/lattice.css` leaves the check green. And the tool has **no automatic trigger for
  this case** — it is invoked only by `tools/build-staged-pdfs.js`, whose `classify()`
  returns `null` for every `.css`/`.js` render input, under a pre-commit job whose glob
  is markdown-only by design ("component CSS / shared CSS / engine changes affect many
  decks at once and stay in CI"). So the fix makes the tool answer correctly **when it
  runs**; it does not make it run on a CSS-only commit.
- **Fixed: `--check` and the build could disagree.** `--check` had no size floor, so
  a truncated PDF passed the gate and failed the build. And "git cannot answer" no
  longer reports as "everything matches" — it says it was not checked.
