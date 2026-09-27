---
origin: 2361
priority: P3
recorded: 2026-09-27
---

# Measure `compare-code` and `obligation-matrix` per venue

why now   — they are the two components whose manifest `venueCapacity.none` says "not measured
            yet" rather than "no count axis". Every other component has a measured row or a
            reason it cannot have one (2026-09-25-font-scale-fit.md, Amendment 2026-09-27).
where     — tools/lib/calibrate-core.js BUILDERS (+ BODY_WRAP): `compare-code` is two labeled
            fences side by side (its budget is a line count per pane, like `code`'s
            `venueCapacity.lines`); `obligation-matrix` is a state-marker table (a row builder
            like `table`'s, with its marker cells). Then the two manifests.
done when — both carry a measured `venueCapacity` (or a `none` that names a real reason), and
            `lint:deck` reads the code-pane one if it becomes `lines`.
evidence  — the `calibrate-capacity.js <c> --family wide [--scale l|xl|2xl]` runs.
verify    — tier 0: `node --test test/unit/components/venue-capacity.test.js`.
