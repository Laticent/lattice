---
origin: 2361
priority: P2
recorded: 2026-09-29
---

# `compare-code` sets its code at the chrome size

why now   — `compare-code` sets `pre > code` in `--fs-meta` (11.25pt at laptop), one step
            below `code` (13.5pt), so two panes side by side read smaller than one. The owner
            ruled on 2026-09-29 that code keeps `--fs-body-compact` (`engineering/decisions/2026-09-29-one-reading-size-per-venue.md` §5.2, §7).
where     — lib/components/code/compare-code/compare-code.styles.css (`pre > code`); its
            manifest's `venueCapacity.lines`.
done when — `npm run audit:reading-size -- --only=code,compare-code` shows both at the same
            role, and `venueCapacity.lines` holds the re-measured 17 / 14 / 13 / 11
            (laptop / huddle / conference / hall).
evidence  — the audit line before and after, and the compare-code gallery page rendered.
verify    — self-review with the gates.
