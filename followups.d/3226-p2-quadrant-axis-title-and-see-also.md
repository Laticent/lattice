---
origin: 3226
priority: P2
recorded: 2026-11-15
area: chart
severity: medium
swimlane: engineering/decisions/2026-10-28-fit-everywhere-model.md
deferred: off-path — a pre-existing clip in a separate component this diff does not touch; it was already rising on Nov 13, before #3190, and gets its own PR, demo deck and review (#17)
source: https://github.com/Laticent/lattice/pull/3226
---

# quadrant: the y-axis title loses its first line, and the See-also list overflows at hall

why now   — two rises on quadrant: s7 square@hall (clip 1 to 2) and s14 at square@hall and portrait@hall.
where     — lib/plugins/chart-family/kinds/quadrant/ (the y-axis title wrap); quadrant.gallery.md s14, a See-also prose list.
done when — quadrant s7 renders "ABILITY TO EXECUTE" in full, s14 no longer overflows at hall, and both cells score at or below their baseline.
evidence  — s7: the probe names `Ability to` as cut text, and the render shows only "EXECUTE". s14: the page overflows by 98 px at square@hall.
verify    — `node tools/fit-harness.js --sizes square,portrait,story --venues laptop,hall --packs none --edits none --only quadrant/ --ratchet test/fit/baseline.json`
