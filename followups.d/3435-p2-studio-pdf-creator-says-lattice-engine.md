---
origin: 3435
priority: P2
recorded: 2026-11-22
area: website
severity: low
swimlane: engineering/pipeline.md §4a0
deferred: blocked — the owner chose to merge #3435 first and batch the PDF metadata fixes behind one light + dark sign-off (2026-11-22)
source: https://github.com/Laticent/lattice/pull/3435
---

# Studio PDFs name their creator "Lattice · lattice-engine"

why now   — The PDF's Creator field (iPhone: "Content Creator") reads "Lattice · lattice-engine". "lattice-engine" is an
            internal renderer id that a reader does not recognize; the app that made the file is Lattice Studio.
where     — `deck-export.js` `pdfProps` builds `creator` as "Lattice · " plus `engineLabel()`. The machine-readable engine id
            stays in `keywords` (`engine=lattice-engine`), so Creator can be for people.
done when — Creator reads "Lattice Studio" plus the version when one is known (see P3). Keywords still carry `engine=`.
            Producer ("Lattice pdf-compose (pdf-lib)") stays: it names the writer honestly.
evidence  — `pdfinfo` before and after on one Studio export.
verify    — Batched with P1 and P3 behind one owner sign-off on light + dark PDFs.
