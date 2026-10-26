---
origin: 2899
priority: P2
recorded: 2026-10-25
area: engine
severity: medium
swimlane: engineering/decisions/2026-07-27-family-stamp-replaces-container-queries.md
source: https://github.com/Laticent/lattice/pull/2899
---

# check:family-conformance fails on main: the record predates two new components

why now   — found while gating #2899; `npm run check:family-conformance` exits 1 with the same 59 diff lines on
            `main` (919689d) and on the branch. The record has no rows for `contact` and `wifi`, and still lists
            `state-chart`, which is no longer a family-reflowing component. No row reads `fires -> inert`.
where     — tools/check-family-tiers.js and its committed conformance record.
done when — someone reads the diff, confirms no tier stopped firing, and re-blesses the record, so the check exits 0
            on `main`.
evidence  — the check's output before and after the re-bless.
verify    — npm run check:family-conformance
