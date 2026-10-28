---
origin: 2936
priority: P2
recorded: 2026-10-28
area: engine
severity: medium
swimlane: engineering/decisions/2026-10-26-fonts-policy.md
source: https://github.com/Laticent/lattice/pull/2936
---

# A slide the author's CSS hides exports as a blank slide; every export should skip it, with pagination and the section rail designed for it

why now   — Lattice has no hide-slide feature, so a hidden slide is one CSS hides (`display: none`). Measured on PR 2936 against main
            (992664b): the Studio exports it as a blank slide (a 3-slide PowerPoint whose slide 2 is a 1 x 1 picture, a 3-page PDF);
            the CLI does the same for PNG, image sets, PowerPoint and LibreOffice, while its PDF writer prints with Chrome on a
            zero-size slide and leaves it out. The owner's ruling (2026-10-28): hidden slides are skipped, and the design must
            cover pagination and the section rail. PR 2936 first turned the blank slide into an error and backed that out.
where     — One shared list of the slides an export carries, used by every enumeration: 18 `section[data-lattice-slide]` sites in
            `lattice.js`, 4 in `lib/export/`, and `sectionsOf` in `docs/src/components/studio/export/deck-export.js`. Speaker notes,
            alt text (`exportPptx` refuses a record/section length mismatch) and the reopenable source bind slides by index.
            Pagination (`lib/engine/slides.js` counts every slide, hidden ones included) and the section rail decide what a
            skipped slide does to the numbers the remaining slides show.
done when — A design note answers: is hiding a CSS accident or an authoring feature (a `hidden`/`skip` directive), does a skipped
            slide keep its page number, and does the section rail count it. Then every format in both hosts leaves a hidden
            slide out, notes and alt text stay with their own slides, and the numbers follow the design.
evidence  — The three-slide probe above, run through the Studio module chain (Chromium against `astro dev`) and the CLI.
verify    — The same probe exported to PDF, PowerPoint, LibreOffice, PNG and image sets in both hosts: two slides each, slide 3's
            notes on slide 3, and page numbers as the design says.
