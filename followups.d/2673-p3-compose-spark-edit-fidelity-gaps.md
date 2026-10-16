---
origin: 2673
priority: P3
recorded: 2026-10-13
area: website
severity: low
swimlane: engineering/decisions/2026-10-13-compose-inline-notation-editors.md
source: https://github.com/Laticent/lattice/pull/2673
---

# A spark number edit rewrites the author's spacing and trailing zeros

```text
  P3 · [no ticket] Keep the author's spacing and number spelling when one spark number changes
       why now   — The spark editor promises that an edit changes only the word that changed. Two cases break that. Editing one number box writes the whole series with single spaces, so `~{12  14  17}` becomes `~{12 14 18}`. The ratio boxes show parsed numbers, so an edit to `~{72.50/80}` writes `~{72.5/80}`. Neither changes what the slide draws; both change bytes the author wrote.
       where     — docs/src/components/studio/SparkPanel.tsx (`writeCells`, `writeRatio`), lib/plugins/sparks/sparks.inline.js (`editSpark`'s `data` axis).
       done when — a cell edit replaces only that token's bytes and a ratio edit keeps the untouched side's spelling, with a corpus test that a no-op edit and a one-cell edit leave every other byte alone.
       evidence  — a test over every spark in the shipped decks, with a deliberately irregular one added.
       verify    — tier 1 checker, because the writer rewrites deck source.
```
