---
origin: 3021
priority: P12
recorded: 2026-11-04
area: engine
severity: low
swimlane: engineering/decisions/2026-06-23-read-across-carousel.md
deferred: off-path — found while verifying roadmap@story paginates for the check:family-tiers re-bless; the re-bless does not touch roadmap's split cover
source: https://github.com/Laticent/lattice/pull/3021
---

# roadmap's split cover reads "Phase 01 Phase 01 →"

why now   — the baseline gallery's roadmap slide (a table whose header cells read `Phase 01`, `Phase 02`, `Phase 03`) split at `size: story` gives a cover whose lead-in line reads "Phase 01 Phase 01 →". The phase pages behind it print the header twice too, as the `PHASE 01` eyebrow and the `Phase 01` name. The splitter seems to take a phase's label and its name from the same header cell, so a header with no separate name repeats itself.
where     — lib/core/carousel.js (the roadmap strategy's cover intro) and roadmap's split recipe in its manifest.
done when — a roadmap whose header cells hold only a phase label shows that label once on the cover and once per phase page.
evidence  — render the first roadmap slide of test/integration/baseline-decks/gallery.md at `size: story` with splitting on, then look at page 1.2.
verify    — the cover's intro line and each phase page show the phase label once.
status    — the cover half is fixed by #3430 (`labelOf` names the member by its heading's `data-label`): the gallery's first roadmap slide at `size: story` reads "Phase 01 →" on the cover, where main 7789cce reads "Phase 01 Phase 01". The phase pages still print the label twice (the `PHASE 01` eyebrow and the `Phase 01` name), which stays open.
