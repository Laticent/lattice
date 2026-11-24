---
origin: 3415
priority: P2
recorded: 2026-11-22
area: engine
severity: medium
swimlane: engineering/pipeline.md
deferred: off-path — already on main, byte for byte; the fix changes exported PPTX bytes, so it needs the owner's export sign-off on its own branch from main (HARD RULES #17, #18)
source: https://github.com/Laticent/lattice/pull/3415
---

# Editable PPTX paints a chip's text white on a white highlight on a light-ink image card

why now   — The editable PPTX writes an inline code chip as a run highlight. On an image card
            with light ink (`image statement image-card-bottom image-card-band image-card-65
            image-card-light`, slide 5 of examples/image-card-own-classes.md), both the highlight
            and the run's text come out `FFFFFF`, so the chip reads as a blank white box. The
            chip's real background is a translucent light over the dark card. The writer seems to
            drop the alpha, which leaves white highlight under white text.
proof     — `main` (old classes `at-bottom band card-o65 ink-light`) and PR #3415 (new classes)
            write the same `ppt/slides/slide1.xml`: the defect predates the rename.
where     — the chip highlight writer in the editable PPTX path (the "approximated: N inline chip
            as highlights" line in the export summary).
done when — a chip on a light-ink or dark card keeps contrast in PowerPoint, measured against the
            highlight it writes (flatten the alpha onto the card's fill, or drop the highlight
            when it cannot clear contrast).
evidence  — the band slide exported before and after, opened in LibreOffice and PowerPoint;
            dark and light renders sent for export sign-off.
verify    — tier 1 checker; export change, so the owner signs off.
