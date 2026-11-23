---
origin: 3435
priority: P3
recorded: 2026-11-22
area: website
severity: low
swimlane: engineering/pipeline.md §4a0
deferred: blocked — the owner chose to merge #3435 first and batch the PDF metadata fixes behind one light + dark sign-off (2026-11-22)
source: https://github.com/Laticent/lattice/pull/3435
---

# Studio PDFs' Subject drops the Lattice version and the theme

why now   — A Studio PDF's Subject reads "Rendered by lattice-engine · Lattice · 3 slides". `provenance()` is written
            to add "Lattice <version>" and "theme <palette>/<mode>", so in Studio exports both are missing.
where     — `deck-export.js` `provenance(meta)` reads `meta.version` and `meta.palette`; the image-set export in the
            same file passes `meta?.engineVersion`, so the Studio's meta may carry `engineVersion`, not `version`, and
            may not carry `palette` on the PDF path. Not yet confirmed which.
done when — The cause is named (wrong field name, or a value the Studio never passes) and the Subject and Keywords
            carry the version and theme on every Studio PDF path, or the code stops promising them.
evidence  — `pdfinfo` Subject/Keywords on a light and a dark Studio export, before and after.
verify    — A unit test on `provenance` with the meta the Studio really builds; batched with P1 and P2.
