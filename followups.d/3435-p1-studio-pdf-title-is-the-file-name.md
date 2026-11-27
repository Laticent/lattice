---
origin: 3435
priority: P1
recorded: 2026-11-22
area: website
severity: low
swimlane: engineering/pipeline.md §4a0
deferred: blocked — the owner chose to merge #3435 first and batch the PDF metadata fixes behind one light + dark sign-off (2026-11-22)
source: https://github.com/Laticent/lattice/pull/3435
---

# Studio PDFs carry the file name as their Title, not the deck's title

why now   — The owner opened a Studio PDF's info on an iPhone and saw Title "atlas-expansion-plan", the download slug,
            where the deck's title is "Atlas expansion plan". Phones, file managers and search show this field.
where     — `docs/src/components/studio/export/deck-export.js` `pdfProps(name, …)` sets `title: name`. The image-set
            export in the same file already falls back "front-matter title, then first slide heading, then file name",
            mirroring the CLI (`assembleImageSetPlan` caller, `title: meta?.title || slideTitles.find(Boolean) || name`).
done when — Every Studio PDF path (worker, vector, image, photo) sets Title by that same fallback, as the author wrote
            it (no case change). The file name is used only when the deck has no title and no heading.
evidence  — `pdfinfo` on a light and a dark Studio export of a deck with a `title:`, one with only a heading, one with
            neither.
verify    — A unit test on the title choice; the light + dark PDFs go to the owner (export bytes change).
