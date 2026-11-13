---
origin: 3131
priority: P3
recorded: 2026-11-12
area: engine
severity: low
swimlane: engineering/typography.md
deferred: off-path — the masthead's eyebrow, not a chart; main shows the same overlap
source: https://github.com/Laticent/lattice/pull/3131
---

# A long eyebrow wraps onto the title on a 4:5 page

why now   — seen while checking chart notes on `examples/callouts-schedule.md` p4 and p5 at 4:5 (2026-11-12): the
            eyebrow "LATTICE · CALLOUTS ON PLANS AND NETWORKS · PLACED BY MEASURE" wraps to a second line, and that
            line prints over the title. `main` renders the same overlap, so #3131 did not cause it.
where     — the slide masthead (eyebrow over title), lib/base; the deck header line.
done when — a wrapping eyebrow pushes the title down (or is cut to one line on purpose) on every page shape, and
            callouts-schedule.md p4 and p5 at 4:5 show no overlap.
