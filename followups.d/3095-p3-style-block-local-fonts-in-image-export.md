---
origin: 3095
priority: P3
recorded: 2026-11-09
area: engine
severity: low
swimlane: engineering/decisions/2026-11-09-type-hierarchy-study.md
deferred: off-path — found while mocking type pairings; the type work does not need it (shipped fonts go through the font manifest), and it may be a deliberate local-file guard
---

# A deck's own `@font-face` in `style:` loads in HTML but not in PNG or PDF

why now   — the type study's first round of mockups declared fonts in a deck's `style:` block with a relative `url('fonts/x.woff2')`. `lattice deck.md deck.html` loaded them; `lattice deck.md deck.png` drew every slide in a Times-like fallback and printed no warning. A silent fallback in an export is the worst way to find out.
where     — the CLI's PNG / PDF render path versus its HTML path (`lib/export/`); whatever resolves or blocks local `url()` references in author CSS (`lib/core/remote-ref.js` and the export's file handling).
done when — either the image and PDF paths load the same local fonts the HTML path does, or they refuse them on purpose and `lattice` prints a warning naming the font it skipped, and the pipeline doc says which.
evidence  — reproduce with a one-slide deck whose `style:` declares `@font-face { font-family: X; src: url('fonts/x.woff2') }` and sets `--font-display: X`; render to `.html` and `.png` and compare the heading.
verify    — tier 1: the render on both paths, and a unit test of the warning if that is the fix.
