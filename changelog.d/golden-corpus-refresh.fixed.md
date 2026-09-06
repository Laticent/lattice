- **The committed golden corpus is fresh again — 114 of 286 goldens were stale.** `npm run
  regress` on a clean `main` drifted 110 of 211 deck goldens and 4 of 75 gallery pairs
  (`comparison`, `evidence`, `kpi`, `authority-chain`). The corpus had not been swept since
  #1983 on 2026-09-01, and eight render-input PRs merged after it — the `cards:` register
  (#2011), auto-split (#2016, #2042), the universal coda (#2018), the table family's outer
  edge (#2055), `list-tabular`'s responsive columns (#2059) — each blessing what it touched
  directly and leaving the rest. Deck goldens are promoted individually rather than by a
  blanket re-render, so only what actually drifted is rewritten.
- **A red gate reports nothing, which is the reason this matters.** While `regress` is red
  across a deck it cannot surface a NEW regression in that deck. Refreshing the corpus found
  one that was hiding: `examples/gallery-jargon` slide 15 renders a `Content clipped` stamp
  and cuts row 06 in half.
- **Checked, not assumed.** No golden changed page count, so
  `2026-08-24-golden-corpus-re-bless.md` §5b ("a page-count flip is restored and reported")
  had nothing to restore — and `examples/portrait-roadmap`, the artifact that note exempts,
  matches its 8-page golden on this host. A `pdftotext` word-multiset diff leaves 113 of 118
  refreshed goldens word-identical; three of the five deltas are extraction artifacts where a
  wrap position moved (`derisk` → `de risk`).
- **Fixed: `examples/gallery-jargon` slide 15 no longer ships cut off.** #2059 capped
  `list-tabular`'s trailing column at `fit-content(26cqi)` while the description column
  kept taking every remaining pixel, so a ledger of six phrase-length metas wrapped all
  six rows to two lines where three had wrapped before, outgrew the stage, and lost its
  tail. The slide takes `flex-meta` — the modifier that component documents for a
  trailing column carrying a phrase rather than a stamp — and now renders every meta on
  one line. A 289-deck overflow sweep says it was the only slide in the corpus that
  clipped, so #2059's default is unchanged.
- **Fixed: `examples/accent-on-accent`'s golden showed the wrong theme.** The deck declares
  `theme: atelier-dark`; the committed PDF had been rendered with `indaco`, the engine
  default — measured by re-rendering at three palettes and pixel-diffing each against the
  old golden (`indaco` 10.1%, `atelier` 100%, `cuoio` 100%). The engine is not at fault:
  `resolve-palette.js` is byte-unchanged since that golden was blessed, the producer passes
  no palette argument, and the deck renders `atelier-dark` deterministically today. A CLI
  palette argument or an exported `LATTICE_PALETTE` outranks a deck's own front matter, and
  nothing reports the substitution — so a golden can be blessed against a theme its deck
  never asked for.
- **The docs site's showcase rasters follow the gallery goldens.** Re-blessing the `kpi`
  gallery left `docs/public/showcase/kpi.{light,dark}.webp` stale, which fails
  `docs/scripts/rasterize-showcase.mjs --check` and takes the `docs-build` and `preview`
  jobs with it. Regenerated. A gallery bless owes this whenever the blessed gallery is one
  of the 30 the showcase samples.
- **Fixed: `themes/palette-audit` shipped two slides that lost content.** A corpus-wide scan of
  every committed golden's text layer for the engine's `Content clipped` tag found 9 clipped
  slides across 5 artifacts. Six are deliberate — `examples/overflow-fix-me` exists to
  demonstrate overflow, `examples/marker-corner` renders the corner collision on purpose, and
  `premise.gallery` p3 is a labelled stress test of the eight-row ceiling. The other two were
  real: the audit deck's opening slide was a `title` layout carrying a six-line Key Insight
  blockquote, which the title component has no slot for, so the panel occluded the lede; and the
  scoring slide silently dropped its `Hue coverage — 5 pts` bullet. Both were `title` slides
  doing a content slide's job, and both now carry their prose on a `content` slide. The deck
  goes from 2 content-losing slides to 0, and from 1 overflow warning to none.
- **A hard-wrapped paragraph is a taller paragraph.** `lib/engine/index.js` sets markdown-it's
  `breaks: true` (matching marp-core), so every newline inside a paragraph or blockquote renders
  as a `<br>`. The audit deck's Key Insight was wrapped at ~100 columns in the source and got one
  hard break per source line, inflating the panel well past what the text needs. Unwrapping the
  source, not cutting the words, is what made it fit.
- **Fixed: a unit test enumerated scratch files as "committed decks".**
  `slide-boundaries.test.js` walks the working tree for `*.md`, and `regression-gate.mjs`
  writes transient `.regr-<name>.dark.md` sources beside the real galleries while it renders
  (it must — the emulator resolves a deck's relative assets against the OUTPUT directory).
  Running the unit suite during a corpus sweep therefore failed with a bare `ENOENT` on a file
  that had already been cleaned up. That is the exact pairing a golden refresh performs, and it
  cost a full debugging cycle before the pre-push hook caught it with the filename attached.
  Dotfiles are now excluded; 306 committed decks are still enumerated.
- **Also blessed: `list-tabular`'s gallery pair, whose drift arrived from #2066 mid-review.** The
  `{LABEL}` pill work moved the trailing meta column down by exactly 0.75pt and its committed
  golden predates that. Established as real geometry rather than cross-host rasterization by
  comparing the PDF TEXT LAYER's bounding boxes: the x-coordinates are byte-identical and every
  affected value's y shifted by the same 0.75pt — a difference in rasterization cannot move a
  text-layer coordinate at all. This branch touches no `list-tabular` file, so the drift
  reproduces on `main`; it is blessed here because this is the PR whose subject is corpus
  freshness, and merging it while knowingly leaving a stale golden would falsify its own claim.
