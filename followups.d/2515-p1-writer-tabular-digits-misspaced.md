---
origin: 2515
priority: P1
recorded: 2026-10-05
source: https://github.com/Laticent/lattice/pull/2515
---

# The PDF writer mis-spaces tabular digits and drops them from the copied text

The shared writer (`lib/core/pdf-compose`) draws digits set with tabular figures in the wrong
places, and leaves them out of the PDF's text layer. On
`test/integration/baseline-decks/gallery.pdf` page 27 (the glossary), "24 hours" renders as
"2 4hours" and "30-day onboarding" as "3 0 -dayonboarding"; `pdftotext` reads both lines with
the digits missing. The glossary table sets `font-feature-settings: 'tnum' 1`
(`lib/components/inventory/glossary/glossary.styles.css:19`). 13 engine stylesheets ask for
tabular figures (tables, KPIs, charts), so this reaches every CLI export that sets digits in
one of them.

```text
  P1 · [followups.d/2515-p1-writer-tabular-digits-misspaced.md] fix in the writer
       why now   — a boardroom-visible defect in every CLI PDF export with tabular digits,
                   since #2404 made the writer the CLI's default; the committed goldens carry
                   it too (main's gallery.pdf p27 and #2515's re-render are identical).
       where     — lib/core/pdf-compose: the font subset and the text run's glyph positions.
                   The decision note says the subset keeps the OpenType features a slide asks
                   for, so `tnum` digits are tabular (2026-09-27-studio-export-one-engine.md,
                   the tabular-figures fix).
       hypothesis — UNVERIFIED: the `tnum` alternates are GSUB-substituted glyphs with no cmap
                   entry, so ToUnicode has nothing for them (they drop out of the text layer),
                   and the run is positioned with the default digits' advances rather than the
                   tabular ones (they land in the wrong place).
       done when — a tabular-figure run draws where the screen draws it and copies out as the
                   same digits; pinned by an integration test that renders a `tnum` line and
                   checks both the glyph positions against the screen and the pdftotext output.
       evidence  — #2515's parity sweep (tools/pdf-writer-parity.mjs) on the baseline gallery:
                   the screen and writer rasters of page 27 side by side; pdftotext of that
                   page on main and on #2515.
       verify    — tier 1 maker-checker: an engine transform in lib/core.
```
