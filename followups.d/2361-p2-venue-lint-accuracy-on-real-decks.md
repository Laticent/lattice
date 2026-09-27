---
origin: 2361
priority: P2
recorded: 2026-09-27
---

# `capacity-scale` on a real deck: half its warnings miss, and it claims clips that do not happen

why now   — tested on the agentic-practices talk (PR #2399), lint vs the export's trim list, per
            venue: huddle 7 right / 10 false / 8 missed; conference 16 / 6 / 14; hall 27 / 4 / 18.
            Two causes, both measured on that deck:
            • FALSE, and worded as a clip: every false warning is a `list takeaway` slide. The `list`
              row is measured on the default register, and at 14 words it says "holds about 3 … even
              at the designed size … it is clipped" (10 such claims per venue) — the laptop export
              clips none of them. The variant holds more than the bare component.
            • MISSED: 13 of the 14 missed slides at conference carry an `insight-*` callout
              (list-steps, cards-grid, code, compare-prose, …), whose height the bare-component rows
              never saw; the rest have no count row (compare-prose, matrix-2x2 lint no count).
where     — lib/authoring/lint-core.js (the `capacity-scale` rule and its "even at the designed
            size" branch); tools/lib/calibrate-core.js (measure with a trailing insight callout, and
            the `list takeaway` register); the manifests' `venueCapacity`.
done when — on the talk at each venue, lint's warnings match the export's trim list closely
            enough to trust (target set by the owner), and no warning claims a clip the laptop
            export does not show.
evidence  — the per-venue right/false/missed table before and after, on the talk and the galleries.
verify    — tier 1 checker: shared lint kernel (#7).
