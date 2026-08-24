- **The committed golden corpus is fresh again — 184 of 199 deck goldens were stale.** The
  nightly freshness gate (`npm run regress`, wired report-only the previous night) reported
  196 of 349 committed PDFs drifted on two consecutive runs of the same commit, with the
  drifted set identical between them and one member reproducing on a different host at the
  same worst-page figure. That is staleness, not cross-runner rasterization noise, so every
  drifted golden is re-rendered here — 183 of them. The `examples/`, `exemplars/`, `design/`
  and `themes/palette-audit` PDFs a reader opens now match what the engine actually renders.
  Content was checked rather than assumed: a `pdftotext` multiset diff across all 184 leaves
  182 word-identical, and the two that move lose only repeated per-slide chrome or *recover* an
  authored line the golden had dropped. `examples/portrait-roadmap` is deliberately left alone
  — it is the corpus's only page-count flip, and a shipped decision note already weighed and
  declined that re-bless. The gallery half needed nothing: 75 of 75 already current.
- **`regression-gate.mjs --bless` says what its default did not cover.** `--bless` with no
  `--scope` means galleries (deliberately — the deck bless is a multi-hour sweep nobody wants
  as a side effect), while `--check` means everything. The corpus rotted exactly along that
  seam: 92% of deck goldens stale against 8% of gallery goldens, and the three most recent
  blesses had all taken the default. The command now prints that the deck scope was untouched
  and names the flag that reaches it. It does not go and measure the deck drift — that would
  defeat the reason the default is narrow.
