---
origin: 2744
priority: P3
recorded: 2026-10-17
area: engine
severity: low
swimlane: engineering/decisions/2026-10-16-mosaico-layout-library.md §8
source: https://github.com/Laticent/lattice/pull/2744#issuecomment-6229753016
---

# Mosaico slice 4: the measure and dom adapters with the stability rule

why now   — lets hosts pack against real element sizes; prerequisite for v2
where     — decision note §8 item 4
done when — adapters exported and documented; the stability rule tested
evidence  — checked on the real Studio (HARD RULE #23), not jsdom alone
verify    — tier 1 checker, because it touches the live preview path
