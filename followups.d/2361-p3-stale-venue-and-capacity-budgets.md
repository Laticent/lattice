---
origin: 2361
priority: P3
recorded: 2026-09-29
---

# Re-derive kanban's and timeline-list's venue budgets, which do not reproduce

why now   — found while re-measuring budgets for one reading size
            (`engineering/decisions/2026-09-29-one-reading-size-per-venue.md` §6.2), and not
            caused by it: the same numbers fail on `main`. `kanban`'s and `timeline-list`'s
            committed `venueCapacity` do not reproduce with `calibrate-capacity --max 20`
            (kanban at 15 words, huddle: committed 4, measured 20, the rig never overflows).
            The `capacity.hard` half of §6.2 is `2378-p3-capacity-hard-above-measured.md`.
where     — the two manifests' `venueCapacity`; the kanban and timeline-list probe builders
            in tools/lib/calibrate-core.js.
done when — re-running the kanban and timeline-list rows reproduces the committed
            `venueCapacity`, or the manifest is updated and the old number's source recorded.
evidence  — the calibrate output before and after, per component.
verify    — self-review with the gates.
