---
origin: 2361
priority: P3
recorded: 2026-10-06
area: inventory
severity: low
swimlane: engineering/decisions/2026-09-25-font-scale-fit.md
---

# glossary's bare huddle row measures 7 on a 4k deck, and is stored as 8

why now   — font-scale-fit.md Amendment (9) re-measured glossary on the strict basis
            (`calibrate-capacity glossary --scale l --size 4k`): bare, huddle holds 7 up to 13
            words, not 8. A 4k `venue: huddle` deck with eight short glossary terms clips, and
            neither lint nor `glossary: auto` pagination says so. On a 720-high deck 8 fit.
where     — lib/components/inventory/glossary/glossary.manifest.json (`venueCapacity.byWords`,
            huddle); lib/core/glossary-auto.mjs `GLOSSARY_VENUE_ROWS` (the mirror, pinned by
            test/unit/core/glossary-auto.test.js)
done when — the owner decides whether `glossary: auto` pages at the strict count (one more page
            on some huddle exports) or reads the deck's size; the row and its mirror land together
evidence  — a huddle export of a `glossary: auto` deck before and after, dark and light (an
            export change: CLAUDE.md QUALITY BAR sign-off)
verify    — owner sign-off on the export
