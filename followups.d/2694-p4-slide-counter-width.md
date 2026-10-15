---
origin: 2694
priority: P4
recorded: 2026-10-14
area: website
severity: low
swimlane: engineering/development.md
source: https://github.com/Laticent/lattice/pull/2694
---

# The Studio slide counter widens by 0.75px at three-digit counts

why now   — studio-reserved-slots.spec.ts:156 fails on main 82c7247: "Slide 100 / 999" draws
            78.75px where the reserved range's other samples draw 78px, so a deck past 99
            slides shifts the row.
where     — docs/e2e/studio-reserved-slots.spec.ts:156; the slide-counter slot's reserved width.
done when — the counter reserves a width that holds every count in its range, or the spec
            accepts sub-pixel rounding with a stated tolerance.
evidence  — the failure message lists 78 / 78 / 78 / 78.75px for the four samples.
verify    — CI= npx playwright test --project=desktop e2e/studio-reserved-slots.spec.ts:156
