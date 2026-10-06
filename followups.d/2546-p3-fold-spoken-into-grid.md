---
origin: 2546
priority: P3
recorded: 2026-10-06
source: https://github.com/Laticent/lattice/blob/main/engineering/decisions/2026-09-28-segno-unified-inline-notation.md
---

# Fold the list-text grammar's `spoken` rule into `grid`

why now   — Segno phase 3 kept chart narration's own matrix-grid reading (`spoken`: any gap,
            untrimmed) beside `parseCell`'s (`grid`: a gap of at most 8, trimmed), because the
            oracle compares each reader's raw output. Narration trims every cell and label first,
            so the two agree on everything a listener hears (300,000 trimmed cells, no difference,
            measured by the phase-3 inversion review). Two rules for one cell is the duplication
            decision 20 exists to end.
where     — lib/core/list-text-grammar.js (`spoken`), lib/core/matrix-grid-cells.js
            (`readGridMarker`), lib/core/chart-narration.js narrateMatrixGrid (`gridCell`).
done when — narration calls `parseCell` (or `grid`), `spoken` and `readGridMarker` are gone, and
            narration of every matrix-grid deck is unchanged.
evidence  — the spoken text of every matrix-grid example deck, before and after, identical; the
            re-freeze with `freeze-list-text.mjs --from-shipped` listing only the `spokenGrid` column.
verify    — tier 1 maker-checker.
