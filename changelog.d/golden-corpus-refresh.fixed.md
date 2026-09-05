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
